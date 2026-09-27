import {
	MaskMaterial,
	RenderTarget,
	ThreeRaw as THREE,
	Scene as ThreeScene,
} from "@effect-motion/three";
import { Context, Effect } from "effect";
import { Color, type EffectMotionError, type Entity } from "effect-motion";
import * as Font from "effect-motion/Font";
import * as ImageResource from "effect-motion/Image";
import * as Projection from "effect-motion/Projection";
import type { Frame } from "effect-motion/Scene";
import type {
	EntityRenderer,
	Leaf,
	RenderContext,
	Retained,
	Transform,
	World,
} from "./EntityRenderer.js";
import * as Images from "./Images.js";
import * as MaskPlan from "./MaskPlan.js";
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
 * Each frame runs five phases:
 *
 * 1. **Cameras** — resolve the world camera (including its point-of-interest
 *    aim) into three's coordinate conventions, and set the background.
 * 2. **Walk** — descend the instance tree, composing ancestor transforms
 *    (translate, rotate, scale) and opacities into each leaf and routing
 *    HUD subtrees to their own tier.
 * 3. **Diff** — build objects that are new, update ones that changed,
 *    dispose ones that left.
 * 4. **Paint order** — nudge each leaf toward the camera by its tree rank,
 *    invisibly, so later content wins depth ties (After Effects layer order).
 * 5. **Billboards** — turn billboarded objects to face their tier's camera.
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

/**
 * Paint-order depth step: each leaf is pulled toward its camera by this
 * fraction of its distance per tree rank (see {@link syncLayers}). ~8 float
 * ulps on the reversed-Z depth buffer — resolvable at any distance, far
 * below any visible depth difference.
 */
const LAYER_EPSILON = 1e-6;

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
// Scene space: x right, y up, origin at the viewport center, +z toward the
// viewer, camera at rest on +z looking down -z — axis-identical to three.
// Positions map by the IDENTITY, kept as the named `ctx.toThree` seam so
// the boundary stays explicit. OBJECT rotations pass through unnegated:
// scene Eulers apply X→Y→Z extrinsically (matrix Rz·Ry·Rx — see
// Projection.ts's rotate), which is three's Euler order "ZYX" verbatim.
// The CAMERA still conjugates: the scene view transform flips z before
// rotating (in-front is +z view depth — see Projection.toView), so with
// F = diag(1,1,-1) the three camera matrix is F-conjugated per axis:
//   R_three = Rz(rz)·Ry(-ry)·Rx(-rx)  →  order "ZYX", set(-rx, -ry, rz)

// unit comp plane centered on its anchor (matches the Builtins module's
// anchor), v flipped: three's node materials sample a render target
// top-row-first on both backends (WebGPU natively, WebGL via its flipY
// uniform), so plain PlaneGeometry uvs paint every comp upside-down
const compPlane = new THREE.PlaneGeometry(1, 1);
const compPlaneUv = compPlane.getAttribute("uv");
for (let i = 0; i < compPlaneUv.count; i++) {
	compPlaneUv.setY(i, 1 - compPlaneUv.getY(i));
}

interface RetainedEntry {
	readonly renderer: AnyEntityRenderer;
	readonly retained: Retained;
	/** Sync-owned wrapper in the scene: carries the paint-order homothety,
	 * so the renderer-owned object's transform is never touched */
	readonly layer: THREE.Group;
	/** which tier owns the object: world scene or the screen-space HUD */
	readonly hud: boolean;
	/** the frame's own data (before ancestor opacity) — the diff key */
	lastSource: unknown;
	lastOpacity: number;
	lastTransform: Transform;
}

interface MaskTarget {
	readonly attachment: MaskPlan.Attachment;
	readonly rt: RenderTarget.RenderTarget;
	readonly factor: MaskMaterial.Factor;
}

interface MaskDrawable {
	readonly source: THREE.Mesh;
	readonly material: THREE.MeshBasicNodeMaterial | THREE.Line2NodeMaterial;
	readonly opaque: THREE.Mesh;
	readonly fractional: THREE.Mesh;
	readonly variants: MaskMaterial.Variants;
	readonly signature: string;
	readonly targetIds: ReadonlySet<string>;
}

// ── transform composition ────────────────────────────────────────────────
// Each node's local TRS is position · rotation (Euler "ZYX", see the
// coordinate-mapping note) · scale, about its own position — composed under
// its parent's. `scale` is the per-axis product (shear dropped, as the
// entity-transform spec states); `matrix` is exact, for skeletal points.

const ZERO: World = { x: 0, y: 0, z: 0 };
const ONE: World = { x: 1, y: 1, z: 1 };

const identityTransform = (): Transform => ({
	matrix: new THREE.Matrix4(),
	quaternion: new THREE.Quaternion(),
	scale: new THREE.Vector3(1, 1, 1),
	rotated: false,
});

const composeTransform = (
	parent: Transform,
	data: Entity.Entity,
): Transform => {
	// ponytail: ParticleField (the D10 escape hatch) carries flat x/y/z
	// instead of a nested position; delete the fallback with the rewrite
	const p =
		(data as { position?: World }).position ?? (data as unknown as World);
	const r = "rotation" in data ? data.rotation : ZERO;
	const s = "scale" in data ? data.scale : ONE;
	const quaternion = new THREE.Quaternion().setFromEuler(
		new THREE.Euler(r.x, r.y, r.z, "ZYX"),
	);
	const scale = new THREE.Vector3(s.x, s.y, s.z);
	const matrix = new THREE.Matrix4()
		.compose(new THREE.Vector3(p.x, p.y, p.z), quaternion, scale)
		.premultiply(parent.matrix);
	return {
		matrix,
		quaternion: quaternion.premultiply(parent.quaternion),
		scale: scale.multiply(parent.scale),
		rotated: parent.rotated || r.x !== 0 || r.y !== 0 || r.z !== 0,
	};
};

const sameTransform = (a: Transform, b: Transform): boolean =>
	a.rotated === b.rotated &&
	a.matrix.equals(b.matrix) &&
	a.quaternion.equals(b.quaternion) &&
	a.scale.equals(b.scale);

const worldOf = (transform: Transform): World => {
	const e = transform.matrix.elements;
	return { x: e[12] ?? 0, y: e[13] ?? 0, z: e[14] ?? 0 };
};

/** entity opacity, or 1 for the one entity without it (never walked) */
const opacityOf = (data: Entity.Entity): number =>
	"opacity" in data ? data.opacity : 1;

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
 * Both render paths read it per frame: when `on`, the world draws through the
 * depth-aware DoF post chain with these values as its uniforms; otherwise the
 * plain path runs and the chain is never touched.
 */
export interface DofState {
	/** Whether the camera asked for DoF (`aperture` and `focusDistance` both > 0). */
	on: boolean;
	/** View-space distance to the sharp plane, world units. */
	focusDistance: number;
	/** Lens radius, world units; 0 is a pinhole (off). */
	aperture: number;
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
 * The child renders through its OWN active camera (`frame.comps[id].camera`),
 * exactly as it would standalone — camera moves, depth, and parallax inside
 * the child all show — and the result is clipped to the child's bounds. Its
 * content is flattened before compositing: depth inside a nested scene does
 * not react to the outer camera, which only places the comp's plane.
 *
 * ponytail: outer-camera parallax INSIDE a precomp (AE's collapse
 * transformations) would need a frustum-clip design if a scene ever wants it.
 */
export interface CompState {
	readonly sync: Sync;
	/** holder at the group's world anchor (in a scene tier); billboarded
	 * unless the group's composed transform rotates it */
	readonly holder: THREE.Group;
	rotated: boolean;
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
	/** Mask references for the current composition; null is the unmasked path. */
	maskPlan: MaskPlan.Plan | null;
	readonly maskTargets: Map<string, MaskTarget>;
	readonly maskDrawables: Map<THREE.Mesh, MaskDrawable>;
	readonly domainId: string;
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
	/** Depth-of-field request derived from the frame's camera. See {@link DofState}. */
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

export const make = (
	registry: Record<string, AnyEntityRenderer>,
	/** comps pass the root's actors: `resolveResources` fills only the root,
	 * and the frame's instance map already covers every comp subtree */
	resources: {
		readonly text: Text.Text;
		readonly images: Images.Images;
	} = { text: Text.make(), images: Images.make() },
	domainId = "",
): Sync => {
	const camera = new THREE.PerspectiveCamera(50, 1, NEAR, FAR);
	camera.rotation.order = "ZYX";
	const base = {
		maskPlan: null as MaskPlan.Plan | null,
		maskTargets: new Map<string, MaskTarget>(),
		maskDrawables: new Map<THREE.Mesh, MaskDrawable>(),
		domainId,
		// makeUnsafe: this Sync owns the scenes' lifetime through its own
		// dispose, so they are not separately scope-registered
		scene: ThreeScene.makeUnsafe(new THREE.Scene()),
		camera,
		hudScene: ThreeScene.makeUnsafe(new THREE.Scene()),
		hudCamera: new THREE.PerspectiveCamera(50, 1, NEAR, FAR),
		stats: { objects: 0, lastSyncMs: 0 },
		dof: { on: false, focusDistance: 0, aperture: 0 },
		text: resources.text,
		images: resources.images,
		comps: new Map<string, CompState>(),
		registry,
		retained: new Map<string, RetainedEntry>(),
		background: new THREE.Color(),
		width: 0,
		height: 0,
		pending: [] as Array<Effect.Effect<unknown, EffectMotionError>>,
	};
	const ctx: RenderContext = {
		// scene space is axis-identical to three space — identity, kept as
		// the named boundary seam
		toThree: (x, y, z) => new THREE.Vector3(x, y, z),
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

const releaseDrawable = (sync: Sync, entry: MaskDrawable): void => {
	entry.material.visible = true;
	entry.opaque.parent?.remove(entry.opaque);
	entry.fractional.parent?.remove(entry.fractional);
	MaskMaterial.dispose(entry.variants);
	sync.maskDrawables.delete(entry.source);
};

const releaseDrawablesWithin = (sync: Sync, object: THREE.Object3D): void => {
	const owned: Array<MaskDrawable> = [];
	object.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			const entry = sync.maskDrawables.get(child);
			if (entry !== undefined) owned.push(entry);
		}
	});
	for (const entry of owned) releaseDrawable(sync, entry);
};

/**
 * Bind the current mask factors at each native drawable. Glyph meshes arrive
 * after async layout, so this runs after `whenReady`, just before drawing.
 */
export const prepareMaskDrawables = (sync: Sync): void => {
	const plan = sync.maskPlan;
	if (plan === null) {
		for (const entry of [...sync.maskDrawables.values()])
			releaseDrawable(sync, entry);
		return;
	}
	const seen = new Set<THREE.Mesh>();
	const prepare = (id: string, object: THREE.Object3D): void => {
		const factorRefs = MaskPlan.factorsOf(plan, id);
		const factors = factorRefs.flatMap((attachment) => {
			const target = sync.maskTargets.get(attachment.targetId);
			return target === undefined ? [] : [target.factor];
		});
		if (factors.length === 0) return;
		const signature = factorRefs
			.map((a) => `${a.targetId}:${a.sourceId}:${a.mode}`)
			.join("|");
		object.traverse((drawable) => {
			if (
				!(drawable instanceof THREE.Mesh) ||
				drawable.userData.maskVariant === true
			)
				return;
			const material = drawable.material;
			if (
				!(
					material instanceof THREE.MeshBasicNodeMaterial ||
					material instanceof THREE.Line2NodeMaterial
				)
			)
				return;
			seen.add(drawable);
			let prior = sync.maskDrawables.get(drawable);
			if (
				prior !== undefined &&
				(prior.material !== material || prior.signature !== signature)
			) {
				releaseDrawable(sync, prior);
				prior = undefined;
			}
			if (prior === undefined) {
				const variants = MaskMaterial.makeUnsafe(material, factors);
				const opaque = MaskMaterial.makeDrawable(drawable, variants, "opaque");
				const fractional = MaskMaterial.makeDrawable(
					drawable,
					variants,
					"fractional",
				);
				opaque.userData.maskVariant = true;
				fractional.userData.maskVariant = true;
				const parent = drawable.parent;
				if (parent === null) return;
				parent.add(opaque, fractional);
				prior = {
					source: drawable,
					material,
					opaque,
					fractional,
					variants,
					signature,
					targetIds: new Set(
						factorRefs.map((attachment) => attachment.targetId),
					),
				};
				sync.maskDrawables.set(drawable, prior);
			}
			MaskMaterial.syncVariants(prior.variants, material);
			MaskMaterial.syncDrawable(prior.opaque, drawable);
			MaskMaterial.syncDrawable(prior.fractional, drawable);
			prior.opaque.visible = drawable.visible;
			prior.fractional.visible = drawable.visible;
			material.visible = false;
		});
	};
	for (const [id, entry] of sync.retained) prepare(id, entry.retained.object);
	for (const [id, comp] of sync.comps) prepare(id, comp.plane);
	for (const entry of [...sync.maskDrawables.values()]) {
		if (!seen.has(entry.source)) releaseDrawable(sync, entry);
	}
};

/** Switch the scene to one source pass or to ordinary output. */
export const setMaskPass = (sync: Sync, sourceId: string | null): void => {
	const plan = sync.maskPlan;
	if (plan === null) return;
	for (const [id, entry] of sync.retained) {
		entry.layer.visible =
			sourceId === null
				? !plan.nodes
						.get(id)
						?.ancestors.some((ancestor) => plan.sources.has(ancestor))
				: MaskPlan.inSource(plan, sourceId, id);
	}
	for (const [id, comp] of sync.comps) {
		comp.holder.visible =
			sourceId === null
				? !plan.nodes
						.get(id)
						?.ancestors.some((ancestor) => plan.sources.has(ancestor))
				: MaskPlan.inSource(plan, sourceId, id);
	}
	for (const target of sync.maskTargets.values()) {
		const ancestor =
			sourceId !== null &&
			plan.nodes
				.get(sourceId)
				?.ancestors.slice(0, -1)
				.includes(target.attachment.targetId);
		MaskMaterial.setEnabled(target.factor, !ancestor);
	}
};

/**
 * Phase 1 — cameras, background, and the DoF request.
 *
 * The world camera resolves its point-of-interest aim and conjugates into
 * three's view convention (the scene view flips z — see the module's
 * coordinate-mapping note); the HUD camera is the identity view, so z=0
 * HUD content lands exactly where authored regardless of where the world
 * camera went.
 */
const syncCameras = (sync: Sync, frame: AnyFrame): void => {
	const camera = Projection.resolveCamera(frame.camera);
	sync.camera.position.set(camera.x, camera.y, camera.z);
	// camera conjugation (view z-flip) — see the coordinate-mapping note
	sync.camera.rotation.set(-camera.rotX, -camera.rotY, camera.rotZ);
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
	sync.dof.aperture = camera.aperture;
};

/** One walked leaf: the leaf handed to its renderer, its tier, and the
 * frame's own data + ancestor opacity (the retained diff key). */
interface WalkedLeaf {
	readonly leaf: Leaf;
	readonly hud: boolean;
	readonly source: Entity.Entity;
	readonly opacity: number;
}

/** What one pass of the tree walk produced. */
interface WalkResult {
	readonly leaves: ReadonlyArray<WalkedLeaf>;
	/** comp ids seen this frame — anything absent is disposed */
	readonly seenComps: ReadonlySet<string>;
	/** leaf and comp ids in tree (paint) order */
	readonly order: ReadonlyArray<string>;
}

/**
 * Phase 2 — walk the instance tree, collecting leaves and syncing comps.
 *
 * Containers contribute their transform and opacity and recurse; declared
 * comps become sub-compositions; everything else is a leaf, handed its
 * composed transform and its opacity multiplied by every ancestor's. HUD subtrees route to the screen-space
 * tier. THROWS on scene-graph violations — see the module doc.
 */
const walkTree = (
	sync: Sync,
	frame: AnyFrame,
	plan: MaskPlan.Plan | null,
): WalkResult => {
	const leaves: Array<WalkedLeaf> = [];
	const visited = new Set<string>();
	const seenComps = new Set<string>();
	const order: Array<string> = [];

	const walk = (
		id: string,
		parent: Transform,
		/** product of every ancestor's opacity */
		opacity: number,
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
		// a Hud's z is depth WITHIN the screen-space tier (design D12); it
		// composes exactly like world depth, just in the HUD scene
		const transform = composeTransform(parent, entry.data);
		const world = worldOf(transform);
		const childIds = childIdsOf(entry.data);
		// container-ness comes from the entity CARRYING children, not from
		// having any: an empty Group (children appended later) renders
		// nothing rather than dispatching to the throwing leaf slot
		if ("children" in entry.data || isHud) {
			// a comp is DECLARED by Scene.play, not inferred from a group
			// carrying a size (design D13)
			const size = frame.comps[id] ?? null;
			if (size !== null) {
				syncComp(
					sync,
					id,
					entry.data,
					size,
					transform,
					opacity,
					subtreeHud,
					frame,
					plan,
				);
				seenComps.add(id);
				order.push(id);
				return;
			}
			// a pure container: contribute transform and opacity, recurse,
			// render nothing itself
			const childOpacity = opacity * opacityOf(entry.data);
			for (const childId of childIds) {
				walk(
					childId,
					transform,
					childOpacity,
					subtreeHud,
					inWorldContainer || !subtreeHud,
				);
			}
			return;
		}
		// ancestor opacity multiplies into the leaf's own, so every renderer
		// honors a fading Group without knowing about it
		const data =
			opacity === 1 || !("opacity" in entry.data)
				? entry.data
				: { ...entry.data, opacity: entry.data.opacity * opacity };
		leaves.push({
			leaf: { id, data, world, transform },
			hud: subtreeHud,
			source: entry.data,
			opacity,
		});
		order.push(id);
	};

	const rootEntry = frame.instances[frame.root];
	if (rootEntry !== undefined) {
		visited.add(frame.root);
		const root = identityTransform();
		for (const childId of childIdsOf(rootEntry.data)) {
			walk(childId, root, 1, false, false);
		}
	}
	return { leaves, seenComps, order };
};

/**
 * Phase 3 — diff the walked leaves against the retained map: build what
 * is new, update what changed (by reference equality on the frame's data,
 * plus value equality on the composed transform and ancestor opacity),
 * dispose what left the frame. THROWS on an unregistered
 * entity — see the module doc.
 */
const diffRetained = (sync: Sync, walked: WalkResult): void => {
	const seen = new Set<string>();
	for (const { leaf, hud, source, opacity } of walked.leaves) {
		seen.add(leaf.id);
		const existing = sync.retained.get(leaf.id);
		if (existing === undefined) {
			const renderer = sync.registry[leaf.data._tag];
			if (renderer === undefined) {
				throw new Error(
					`no entity renderer registered for "${leaf.data._tag}" — instance "${leaf.id}"`,
				);
			}
			if (
				sync.maskPlan !== null &&
				MaskPlan.factorsOf(sync.maskPlan, leaf.id).length > 0 &&
				renderer.supportsMaskFragments !== true
			) {
				throw new Error(
					`Renderer: instance "${leaf.id}" (${leaf.data._tag}) has no mask-fragment capability`,
				);
			}
			const retained = dispatch(renderer).build(leaf, sync.ctx);
			const layer = new THREE.Group();
			layer.add(retained.object);
			sync.retained.set(leaf.id, {
				renderer,
				retained,
				layer,
				hud,
				lastSource: source,
				lastOpacity: opacity,
				lastTransform: leaf.transform,
			});
			ThreeScene.add(hud ? sync.hudScene : sync.scene, [layer]);
			continue;
		}
		if (
			sync.maskPlan !== null &&
			MaskPlan.factorsOf(sync.maskPlan, leaf.id).length > 0 &&
			existing.renderer.supportsMaskFragments !== true
		) {
			throw new Error(
				`Renderer: instance "${leaf.id}" (${leaf.data._tag}) has no mask-fragment capability`,
			);
		}
		const unchanged =
			existing.lastSource === source &&
			existing.lastOpacity === opacity &&
			sameTransform(existing.lastTransform, leaf.transform);
		if (!unchanged) {
			// Path.update replaces and disposes its native children. Mask variants
			// borrow their geometry, so detach them before that rebuild.
			if (leaf.data._tag === "Path") {
				releaseDrawablesWithin(sync, existing.retained.object);
			}
			dispatch(existing.renderer).update(existing.retained, leaf, sync.ctx);
			existing.lastSource = source;
			existing.lastOpacity = opacity;
			existing.lastTransform = leaf.transform;
		}
	}
	for (const [id, entry] of sync.retained) {
		if (!seen.has(id)) {
			releaseDrawablesWithin(sync, entry.retained.object);
			ThreeScene.remove(entry.hud ? sync.hudScene : sync.scene, [entry.layer]);
			entry.retained.dispose();
			sync.retained.delete(id);
		}
	}
	for (const [id, comp] of sync.comps) {
		if (!walked.seenComps.has(id)) {
			releaseDrawablesWithin(sync, comp.plane);
			ThreeScene.remove(comp.hud ? sync.hudScene : sync.scene, [comp.holder]);
			disposeComp(comp);
			sync.comps.delete(id);
		}
	}
};

/** scale `object` by `k` about `camera`: the projection is unchanged,
 * only depth shrinks */
const towardCamera = (
	object: THREE.Object3D,
	camera: THREE.Camera,
	k: number,
): void => {
	object.position.sub(camera.position).multiplyScalar(k).add(camera.position);
	object.scale.multiplyScalar(k);
};

/**
 * Phase 4 — paint order: later in the tree paints over earlier at equal
 * depth, like After Effects layers.
 *
 * Every leaf (and comp) is scaled about its tier's camera by
 * `1 − rank·ε`, its rank being its tree position. A homothety about the eye
 * projects every point to the same pixel, so nothing moves on screen — the
 * leaf only gets a hair closer. That one nudge decides both the z-buffer
 * test and three's back-to-front transparent sort at a tie, so equal-z
 * content never z-fights and a see-through layer blends over what it
 * covers. Content whose depths differ by more than the nudge keeps its real
 * 3D occlusion.
 *
 * ponytail: rank is global tree order, so two leaves `Δ` ranks apart swap
 * only if their depths differ by under `Δ·ε` of the camera distance (1000
 * ranks ≈ 0.1%); rank within each plane instead if a dense 3D field ever
 * mis-occludes.
 */
const syncLayers = (sync: Sync, order: ReadonlyArray<string>): void => {
	order.forEach((id, rank) => {
		const k = 1 - rank * LAYER_EPSILON;
		const entry = sync.retained.get(id);
		if (entry !== undefined) {
			entry.layer.position.set(0, 0, 0);
			entry.layer.scale.set(1, 1, 1);
			towardCamera(entry.layer, entry.hud ? sync.hudCamera : sync.camera, k);
			return;
		}
		// a comp's holder is re-placed every frame by syncComp, so the
		// homothety composes onto it directly
		const comp = sync.comps.get(id);
		if (comp !== undefined) {
			towardCamera(comp.holder, comp.hud ? sync.hudCamera : sync.camera, k);
		}
	});
};

/**
 * Phase 5 — billboards face their tier's view plane: copy the camera
 * quaternion so a circle stays circular under any camera orbit.
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
		if (!comp.rotated) {
			comp.holder.quaternion.copy(
				comp.hud ? sync.hudCamera.quaternion : sync.camera.quaternion,
			);
		}
	}
};

/**
 * The raw per-frame kernel: the five phases, unguarded. Internal — comps
 * recurse through this, and their violations propagate to the outermost
 * `syncFrame`'s single catch.
 */
const syncFrameUnsafe = (
	sync: Sync,
	frame: AnyFrame,
	plan: MaskPlan.Plan | null = frame.masks === undefined ||
	Object.keys(frame.masks).length === 0
		? null
		: MaskPlan.make(frame),
): void => {
	const t0 = performance.now();
	const hadMasks = sync.maskPlan !== null;
	sync.maskPlan = plan;
	const domainId = sync.domainId || frame.root;
	for (const [targetId, target] of sync.maskTargets) {
		const next = plan?.attachments.get(targetId);
		if (
			next === undefined ||
			next.domainId !== domainId ||
			next.sourceId !== target.attachment.sourceId ||
			next.mode !== target.attachment.mode
		) {
			for (const drawable of [...sync.maskDrawables.values()]) {
				if (drawable.targetIds.has(targetId)) releaseDrawable(sync, drawable);
			}
			RenderTarget.dispose(target.rt);
			sync.maskTargets.delete(targetId);
		}
	}
	if (plan !== null) {
		for (const attachment of plan.attachments.values()) {
			if (
				attachment.domainId !== domainId ||
				sync.maskTargets.has(attachment.targetId)
			)
				continue;
			const rt = RenderTarget.makeFloatDepthUnsafe(1, 1);
			sync.maskTargets.set(attachment.targetId, {
				attachment,
				rt,
				factor: MaskMaterial.makeFactor(
					RenderTarget.texture(rt),
					attachment.mode,
				),
			});
		}
	}
	sync.width = frame.width;
	sync.height = frame.height;
	syncCameras(sync, frame);
	const walked = walkTree(sync, frame, plan);
	diffRetained(sync, walked);
	if (hadMasks && plan === null) {
		for (const entry of sync.retained.values()) entry.layer.visible = true;
		for (const comp of sync.comps.values())
			comp.holder.visible = comp.material.opacity > 0;
	}
	syncLayers(sync, walked.order);
	syncBillboards(sync);
	sync.stats.objects = sync.retained.size;
	sync.stats.lastSyncMs = performance.now() - t0;
};

/**
 * Bring the retained scenes in step with a frame.
 *
 * @remarks
 * Runs the five phases described in the module overview. Objects are built,
 * updated, or disposed as the frame demands; unchanged ones are skipped by
 * reference equality on their data and equality of their composed
 * transform, so a still scene
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
		readonly camera: AnyFrame["camera"];
	},
	transform: Transform,
	/** product of the group's ancestors' opacities */
	parentOpacity: number,
	hud: boolean,
	frame: AnyFrame,
	plan: MaskPlan.Plan | null,
): void => {
	let comp = sync.comps.get(id);
	if (comp === undefined) {
		const material = new THREE.MeshBasicNodeMaterial();
		material.transparent = true;
		material.side = THREE.DoubleSide;
		const plane = new THREE.Mesh(compPlane, material);
		const transformHolder = new THREE.Group();
		transformHolder.add(plane);
		const holder = new THREE.Group();
		holder.add(transformHolder);
		comp = {
			sync: make(sync.registry, sync, id),
			holder,
			transformHolder,
			plane,
			material,
			rt: null,
			rotated: false,
			width: compConfig.width,
			height: compConfig.height,
			hud,
		};
		sync.comps.set(id, comp);
		ThreeScene.add(hud ? sync.hudScene : sync.scene, [holder]);
	}
	comp.width = compConfig.width;
	comp.height = compConfig.height;
	// inner sync: the comp's subtree in comp-local space through the
	// child's own camera, with the comp's own background (or transparent).
	// Unsafe: violations inside a comp propagate to the outermost
	// syncFrame's catch, which is the whole point of one seam per frame.
	const background = compConfig.backgroundColor ?? null;
	syncFrameUnsafe(
		comp.sync,
		{
			...frame,
			root: id,
			width: compConfig.width,
			height: compConfig.height,
			backgroundColor: background ?? Color.transparent,
			camera: compConfig.camera,
		},
		plan,
	);
	if (background === null || Color.bytes(background).a === 0) {
		ThreeScene.setBackground(comp.sync.scene, null);
	}
	// outer placement: center-anchored plane (a comp places like an Image of
	// its own size) under the group's composed transform, group opacity (and
	// its ancestors') on the composite
	const world = worldOf(transform);
	comp.holder.position.copy(sync.ctx.toThree(world.x, world.y, world.z));
	comp.holder.scale.copy(transform.scale);
	comp.rotated = transform.rotated;
	if (transform.rotated) {
		comp.holder.quaternion.copy(transform.quaternion);
	}
	comp.plane.scale.set(compConfig.width, compConfig.height, 1);
	comp.material.opacity = Math.max(
		0,
		Math.min(1, opacityOf(groupData) * parentOpacity),
	);
	applyDepthWrite(comp.material);
	comp.holder.visible = comp.material.opacity > 0;
	// the comp's own transform is on the holder, composed like any entity's
	comp.transformHolder.matrixAutoUpdate = true;
	comp.transformHolder.position.set(0, 0, 0);
	comp.transformHolder.rotation.set(0, 0, 0);
	comp.transformHolder.scale.set(1, 1, 1);
};

/**
 * Set a layer's depth write from its opacity.
 *
 * @remarks
 * Internal. See-through layers (opacity < 1) write no depth, so a fading
 * card never punches holes in what is drawn after it (paint order:
 * `syncLayers`). They are tagged so a depth-of-field render can lend them
 * depth — see {@link withSeeThroughDepth}.
 */
export const applyDepthWrite = (material: THREE.Material): void => {
	material.depthWrite = material.opacity >= 1;
	material.userData.seeThrough = !material.depthWrite;
};

/**
 * Run a depth-of-field render with see-through layers writing depth.
 *
 * @remarks
 * Internal, shared by both render paths. DoF reads each pixel's blur from the
 * depth buffer, so a layer that writes none would take the blur of whatever
 * lies behind it — over the empty background that is the far-field maximum,
 * and a title fading in on the focus plane would pop from blurred to sharp.
 * Lent for the DoF render only and restored after, so the plain path keeps
 * the no-holes rule; under DoF a see-through layer can hide see-through
 * content the transparent sort draws after it (DoF is opaque-only anyway).
 */
export const withSeeThroughDepth = <A, E, R>(
	sync: Sync,
	render: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
	Effect.acquireUseRelease(
		Effect.sync(() => {
			const lent: Array<THREE.Material> = [];
			sync.scene["~three.scene"].traverse((object) => {
				if (!(object instanceof THREE.Mesh)) {
					return;
				}
				for (const material of [object.material].flat()) {
					if (material.userData.seeThrough === true && !material.depthWrite) {
						material.depthWrite = true;
						lent.push(material);
					}
				}
			});
			return lent;
		}),
		() => render,
		(lent) =>
			Effect.sync(() => {
				for (const material of lent) {
					material.depthWrite = false;
				}
			}),
	);

/** a comp's objects only — its text/image actors are the root's, which the
 * root's `dispose` releases once */
const disposeComp = (comp: CompState): void => {
	disposeObjects(comp.sync);
	comp.material.dispose();
	if (comp.rt !== null) {
		RenderTarget.dispose(comp.rt);
	}
};

const disposeObjects = (sync: Sync): void => {
	for (const entry of [...sync.maskDrawables.values()])
		releaseDrawable(sync, entry);
	for (const target of sync.maskTargets.values())
		RenderTarget.dispose(target.rt);
	sync.maskTargets.clear();
	for (const entry of sync.retained.values()) {
		ThreeScene.remove(entry.hud ? sync.hudScene : sync.scene, [entry.layer]);
		entry.retained.dispose();
	}
	sync.retained.clear();
	for (const comp of sync.comps.values()) {
		ThreeScene.remove(comp.hud ? sync.hudScene : sync.scene, [comp.holder]);
		disposeComp(comp);
	}
	sync.comps.clear();
};

/**
 * Release every retained object, texture, and sub-composition.
 *
 * @remarks
 * Called automatically when a renderer's scope closes; you rarely call it
 * directly. Effectful because decoded image textures live behind Deferreds
 * that may still be in flight.
 */
export const dispose = Effect.fnUntraced(function* (sync: Sync) {
	disposeObjects(sync);
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
			// a provided font whose bytes fail to parse is a broken asset — a
			// loud defect naming the font, like the missing-loader path below
			yield* Effect.orDie(
				Text.registerFont(sync.text, family, provided.value.bytes),
			);
		} else if (family === Font.defaultFont.id) {
			yield* Effect.orDie(
				Text.registerFont(sync.text, family, yield* Font.loadDefaultBytes),
			);
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
