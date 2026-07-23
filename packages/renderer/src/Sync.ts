import {
	RenderTarget,
	ThreeRaw as THREE,
	Scene as ThreeScene,
} from "@effect-motion/three";
import { Context, Effect } from "effect";
import {
	Color,
	type EffectMotionError,
	type Entity,
	Runner,
} from "effect-motion";
import * as Font from "effect-motion/Font";
import * as ImageResource from "effect-motion/Image";
import * as Projection from "effect-motion/Projection";
import type { Frame } from "effect-motion/Scene";
import type {
	EntityRenderer,
	Leaf,
	RenderContext,
	Retained,
	World,
} from "./EntityRenderer.js";
import * as Images from "./Images.js";
import { RenderException } from "./RenderException.js";
import * as Text from "./Text.js";

/**
 * The GPU-free half of rendering: turning frames into a retained three
 * scene.
 *
 * @remarks
 * Everything here is plain three objects and no GPU, which is what makes
 * the whole frame-to-scene-graph path testable without a device.
 * `Renderer.make` and the Node adapter each wire a `Sync` to a real WebGPU
 * renderer; this module never draws anything itself.
 *
 * Each frame runs four phases:
 *
 * 1. **Cameras** — resolve the world camera (including its point-of-interest
 *    aim) into three's coordinate conventions, and set the background.
 * 2. **Walk** — descend the instance tree, folding ancestor translations
 *    into each leaf's world position and routing HUD subtrees to their own
 *    tier.
 * 3. **Diff** — build objects that are new, update ones that changed,
 *    dispose ones that left.
 * 4. **Billboards** — turn billboarded objects to face their tier's camera.
 *
 * This is the hot path — it runs per frame over every instance — so the
 * inner loops are deliberately raw synchronous mutation rather than Effect
 * combinators.
 *
 * Scene-graph violations throw from inside the recursive walk and are caught
 * once at {@link syncFrame}'s seam, where they become a typed
 * `RenderException`. Threading a result type through every level of a
 * descent would cost checking and re-propagation at each step for a case
 * that always aborts.
 */

const NEAR = 1;
const FAR = 1_000_000;

type AnyFrame = Frame<unknown>;
/**
 * A renderer as the REGISTRY holds it. Each concrete renderer accepts only
 * its own entity's data, so a heterogeneous registry is contravariant and
 * cannot be read at any single entity type. The walk has already matched the
 * leaf's `_tag` to its registry key by the time it dispatches, so the pairing
 * is correct by construction — `dispatch` below is where that fact is
 * asserted, once, rather than at each call site.
 */
type AnyEntityRenderer = EntityRenderer<never>;

/** the renderer for a leaf, with the tag↔renderer pairing asserted once */
const dispatch = (renderer: AnyEntityRenderer) =>
	renderer as unknown as EntityRenderer<Entity.Entity>;

// ── coordinate mapping ────────────────────────────────────────────────────
// Scene space: x right, y down, origin top-left, +z toward the viewer,
// camera at rest on +z looking down -z. Three space: x right, y up, +z
// toward the viewer. Mapping: shift origin to the viewport center, flip y,
// keep z. Rotations conjugate accordingly (derived from Projection.ts's
// rotate/rotateInverse conventions):
//   objects (N = diag(1,-1,1)):  R_three = Rz(-rz)·Ry(ry)·Rx(-rx)
//   camera  (M = diag(1,-1,-1)): R_three = Rz(-rz)·Ry(-ry)·Rx(rx)
// Three's Euler order "ZYX" composes exactly Rz·Ry·Rx.

// unit plane with a TOP-LEFT origin (matches the Builtins module's anchor)
const unitPlaneShared = new THREE.PlaneGeometry(1, 1);
unitPlaneShared.translate(0.5, -0.5, 0);

interface RetainedEntry {
	readonly renderer: AnyEntityRenderer;
	readonly retained: Retained;
	/** which tier owns the object: world scene or the screen-space HUD */
	readonly hud: boolean;
	lastData: unknown;
	lastWorld: World;
}

/** Diagnostics for the last synced frame. */
export interface SyncStats {
	/** How many objects are currently retained. */
	objects: number;
	/** How long the last sync took, in milliseconds. */
	lastSyncMs: number;
}

/**
 * The depth-of-field request derived from a frame's camera.
 *
 * @remarks
 * Currently computed but NOT consumed: depth-of-field rendering is not
 * implemented, and both render paths draw every frame sharp. The values are
 * kept in step with the camera so the feature can be rebuilt without
 * re-deriving them.
 */
export interface DofState {
	/** Whether the camera asked for DoF (`aperture` and `focusDistance` both > 0). */
	on: boolean;
	/** View-space distance to the intended sharp plane. */
	focusDistance: number;
	/** Blur radius in uv units, derived from the aperture; 0 is off. */
	strengthUv: number;
}

/**
 * A nested scene (from `Scene.play`) as the renderer holds it.
 *
 * @remarks
 * A sub-composition is drawn to its OWN render target and the result is
 * pasted onto a plane in the parent scene, like a precomp in After Effects.
 * That is what lets a whole nested scene be moved, faded, or scaled as one
 * object, and what makes its background and bounds mean something.
 *
 * The child renders through its own identity camera, so its content is
 * flattened before compositing: depth inside a nested scene does not react
 * to the outer camera.
 *
 * ponytail: world-camera parallax inside a precomp would need a frustum-clip
 * design if a scene ever wants it.
 */
export interface CompState {
	readonly sync: Sync;
	/** billboarded holder at the group's world anchor (in a scene tier) */
	readonly holder: THREE.Group;
	/** carries the group's 2D affine about the bounds center */
	readonly transformHolder: THREE.Group;
	readonly plane: THREE.Mesh;
	readonly material: THREE.MeshBasicNodeMaterial;
	/** created/resized by the render path (GPU-side) */
	rt: RenderTarget.RenderTarget | null;
	width: number;
	height: number;
	hud: boolean;
}

/**
 * The retained scene state: the world and HUD tiers, their cameras, the
 * text and image actors, live sub-compositions, and the object diff map.
 *
 * @remarks
 * Mostly data — the API is the sibling functions ({@link syncFrame},
 * {@link whenReady}, {@link resolveResources}, {@link dispose}).
 *
 * Content lives in one of two tiers. The WORLD scene is drawn through the
 * frame's camera, so it moves with it; the HUD scene is drawn through an
 * identity camera, above everything, so it stays fixed to the glass.
 */
export interface Sync {
	/** the world scene, branded — the render paths take the wrapper */
	readonly scene: ThreeScene.Scene;
	readonly camera: THREE.PerspectiveCamera;
	/**
	 * The screen-space HUD tier: drawn through an identity camera, after and
	 * above world content, on a transparent background so the render paths
	 * can overlay it.
	 */
	readonly hudScene: ThreeScene.Scene;
	readonly hudCamera: THREE.PerspectiveCamera;
	readonly stats: SyncStats;
	/**
	 * Depth-of-field request derived from the frame's camera — currently
	 * derived but not drawn. See {@link DofState}.
	 */
	readonly dof: DofState;
	/** the renderer's SDF text actor (fonts, atlas, layout) */
	readonly text: Text.Text;
	/** decoded image textures, cached for this renderer's scope */
	readonly images: Images.Images;
	/** live sub-compositions, keyed by their group instance id */
	readonly comps: Map<string, CompState>;
	/** internal: entity renderers by entity name */
	readonly registry: Record<string, AnyEntityRenderer>;
	/** internal: retained objects by instance id */
	readonly retained: Map<string, RetainedEntry>;
	/** internal: reused background color instance */
	readonly background: THREE.Color;
	/** internal: current frame viewport */
	width: number;
	height: number;
	/** internal: the context handed to entity renderers */
	readonly ctx: RenderContext;
	/** internal: async work (SDF layouts, decodes) the next render must
	 * wait for — drained by `whenReady` */
	readonly pending: Array<Effect.Effect<unknown, EffectMotionError>>;
}

export const make = (registry: Record<string, AnyEntityRenderer>): Sync => {
	const camera = new THREE.PerspectiveCamera(50, 1, NEAR, FAR);
	camera.rotation.order = "ZYX";
	const base = {
		// makeUnsafe: this Sync owns the scenes' lifetime through its own
		// dispose, so they are not separately scope-registered
		scene: ThreeScene.makeUnsafe(new THREE.Scene()),
		camera,
		hudScene: ThreeScene.makeUnsafe(new THREE.Scene()),
		hudCamera: new THREE.PerspectiveCamera(50, 1, NEAR, FAR),
		stats: { objects: 0, lastSyncMs: 0 },
		dof: { on: false, focusDistance: 0, strengthUv: 0 },
		text: Text.make(),
		images: Images.make(),
		comps: new Map<string, CompState>(),
		registry,
		retained: new Map<string, RetainedEntry>(),
		background: new THREE.Color(),
		width: 0,
		height: 0,
		pending: [] as Array<Effect.Effect<unknown, EffectMotionError>>,
	};
	const ctx: RenderContext = {
		toThree: (x, y, z) =>
			new THREE.Vector3(x - base.width / 2, -(y - base.height / 2), z),
		get width() {
			return base.width;
		},
		get height() {
			return base.height;
		},
		waitFor: (work) => {
			base.pending.push(work);
		},
		text: base.text,
		images: base.images,
	};
	return Object.assign(base, { ctx });
};

/**
 * Wait for the async work a sync registered — glyph layouts and image
 * decodes — including inside nested sub-compositions.
 *
 * @remarks
 * Both render paths call this before drawing, which is what guarantees a
 * frame never presents half-built text or a missing texture. A failed layout
 * or decode surfaces as a typed error naming the resource, rather than
 * silently rendering nothing.
 */
export const whenReady = (sync: Sync): Effect.Effect<void, EffectMotionError> =>
	Effect.suspend(() => {
		const pending = sync.pending.splice(0, sync.pending.length);
		const nested = [...sync.comps.values()].map((comp) => whenReady(comp.sync));
		return pending.length === 0 && nested.length === 0
			? Effect.void
			: Effect.all([...pending, ...nested], {
					concurrency: "unbounded",
					discard: true,
				});
	});

/**
 * Phase 1 — cameras, background, and the DoF request.
 *
 * The world camera resolves its point-of-interest aim and conjugates into
 * three's space; the HUD camera is the identity view, so z=0 HUD content
 * lands exactly where authored regardless of where the world camera went.
 */
const syncCameras = (sync: Sync, frame: AnyFrame): void => {
	const origin = { x: frame.width / 2, y: frame.height / 2 };
	const camera = Projection.resolveCamera(frame.camera, origin);
	sync.camera.position.set(camera.x, -camera.y, camera.z);
	sync.camera.rotation.set(camera.rotX, -camera.rotY, -camera.rotZ);
	sync.camera.aspect = frame.width / frame.height;
	sync.camera.fov =
		(2 * Math.atan(frame.height / (2 * camera.focalLength)) * 180) / Math.PI;
	sync.camera.updateProjectionMatrix();

	const hudFocal = Projection.defaultFocalLength(frame.width);
	sync.hudCamera.position.set(0, 0, Projection.defaultCameraZ(hudFocal));
	sync.hudCamera.rotation.set(0, 0, 0);
	sync.hudCamera.aspect = frame.width / frame.height;
	sync.hudCamera.fov =
		(2 * Math.atan(frame.height / (2 * hudFocal)) * 180) / Math.PI;
	sync.hudCamera.updateProjectionMatrix();
	ThreeScene.setBackground(sync.hudScene, null);

	const bg = Color.bytes(frame.backgroundColor);
	sync.background.setRGB(
		bg.r / 255,
		bg.g / 255,
		bg.b / 255,
		THREE.SRGBColorSpace,
	);
	ThreeScene.setBackground(sync.scene, sync.background);

	sync.dof.on = camera.aperture > 0 && camera.focusDistance > 0;
	sync.dof.focusDistance = camera.focusDistance;
	// aperture → uv-space CoC scale, matched against the ThorVG sigma
	// curve (sigma = aperture·f·|d−F|/(d·F) ≈ aperture·|d−F|/F at rest):
	// blur radius ≈ 2σ → strength = 2·aperture / viewport height.
	sync.dof.strengthUv = (camera.aperture * 2) / frame.height;
};

/** What one pass of the tree walk produced. */
interface WalkResult {
	readonly leaves: ReadonlyArray<{ leaf: Leaf; hud: boolean }>;
	/** comp ids seen this frame — anything absent is disposed */
	readonly seenComps: ReadonlySet<string>;
}

/**
 * Phase 2 — walk the instance tree, collecting leaves and syncing comps.
 *
 * Containers contribute translation and recurse; sized groups become
 * comps; everything else is a leaf. HUD subtrees route to the screen-space
 * tier. THROWS on scene-graph violations — see the module doc.
 */
const walkTree = (sync: Sync, frame: AnyFrame): WalkResult => {
	const leaves: Array<{ leaf: Leaf; hud: boolean }> = [];
	const visited = new Set<string>();
	const seenComps = new Set<string>();

	const walk = (
		id: string,
		offset: World,
		hud: boolean,
		inWorldContainer: boolean,
	): void => {
		if (visited.has(id)) {
			throw new Error(
				`Renderer: instance "${id}" is referenced more than once (duplicate parent or cycle)`,
			);
		}
		visited.add(id);
		const entry = frame.instances[id];
		if (entry === undefined) {
			throw new Error(`Renderer: unknown instance id "${id}"`);
		}
		// `visible` is an ordinary field on every paintable entity now; the
		// camera is the one member without it, and never reaches the walk
		if ("visible" in entry.data && !entry.data.visible) {
			return;
		}
		const isHud = entry.data._tag === "Hud";
		if (isHud && inWorldContainer) {
			throw new Error(
				`Renderer: Hud "${id}" is nested inside world content — a Hud must be a top-level child of the root (or of another Hud)`,
			);
		}
		const subtreeHud = hud || isHud;
		const local = entry.data.position;
		const world: World = {
			x: offset.x + local.x,
			y: offset.y + local.y,
			// a Hud's z is depth WITHIN the screen-space tier (design D12); it
			// composes exactly like world depth, just in the HUD scene
			z: offset.z + local.z,
		};
		const childIds = childIdsOf(entry.data);
		if (childIds.length > 0 || isHud) {
			// a comp is DECLARED by Scene.play, not inferred from a group
			// carrying a size (design D13)
			const size = frame.comps[id] ?? null;
			if (size !== null) {
				syncComp(sync, id, entry.data, size, world, subtreeHud, frame);
				seenComps.add(id);
				return;
			}
			// a pure container: contribute position, recurse, render
			// nothing itself. ponytail: translation-only, matching the
			// ThorVG walk — a Group's 2D affine transform is not yet
			// threaded into child world coords.
			for (const childId of childIds) {
				walk(childId, world, subtreeHud, inWorldContainer || !subtreeHud);
			}
			return;
		}
		leaves.push({
			leaf: { id, data: entry.data, world },
			hud: subtreeHud,
		});
	};

	const rootEntry = frame.instances[frame.root];
	if (rootEntry !== undefined) {
		visited.add(frame.root);
		for (const childId of childIdsOf(rootEntry.data)) {
			walk(childId, { x: 0, y: 0, z: 0 }, false, false);
		}
	}
	return { leaves, seenComps };
};

/**
 * Phase 3 — diff the walked leaves against the retained map: build what
 * is new, update what changed (by reference equality on data and world
 * position), dispose what left the frame. THROWS on an unregistered
 * entity — see the module doc.
 */
const diffRetained = (sync: Sync, walked: WalkResult): void => {
	const seen = new Set<string>();
	for (const { leaf, hud } of walked.leaves) {
		seen.add(leaf.id);
		const existing = sync.retained.get(leaf.id);
		if (existing === undefined) {
			const renderer = sync.registry[leaf.data._tag];
			if (renderer === undefined) {
				throw new Error(
					`no entity renderer registered for "${leaf.data._tag}" — instance "${leaf.id}"`,
				);
			}
			const retained = dispatch(renderer).build(leaf, sync.ctx);
			sync.retained.set(leaf.id, {
				renderer,
				retained,
				hud,
				lastData: leaf.data,
				lastWorld: leaf.world,
			});
			ThreeScene.add(hud ? sync.hudScene : sync.scene, [retained.object]);
			continue;
		}
		const sameData = existing.lastData === leaf.data;
		const sameWorld =
			existing.lastWorld.x === leaf.world.x &&
			existing.lastWorld.y === leaf.world.y &&
			existing.lastWorld.z === leaf.world.z;
		if (!sameData || !sameWorld) {
			dispatch(existing.renderer).update(existing.retained, leaf, sync.ctx);
			existing.lastData = leaf.data;
			existing.lastWorld = leaf.world;
		}
	}
	for (const [id, entry] of sync.retained) {
		if (!seen.has(id)) {
			ThreeScene.remove(entry.hud ? sync.hudScene : sync.scene, [
				entry.retained.object,
			]);
			entry.retained.dispose();
			sync.retained.delete(id);
		}
	}
	for (const [id, comp] of sync.comps) {
		if (!walked.seenComps.has(id)) {
			ThreeScene.remove(comp.hud ? sync.hudScene : sync.scene, [comp.holder]);
			disposeComp(comp);
			sync.comps.delete(id);
		}
	}
};

/**
 * Phase 4 — billboards face their tier's view plane: copy the camera
 * quaternion so a circle stays circular under any camera orbit.
 *
 * ponytail: transparent depth ties break by three's stable sort over
 * deterministic creation order (identical across runs and platforms given
 * the deterministic frame stream); switch to a custom transparent sort
 * keyed by instance id if cross-version stability ever matters.
 */
const syncBillboards = (sync: Sync): void => {
	for (const entry of sync.retained.values()) {
		if (entry.retained.billboard) {
			entry.retained.object.quaternion.copy(
				entry.hud ? sync.hudCamera.quaternion : sync.camera.quaternion,
			);
		}
	}
	for (const comp of sync.comps.values()) {
		comp.holder.quaternion.copy(
			comp.hud ? sync.hudCamera.quaternion : sync.camera.quaternion,
		);
	}
};

/**
 * The raw per-frame kernel: the four phases, unguarded. Internal — comps
 * recurse through this, and their violations propagate to the outermost
 * `syncFrame`'s single catch.
 */
const syncFrameUnsafe = (sync: Sync, frame: AnyFrame): void => {
	const t0 = performance.now();
	sync.width = frame.width;
	sync.height = frame.height;
	syncCameras(sync, frame);
	diffRetained(sync, walkTree(sync, frame));
	syncBillboards(sync);
	sync.stats.objects = sync.retained.size;
	sync.stats.lastSyncMs = performance.now() - t0;
};

/**
 * Bring the retained scenes in step with a frame.
 *
 * @remarks
 * Runs the four phases described in the module overview. Objects are built,
 * updated, or disposed as the frame demands; unchanged ones are skipped by
 * reference equality on their data and world position, so a still scene
 * costs almost nothing to hold.
 *
 * Scene-graph violations arrive as a typed `RenderException` naming the
 * offending instance — never as a thrown exception escaping into the
 * caller's Effect.
 */
export const syncFrame = (
	sync: Sync,
	frame: AnyFrame,
): Effect.Effect<void, RenderException> =>
	Effect.try({
		try: () => syncFrameUnsafe(sync, frame),
		catch: (cause) =>
			RenderException.of(
				cause instanceof Error ? cause.message : "frame sync failed",
				cause,
			),
	});

/** child ids, or none — containers are the only entities with children */
const childIdsOf = (data: Entity.Entity): ReadonlyArray<string> =>
	"children" in data ? data.children : [];

const syncComp = (
	sync: Sync,
	id: string,
	groupData: Entity.Entity,
	compConfig: {
		readonly width: number;
		readonly height: number;
		readonly backgroundColor: Color.Color;
	},
	world: World,
	hud: boolean,
	frame: AnyFrame,
): void => {
	let comp = sync.comps.get(id);
	if (comp === undefined) {
		const material = new THREE.MeshBasicNodeMaterial();
		material.transparent = true;
		material.side = THREE.DoubleSide;
		const plane = new THREE.Mesh(unitPlaneShared, material);
		const transformHolder = new THREE.Group();
		transformHolder.add(plane);
		const holder = new THREE.Group();
		holder.add(transformHolder);
		comp = {
			sync: make(sync.registry),
			holder,
			transformHolder,
			plane,
			material,
			rt: null,
			width: compConfig.width,
			height: compConfig.height,
			hud,
		};
		sync.comps.set(id, comp);
		ThreeScene.add(hud ? sync.hudScene : sync.scene, [holder]);
	}
	comp.width = compConfig.width;
	comp.height = compConfig.height;
	// inner sync: the comp's subtree in comp-local space under the
	// identity camera, with the comp's own background (or transparent).
	// Unsafe: violations inside a comp propagate to the outermost
	// syncFrame's catch, which is the whole point of one seam per frame.
	const background = compConfig.backgroundColor ?? null;
	syncFrameUnsafe(comp.sync, {
		...frame,
		root: id,
		width: compConfig.width,
		height: compConfig.height,
		backgroundColor: background ?? Color.transparent,
		camera: Runner.identityCameraView(compConfig.width),
	});
	if (background === null || Color.bytes(background).a === 0) {
		ThreeScene.setBackground(comp.sync.scene, null);
	}
	// outer placement: top-left-anchored plane, group opacity on the
	// composite, 2D affine about the bounds center (y-down → y-up
	// conjugation: negate b and c off-diagonals and the f translation)
	comp.holder.position.copy(sync.ctx.toThree(world.x, world.y, world.z));
	comp.plane.scale.set(compConfig.width, compConfig.height, 1);
	comp.material.opacity = Math.max(
		0,
		Math.min(1, "opacity" in groupData ? groupData.opacity : 1),
	);
	comp.holder.visible = comp.material.opacity > 0;
	// Group's 2D affine is gone (task 1.3 found the ops→affine DSL was never
	// wired up). A comp's own transform composes like any entity's.
	comp.transformHolder.matrixAutoUpdate = true;
	comp.transformHolder.position.set(0, 0, 0);
	comp.transformHolder.rotation.set(0, 0, 0);
	comp.transformHolder.scale.set(1, 1, 1);
};

const disposeComp = Effect.fnUntraced(function* (comp: CompState) {
	yield* dispose(comp.sync);
	comp.material.dispose();
	if (comp.rt !== null) {
		RenderTarget.dispose(comp.rt);
	}
});

/**
 * Release every retained object, texture, and sub-composition.
 *
 * @remarks
 * Called automatically when a renderer's scope closes; you rarely call it
 * directly. Effectful because decoded image textures live behind Deferreds
 * that may still be in flight.
 */
export const dispose = Effect.fnUntraced(function* (sync: Sync) {
	for (const entry of sync.retained.values()) {
		ThreeScene.remove(entry.hud ? sync.hudScene : sync.scene, [
			entry.retained.object,
		]);
		entry.retained.dispose();
	}
	sync.retained.clear();
	for (const comp of sync.comps.values()) {
		ThreeScene.remove(comp.hud ? sync.hudScene : sync.scene, [comp.holder]);
		disposeComp(comp);
	}
	sync.comps.clear();
	Text.dispose(sync.text);
	yield* Images.dispose(sync.images);
});

/**
 * Load the fonts and images a frame references into the sync actor.
 *
 * @remarks
 * Frames carry resource REFERENCES, never bytes, so the bytes are resolved
 * here from the caller's context. Only resources not already loaded are
 * fetched, so this is cheap to call every frame.
 *
 * The built-in default font is auto-provided beneath caller context, so
 * plain text works with no setup — and providing your own loader under the
 * same `"sans-serif"` id overrides it. Any other font or image with no
 * loader in context is a defect naming the id and the `Font.layer` /
 * `Image.layer` call that would fix it.
 */
export const resolveResources = Effect.fnUntraced(function* (
	sync: Sync,
	frame: AnyFrame,
) {
	const fonts = new Set<string>();
	const images = new Set<string>();
	for (const entry of Object.values(frame.instances)) {
		if (entry.data._tag === "Text") {
			const family =
				entry.data._tag === "Text" ? entry.data.fontFamily.id : null;
			if (family !== null && !Text.hasFont(sync.text, family)) {
				fonts.add(family);
			}
		}
		if (entry.data._tag === "Image") {
			const id = entry.data._tag === "Image" ? entry.data.image.id : null;
			if (id !== null && !Images.has(sync.images, id)) {
				images.add(id);
			}
		}
	}
	if (fonts.size === 0 && images.size === 0) {
		return;
	}
	// the caller's live context — loaders resolve from it by rebuilt tag
	const context = (yield* Effect.context<never>()) as Context.Context<unknown>;
	for (const family of fonts) {
		const provided = Context.getOption(context, Font.Loader(family));
		if (provided._tag === "Some") {
			Text.registerFont(sync.text, family, provided.value.bytes);
		} else if (family === Font.defaultFont.id) {
			Text.registerFont(sync.text, family, yield* Font.loadDefaultBytes);
		} else {
			return yield* Effect.die(
				new Error(
					`Renderer: no font loader provided for "${family}" — provide it via Font.layer(${JSON.stringify(family)}, ...)`,
				),
			);
		}
	}
	for (const id of images) {
		const provided = Context.getOption(context, ImageResource.Loader(id));
		if (provided._tag === "None") {
			return yield* Effect.die(
				new Error(
					`Renderer: no image loader provided for "${id}" — provide it via Image.layer(${JSON.stringify(id)}, ...)`,
				),
			);
		}
		yield* Images.register(sync.images, id, provided.value.bytes);
	}
});
