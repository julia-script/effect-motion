import type { ThreeException } from "@effect-motion/three";
import {
	Renderer as Gpu,
	Interop,
	PostProcessing,
	THREE,
} from "@effect-motion/three";
import type { Scope } from "effect";
import { Context, Effect } from "effect";
import { Color, Shapes } from "effect-motion";
import * as Camera from "effect-motion/Camera";
import type * as Entity from "effect-motion/Entity";
import * as Font from "effect-motion/Font";
import * as Image from "effect-motion/Image";
import * as Projection from "effect-motion/Projection";
import type { Frame } from "effect-motion/Scene";
import { buildDofBlur, makeDofUniforms } from "./dof.js";
import type {
	EntityRenderer,
	Leaf,
	RenderContext,
	Retained,
	World,
} from "./EntityRenderer.js";
import { ImageStore } from "./images.js";
import { builtinRenderers } from "./shapes.js";
import { TextEngine } from "./text.js";

/**
 * The retained frame renderer: a long-lived scoped service holding a
 * retained three scene across frames. `syncFrame` walks a frame's instance
 * tree and diffs it into the scene (raw three, no Effect in the hot path);
 * `render` presents through the wrapper. Occlusion is the GPU depth buffer;
 * DoF is a per-pixel post chain bypassed entirely at aperture 0.
 */

const NEAR = 1;
const FAR = 1_000_000;

type AnyFrame = Frame<unknown>;
type AnyEntityRenderer = EntityRenderer<Entity.AnyEntity>;

// ── coordinate mapping ────────────────────────────────────────────────────
// Scene space: x right, y down, origin top-left, +z toward the viewer,
// camera at rest on +z looking down -z. Three space: x right, y up, +z
// toward the viewer. Mapping: shift origin to the viewport center, flip y,
// keep z. Rotations conjugate accordingly (derived from Projection.ts's
// rotate/rotateInverse conventions):
//   objects (N = diag(1,-1,1)):  R_three = Rz(-rz)·Ry(ry)·Rx(-rx)
//   camera  (M = diag(1,-1,-1)): R_three = Rz(-rz)·Ry(-ry)·Rx(rx)
// Three's Euler order "ZYX" composes exactly Rz·Ry·Rx.

// unit plane with a TOP-LEFT origin (matches the shapes module's anchor)
const unitPlaneShared = new THREE.PlaneGeometry(1, 1);
unitPlaneShared.translate(0.5, -0.5, 0);

const childIdsOf = (data: unknown): ReadonlyArray<string> => {
	const children = (data as { children?: unknown } | null)?.children;
	return Array.isArray(children) ? children : [];
};

const isVisible = (frame: AnyFrame, id: string): boolean =>
	(frame.instances[id]?.data as { "~visible"?: boolean } | undefined)?.[
		"~visible"
	] !== false;

interface RetainedEntry {
	readonly renderer: AnyEntityRenderer;
	readonly retained: Retained;
	/** which tier owns the object: world scene or the screen-space HUD */
	readonly hud: boolean;
	lastData: unknown;
	lastWorld: World;
}

export interface SyncStats {
	objects: number;
	lastSyncMs: number;
}

interface DofState {
	on: boolean;
	focusDistance: number;
	/** CoC scale in uv units (0 = off) — see dof.ts */
	strengthUv: number;
}

/**
 * A sized-group sub-composition: its subtree syncs into a nested FrameSync
 * (comp-local identity camera, own background) whose scene the render path
 * draws into a render target; the target texture rides a billboard plane at
 * the group's anchor, carrying the group's opacity and 2D transform.
 *
 * ponytail: comp content renders through the comp-LOCAL identity camera (the
 * AE-precomp flattening model) — child z inside a comp no longer reacts to
 * the WORLD camera as the ThorVG compositor's screen-space clip did. World-
 * camera parallax inside a precomp needs a frustum-clip design if a scene
 * ever wants it.
 */
export interface CompState {
	readonly sync: FrameSync;
	/** billboarded holder at the group's world anchor (in a scene tier) */
	readonly holder: THREE.Group;
	/** carries the group's 2D affine about the bounds center */
	readonly transformHolder: THREE.Group;
	readonly plane: THREE.Mesh;
	readonly material: THREE.MeshBasicNodeMaterial;
	/** created/resized by the render path (GPU-side) */
	rt: THREE.RenderTarget | null;
	width: number;
	height: number;
	hud: boolean;
}

/**
 * The GPU-free sync core: walks frames into a retained `THREE.Scene`.
 * Everything here is plain JS three objects — testable without a GPU;
 * `make` wires it to a real WebGPU renderer.
 */
export class FrameSync {
	readonly scene = new THREE.Scene();
	readonly camera: THREE.PerspectiveCamera;
	/**
	 * screen-space HUD tier: rendered through the identity camera, after and
	 * above world content, exempt from DoF. Transparent background so the
	 * render paths overlay it.
	 */
	readonly hudScene = new THREE.Scene();
	readonly hudCamera: THREE.PerspectiveCamera;
	readonly stats: SyncStats = { objects: 0, lastSyncMs: 0 };
	/** per-frame DoF request, consumed by the render path */
	readonly dof: DofState = { on: false, focusDistance: 0, strengthUv: 0 };

	/** the renderer's SDF text engine (fonts, atlas, layout) */
	readonly text = new TextEngine();
	/** decoded image textures, cached for this renderer's scope */
	readonly images = new ImageStore();

	/** live sub-compositions, keyed by their group instance id */
	readonly comps = new Map<string, CompState>();

	private readonly registry: Record<string, AnyEntityRenderer>;
	private readonly retained = new Map<string, RetainedEntry>();
	private readonly background = new THREE.Color();
	private width = 0;
	private height = 0;
	private readonly ctx: RenderContext;
	/** async work (SDF layout, decodes) the next render must wait for */
	private pending: Array<Promise<unknown>> = [];

	constructor(registry: Record<string, AnyEntityRenderer>) {
		this.registry = registry;
		this.camera = new THREE.PerspectiveCamera(50, 1, NEAR, FAR);
		this.camera.rotation.order = "ZYX";
		this.hudCamera = new THREE.PerspectiveCamera(50, 1, NEAR, FAR);
		// biome-friendly self-capture: the ctx getters track the per-frame
		// viewport without re-allocating the context object
		const sync = this;
		this.ctx = {
			toThree: (x, y, z) =>
				new THREE.Vector3(x - sync.width / 2, -(y - sync.height / 2), z),
			get width() {
				return sync.width;
			},
			get height() {
				return sync.height;
			},
			waitFor: (work) => {
				sync.pending.push(work);
			},
			text: this.text,
			images: this.images,
		};
	}

	/**
	 * Drain the async work registered during sync (glyph layouts, decodes)
	 * so a render never presents half-built content. Rejections surface —
	 * a failed layout is a loud failure, not a silently missing string.
	 */
	whenReady(): Promise<void> {
		const pending = this.pending;
		this.pending = [];
		const nested = [...this.comps.values()].map((comp) =>
			comp.sync.whenReady(),
		);
		return pending.length === 0 && nested.length === 0
			? Promise.resolve()
			: Promise.all([...pending, ...nested]).then(() => undefined);
	}

	syncFrame(frame: AnyFrame): void {
		const t0 = performance.now();
		this.width = frame.width;
		this.height = frame.height;

		// camera: resolve POI aim, then conjugate into three's space
		const origin = { x: frame.width / 2, y: frame.height / 2 };
		const camera = Projection.resolveCamera(frame.camera, origin);
		this.camera.position.set(camera.x, -camera.y, camera.z);
		this.camera.rotation.set(camera.rotX, -camera.rotY, -camera.rotZ);
		this.camera.aspect = frame.width / frame.height;
		this.camera.fov =
			(2 * Math.atan(frame.height / (2 * camera.focalLength)) * 180) / Math.PI;
		this.camera.updateProjectionMatrix();

		// HUD tier: the identity camera — resting view, so z=0 HUD content
		// lands exactly where authored regardless of the world camera
		const hudFocal = Projection.defaultFocalLength(frame.width);
		this.hudCamera.position.set(0, 0, Projection.defaultCameraZ(hudFocal));
		this.hudCamera.rotation.set(0, 0, 0);
		this.hudCamera.aspect = frame.width / frame.height;
		this.hudCamera.fov =
			(2 * Math.atan(frame.height / (2 * hudFocal)) * 180) / Math.PI;
		this.hudCamera.updateProjectionMatrix();
		this.hudScene.background = null;

		const bg = Color.bytes(frame.backgroundColor);
		this.background.setRGB(
			bg.r / 255,
			bg.g / 255,
			bg.b / 255,
			THREE.SRGBColorSpace,
		);
		this.scene.background = this.background;

		this.dof.on = camera.aperture > 0 && camera.focusDistance > 0;
		this.dof.focusDistance = camera.focusDistance;
		// aperture → uv-space CoC scale, matched against the ThorVG sigma
		// curve (sigma = aperture·f·|d−F|/(d·F) ≈ aperture·|d−F|/F at rest):
		// blur radius ≈ 2σ → strength = 2·aperture / viewport height.
		this.dof.strengthUv = (camera.aperture * 2) / frame.height;

		// walk the tree: containers contribute translation, leaves collect.
		// HUD subtrees route to the screen-space tier (identity camera).
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
			if (!isVisible(frame, id)) {
				return;
			}
			const isHud = entry.entity.name === Shapes.Hud.name;
			if (isHud && inWorldContainer) {
				throw new Error(
					`Renderer: Hud "${id}" is nested inside world content — a Hud must be a top-level child of the root (or of another Hud)`,
				);
			}
			const subtreeHud = hud || isHud;
			const data = entry.data as Partial<World> & {
				width?: unknown;
				height?: unknown;
			};
			const world: World = {
				x: offset.x + (data.x ?? 0),
				y: offset.y + (data.y ?? 0),
				z: offset.z + (data.z ?? 0),
			};
			const childIds = childIdsOf(entry.data);
			if (childIds.length > 0 || isHud) {
				if (typeof data.width === "number" && typeof data.height === "number") {
					this.syncComp(id, entry.data, world, subtreeHud, frame, seenComps);
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
				leaf: { id, entity: entry.entity, data: entry.data, world },
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

		// diff against the retained map
		const seen = new Set<string>();
		for (const { leaf, hud } of leaves) {
			seen.add(leaf.id);
			const existing = this.retained.get(leaf.id);
			if (existing === undefined) {
				const renderer = this.registry[leaf.entity.name];
				if (renderer === undefined) {
					throw new Error(
						`no entity renderer registered for "${leaf.entity.name}" — instance "${leaf.id}"`,
					);
				}
				const retained = renderer.build(leaf, this.ctx);
				this.retained.set(leaf.id, {
					renderer,
					retained,
					hud,
					lastData: leaf.data,
					lastWorld: leaf.world,
				});
				(hud ? this.hudScene : this.scene).add(retained.object);
				continue;
			}
			const sameData = existing.lastData === leaf.data;
			const sameWorld =
				existing.lastWorld.x === leaf.world.x &&
				existing.lastWorld.y === leaf.world.y &&
				existing.lastWorld.z === leaf.world.z;
			if (!sameData || !sameWorld) {
				existing.renderer.update(existing.retained, leaf, this.ctx);
				existing.lastData = leaf.data;
				existing.lastWorld = leaf.world;
			}
		}
		for (const [id, entry] of this.retained) {
			if (!seen.has(id)) {
				(entry.hud ? this.hudScene : this.scene).remove(entry.retained.object);
				entry.retained.dispose();
				this.retained.delete(id);
			}
		}
		for (const [id, comp] of this.comps) {
			if (!seenComps.has(id)) {
				(comp.hud ? this.hudScene : this.scene).remove(comp.holder);
				this.disposeComp(comp);
				this.comps.delete(id);
			}
		}

		// billboards face their tier's view plane: copy the camera quaternion
		// so a circle stays circular under any camera orbit.
		// ponytail: transparent depth ties break by three's stable sort over
		// deterministic creation order (identical across runs and platforms
		// given the deterministic frame stream); switch to a custom
		// transparent sort keyed by instance id if cross-version stability
		// ever matters.
		for (const entry of this.retained.values()) {
			if (entry.retained.billboard) {
				entry.retained.object.quaternion.copy(
					entry.hud ? this.hudCamera.quaternion : this.camera.quaternion,
				);
			}
		}
		for (const comp of this.comps.values()) {
			comp.holder.quaternion.copy(
				comp.hud ? this.hudCamera.quaternion : this.camera.quaternion,
			);
		}

		this.stats.objects = this.retained.size;
		this.stats.lastSyncMs = performance.now() - t0;
	}

	private syncComp(
		id: string,
		groupData: unknown,
		world: World,
		hud: boolean,
		frame: AnyFrame,
		seenComps: Set<string>,
	): void {
		seenComps.add(id);
		const data = groupData as {
			width: number;
			height: number;
			backgroundColor?: Color.Color;
			opacity?: number;
			transform?: {
				a: number;
				b: number;
				c: number;
				d: number;
				e: number;
				f: number;
			};
		};
		let comp = this.comps.get(id);
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
				sync: new FrameSync(this.registry),
				holder,
				transformHolder,
				plane,
				material,
				rt: null,
				width: data.width,
				height: data.height,
				hud,
			};
			this.comps.set(id, comp);
			(hud ? this.hudScene : this.scene).add(holder);
		}
		comp.width = data.width;
		comp.height = data.height;
		// inner sync: the comp's subtree in comp-local space under the
		// identity camera, with the comp's own background (or transparent)
		comp.sync.syncFrame({
			instances: frame.instances,
			root: id,
			frameRate: frame.frameRate,
			width: data.width,
			height: data.height,
			backgroundColor: data.backgroundColor ?? Color.transparent,
			camera: Camera.identity(data.width),
		} as AnyFrame);
		if (
			data.backgroundColor === undefined ||
			Color.bytes(data.backgroundColor).a === 0
		) {
			comp.sync.scene.background = null;
		}
		// outer placement: top-left-anchored plane, group opacity on the
		// composite, 2D affine about the bounds center (y-down → y-up
		// conjugation: negate b and c off-diagonals and the f translation)
		comp.holder.position.copy(this.ctx.toThree(world.x, world.y, world.z));
		comp.plane.scale.set(data.width, data.height, 1);
		comp.material.opacity = Math.max(0, Math.min(1, data.opacity ?? 1));
		comp.holder.visible = comp.material.opacity > 0;
		const m = data.transform;
		const identity =
			m === undefined ||
			(m.a === 1 &&
				m.b === 0 &&
				m.c === 0 &&
				m.d === 1 &&
				m.e === 0 &&
				m.f === 0);
		if (identity) {
			comp.transformHolder.matrixAutoUpdate = true;
			comp.transformHolder.position.set(0, 0, 0);
			comp.transformHolder.rotation.set(0, 0, 0);
			comp.transformHolder.scale.set(1, 1, 1);
		} else if (m !== undefined) {
			const cx = data.width / 2;
			const cy = -data.height / 2;
			const affine = new THREE.Matrix4().set(
				m.a,
				-m.c,
				0,
				m.e,
				-m.b,
				m.d,
				0,
				-m.f,
				0,
				0,
				1,
				0,
				0,
				0,
				0,
				1,
			);
			const toCenter = new THREE.Matrix4().makeTranslation(cx, cy, 0);
			const fromCenter = new THREE.Matrix4().makeTranslation(-cx, -cy, 0);
			comp.transformHolder.matrixAutoUpdate = false;
			comp.transformHolder.matrix
				.copy(toCenter)
				.multiply(affine)
				.multiply(fromCenter);
		}
	}

	private disposeComp(comp: CompState): void {
		comp.sync.disposeRetained();
		comp.material.dispose();
		comp.rt?.dispose();
	}

	/** dispose every retained object (scope teardown) */
	disposeRetained(): void {
		for (const entry of this.retained.values()) {
			(entry.hud ? this.hudScene : this.scene).remove(entry.retained.object);
			entry.retained.dispose();
		}
		this.retained.clear();
		for (const comp of this.comps.values()) {
			(comp.hud ? this.hudScene : this.scene).remove(comp.holder);
			this.disposeComp(comp);
		}
		this.comps.clear();
		this.text.dispose();
		this.images.dispose();
	}
}

/**
 * Resolve the frame's font resources into the sync core's text engine:
 * loaders resolve from the caller's live context by their string-derived
 * tag; the reserved `"sans-serif"` default is auto-provided beneath caller
 * context; a missing loader dies with a defect naming the id (the
 * `font-loading` backstop).
 */
export const resolveResources = (
	sync: FrameSync,
	frame: AnyFrame,
): Effect.Effect<void> =>
	Effect.gen(function* () {
		const fonts = new Set<string>();
		const images = new Set<string>();
		for (const entry of Object.values(frame.instances)) {
			if (entry.entity.name === Shapes.Text.name) {
				const family = (entry.data as { fontFamily?: { id?: unknown } })
					.fontFamily?.id;
				if (typeof family === "string" && !sync.text.hasFont(family)) {
					fonts.add(family);
				}
			}
			if (entry.entity.name === Shapes.Image.name) {
				const id = (entry.data as { image?: { id?: unknown } }).image?.id;
				if (typeof id === "string" && !sync.images.has(id)) {
					images.add(id);
				}
			}
		}
		if (fonts.size === 0 && images.size === 0) {
			return;
		}
		// the caller's live context — loaders resolve from it by rebuilt tag
		const context =
			(yield* Effect.context<never>()) as Context.Context<unknown>;
		for (const family of fonts) {
			const provided = Context.getOption(context, Font.Loader(family));
			if (provided._tag === "Some") {
				sync.text.registerFont(family, provided.value.bytes);
			} else if (family === Font.defaultFont.id) {
				sync.text.registerFont(family, yield* Font.loadDefaultBytes);
			} else {
				return yield* Effect.die(
					new Error(
						`Renderer: no font loader provided for "${family}" — provide it via Font.layer(${JSON.stringify(family)}, ...)`,
					),
				);
			}
		}
		for (const id of images) {
			const provided = Context.getOption(context, Image.Loader(id));
			if (provided._tag === "None") {
				return yield* Effect.die(
					new Error(
						`Renderer: no image loader provided for "${id}" — provide it via Image.layer(${JSON.stringify(id)}, ...)`,
					),
				);
			}
			sync.images.register(id, provided.value.bytes);
		}
	});

/**
 * Render every live sub-composition into its render target, depth-first
 * (nested comps first), leaving the renderer's previous target restored.
 * GPU-side companion to `FrameSync.syncComp`; both render paths call it
 * before their main pass.
 */
export const renderCompTargets = (
	renderer: THREE.WebGPURenderer,
	sync: FrameSync,
	pixelRatio: number,
): void => {
	for (const comp of sync.comps.values()) {
		renderCompTargets(renderer, comp.sync, pixelRatio);
		const pw = Math.max(1, Math.round(comp.width * pixelRatio));
		const ph = Math.max(1, Math.round(comp.height * pixelRatio));
		if (comp.rt === null || comp.rt.width !== pw || comp.rt.height !== ph) {
			comp.rt?.dispose();
			comp.rt = new THREE.RenderTarget(pw, ph);
			comp.material.map = comp.rt.texture;
			comp.material.needsUpdate = true;
		}
		const previous = renderer.getRenderTarget();
		renderer.setRenderTarget(comp.rt);
		renderer.render(comp.sync.scene, comp.sync.camera);
		renderer.setRenderTarget(previous);
	}
};

export interface MakeOptions {
	readonly canvas?: HTMLCanvasElement;
	readonly width: number;
	readonly height: number;
	readonly pixelRatio?: number;
	/** custom entity renderers, merged over the built-in manifest */
	readonly renderers?: Record<string, AnyEntityRenderer>;
}

/** A `FrameSync` wired to a real WebGPU renderer and DoF post chain. */
export class FrameRenderer {
	// DoF pipeline, built lazily at the CURRENT drawing-buffer size and
	// rebuilt on resize: constructing the pass while the renderer is still
	// 1×1 (before the first frame sizes it) leaves the pass's depth texture
	// stale after resize — viewZ then reads garbage and every pixel gets
	// the same max CoC (uniform blur, nothing ever in focus).
	private dofPipeline: {
		readonly post: THREE.RenderPipeline;
		readonly pass: { dispose?: () => void };
		readonly key: string;
	} | null = null;
	private readonly uniforms = makeDofUniforms();

	constructor(
		readonly sync: FrameSync,
		readonly renderer: THREE.WebGPURenderer,
	) {}

	private ensureDofPipeline(): THREE.RenderPipeline {
		const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
		const key = `${size.x}x${size.y}`;
		if (this.dofPipeline === null || this.dofPipeline.key !== key) {
			this.dofPipeline?.pass.dispose?.();
			const scenePass = PostProcessing.pass(this.sync.scene, this.sync.camera);
			const post = new PostProcessing.RenderPipeline(this.renderer);
			post.outputNode = buildDofBlur(scenePass, this.uniforms) as never;
			this.dofPipeline = {
				post,
				pass: scenePass as unknown as { dispose?: () => void },
				key,
			};
		}
		return this.dofPipeline.post;
	}

	/** sync a frame into the retained scene (raw three, hot path) */
	syncFrame(frame: AnyFrame): void {
		this.sync.syncFrame(frame);
	}

	/**
	 * Resolve the frame's resources (font loaders, the auto-provided
	 * default font) into the renderer before syncing it — a missing loader
	 * dies with a defect naming the id.
	 */
	resolveResources(frame: AnyFrame): Effect.Effect<void> {
		return resolveResources(this.sync, frame);
	}

	/**
	 * Render the current retained scene: through the DoF pipeline when the
	 * frame's camera asks for it, the plain path otherwise (aperture 0 is
	 * structurally off — the post chain is bypassed entirely). Waits for
	 * async content (glyph layouts) registered during sync, so no frame
	 * presents half-built.
	 */
	render(): Effect.Effect<void, ThreeException> {
		return Effect.promise(() => this.sync.whenReady()).pipe(
			Effect.flatMap(() =>
				Interop.wrap("comp targets", () =>
					renderCompTargets(
						this.renderer,
						this.sync,
						this.renderer.getPixelRatio(),
					),
				),
			),
			Effect.flatMap(() => {
				if (this.sync.dof.on) {
					this.uniforms.focus.value = this.sync.dof.focusDistance;
					this.uniforms.strength.value = this.sync.dof.strengthUv;
					const post = this.ensureDofPipeline();
					return Interop.wrap("RenderPipeline.render", () => post.render());
				}
				return Gpu.render(this.renderer, this.sync.scene, this.sync.camera);
			}),
			Effect.flatMap(() => {
				// HUD overlay: identity camera, above everything, DoF-exempt
				if (this.sync.hudScene.children.length === 0) {
					return Effect.void;
				}
				return Interop.wrap("hud overlay", () => {
					this.renderer.autoClear = false;
					this.renderer.clearDepth();
					this.renderer.render(this.sync.hudScene, this.sync.hudCamera);
					this.renderer.autoClear = true;
				});
			}),
		);
	}

	/**
	 * Compile the retained scene's pipelines ahead of presentation — call
	 * after the first `syncFrame`, before revealing the canvas, to keep
	 * first-frame pipeline compilation out of playback.
	 */
	prewarm(): Effect.Effect<void, ThreeException> {
		return Gpu.compile(this.renderer, this.sync.scene, this.sync.camera);
	}
}

/**
 * Scoped renderer acquisition: the wrapper's WebGPU renderer (init awaited,
 * disposed on scope close), the sync core, and the DoF post chain built
 * once. Retained objects are disposed with the scope.
 */
export const make = (
	options: MakeOptions,
): Effect.Effect<FrameRenderer, ThreeException, Scope.Scope> =>
	Effect.gen(function* () {
		const registry: Record<string, AnyEntityRenderer> = {
			...(builtinRenderers as unknown as Record<string, AnyEntityRenderer>),
			...options.renderers,
		};
		const sync = new FrameSync(registry);
		const renderer = yield* Gpu.make({
			...(options.canvas !== undefined ? { canvas: options.canvas } : {}),
			antialias: true,
			width: options.width,
			height: options.height,
			...(options.pixelRatio !== undefined
				? { pixelRatio: options.pixelRatio }
				: {}),
		});
		yield* Effect.addFinalizer(() => Effect.sync(() => sync.disposeRetained()));
		// the DoF pipeline is built lazily inside FrameRenderer at the real
		// drawing-buffer size (see ensureDofPipeline)
		return new FrameRenderer(sync, renderer);
	});
