/**
 * Render throughput benchmark. Renders representative scenes headlessly
 * through the ThorVG software rasterizer (the node engine) and reports the
 * per-frame cost, broken down into its two phases:
 *
 *   - `Renderer.compose` — the JS pipeline: flatten the instance tree, project
 *     every paintable through the camera, depth-sort, and issue the ThorVG
 *     paint calls. Scales with OBJECT COUNT.
 *   - `Renderer.raster`  — ThorVG's software rasterizer filling pixels. Scales
 *     with COVERED PIXELS × dpr² and with depth-of-field blur buckets.
 *
 * The split is read off Effect tracing spans (see Renderer.render) via a
 * collecting tracer installed here — no wall-clock plumbing in the library and
 * nothing to keep in sync. `Effect.timed` gives the wall-clock envelope per
 * frame for the fps/percentile numbers.
 *
 * Run from the package root:  pnpm exec tsx bench/render-bench.ts
 * The numbers are relative signal (one machine, SW raster), not a spec — the
 * point is comparing scenes and tracking regressions, not absolute fps.
 */
import { Session } from "@effect-motion/thorvg";
import { EngineNode } from "@effect-motion/thorvg/node";
import { Duration, Effect, Layer } from "effect";
import type * as Exit from "effect/Exit";
import type * as Tracer from "effect/Tracer";
import { Camera, Motion, Scene, Shapes } from "../src/index";
import * as Renderer from "../src/Renderer";

const WIDTH = 960;
const HEIGHT = 540;
const FRAME_RATE = 60;
const ITERATIONS = 60;
const WARMUP = 8;

// ── phase-collecting tracer ────────────────────────────────────────────────
// Records the duration of every ended span by name. Effect fills startTime /
// endTime (nanoseconds) because TracerTimingEnabled defaults on, so we just
// difference them. Everything else on the Span contract is a no-op — we only
// want durations.
class PhaseCollector {
	readonly byName = new Map<string, number[]>();
	reset() {
		this.byName.clear();
	}
	private record(name: string, ns: bigint) {
		const arr = this.byName.get(name) ?? [];
		arr.push(Number(ns) / 1e6);
		this.byName.set(name, arr);
	}
	readonly tracer: Tracer.Tracer = {
		span: (options) => {
			const collector = this;
			const span = {
				_tag: "Span" as const,
				name: options.name,
				spanId: "bench",
				traceId: "bench",
				parent: options.parent,
				annotations: options.annotations,
				status: { _tag: "Started" as const, startTime: options.startTime },
				attributes: new Map<string, unknown>(),
				links: options.links,
				sampled: options.sampled,
				kind: options.kind,
				end(endTime: bigint, _exit: Exit.Exit<unknown, unknown>) {
					collector.record(options.name, endTime - options.startTime);
				},
				attribute() {},
				event() {},
				addLinks() {},
			};
			return span as unknown as Tracer.Span;
		},
	};
}

// ── scenes ─────────────────────────────────────────────────────────────────

/** N small tilted rects on a depth-spread grid — object-count stress. */
const grid = (cols: number, rows: number) =>
	Scene.make(function* () {
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				yield* Scene.instantiate(Shapes.Rect, {
					x: -400 + (c * 800) / cols,
					y: -220 + (r * 440) / rows,
					z: ((r * cols + c) % 12) * -120,
					width: 60,
					height: 40,
					rotY: 0.4,
					rotX: 0.2,
					fill: "#6f6ac8",
				});
			}
		}
		yield* Motion.wait("100 millis");
	});

/** A few large overlapping planes that fill the frame — raster/fill stress. */
const bigPlanes = (n: number) =>
	Scene.make(function* () {
		for (let i = 0; i < n; i++) {
			yield* Scene.instantiate(Shapes.Rect, {
				x: -300,
				y: -300,
				z: i * -140,
				width: 600,
				height: 600,
				rotY: 0.5,
				fill: "#6f6ac8",
				opacity: 0.5,
			});
		}
		yield* Motion.wait("100 millis");
	});

// ── harness ──────────────────────────────────────────────────────────────

const layer = Layer.provideMerge(
	Session.layer({ width: WIDTH, height: HEIGHT }),
	EngineNode.layer("sw"),
);

interface Stat {
	readonly mean: number;
	readonly p50: number;
	readonly p95: number;
}
const stat = (xs: number[]): Stat => {
	const s = [...xs].sort((a, b) => a - b);
	const q = (p: number) =>
		s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
	return {
		mean: s.reduce((a, b) => a + b, 0) / (s.length || 1),
		p50: q(0.5),
		p95: q(0.95),
	};
};

const collector = new PhaseCollector();

// The first rendered frame of a scene — the geometry we benchmark against.
// A scene always yields at least one frame; a null first step is a bug worth a
// loud failure in a bench.
const firstFrame = (scene: Scene.Scene<never, never>) =>
	Scene.run(scene, {
		width: WIDTH,
		height: HEIGHT,
		frameRate: FRAME_RATE,
	}).pipe(
		Effect.flatMap((rs) =>
			Effect.flatMap(Scene.step(rs), (f) =>
				f === null
					? Effect.die(new Error("bench scene produced no frames"))
					: Effect.succeed(f),
			),
		),
	);

interface Case {
	readonly label: string;
	readonly frame: Scene.Frame;
	readonly dpr?: number;
}

const runCase = ({ label, frame, dpr = 1 }: Case) =>
	Effect.gen(function* () {
		for (let i = 0; i < WARMUP; i++) {
			yield* Renderer.render(frame, { dpr }).pipe(Effect.scoped);
		}
		collector.reset();
		const total: number[] = [];
		for (let i = 0; i < ITERATIONS; i++) {
			const [d] = yield* Effect.timed(
				Renderer.render(frame, { dpr }).pipe(Effect.scoped),
			);
			total.push(Duration.toMillis(d));
		}
		const wall = stat(total);
		const compose = stat(collector.byName.get("Renderer.compose") ?? []);
		const raster = stat(collector.byName.get("Renderer.raster") ?? []);
		const objects = Object.keys(frame.instances).length;
		yield* Effect.sync(() =>
			console.log(
				`${label.padEnd(30)} ${objects.toString().padStart(4)} obj  ` +
					`${wall.mean.toFixed(2).padStart(7)}ms  ` +
					`p95 ${wall.p95.toFixed(2).padStart(6)}  ` +
					`${(1000 / wall.mean).toFixed(0).padStart(4)} fps   ` +
					`[compose ${compose.mean.toFixed(2)} · raster ${raster.mean.toFixed(2)}]`,
			),
		);
	});

const program = Effect.gen(function* () {
	const rest = Camera.identity(WIDTH);

	const header = (t: string) => Effect.sync(() => console.log(`\n${t}`));

	// 1. object-count sweep: isolates the compose phase (small rects, low fill)
	yield* header("── object-count sweep (small tilted rects) ──");
	for (const [c, r] of [
		[4, 3],
		[8, 6],
		[16, 12],
		[24, 18],
	] as const) {
		const frame = { ...(yield* firstFrame(grid(c, r))), camera: rest };
		yield* runCase({ label: `grid ${c}x${r}`, frame });
	}

	// 2. camera rotation on identical geometry: rotation is ~free; what moves
	//    the number is how the new pose changes on-screen coverage.
	yield* header("── camera rotation (identical geometry, 192 rects) ──");
	{
		const base = yield* firstFrame(grid(16, 12));
		for (const rotY of [0, 0.5, 1.0]) {
			yield* runCase({
				label: `rotY ${rotY.toFixed(1)}`,
				frame: { ...base, camera: { ...rest, rotY } },
			});
		}
	}

	// 3. coverage/fill: large planes facing the camera vs swung away
	yield* header("── coverage (12 large overlapping planes) ──");
	{
		const base = yield* firstFrame(bigPlanes(12));
		for (const rotY of [0, 0.6]) {
			yield* runCase({
				label: `planes rotY ${rotY.toFixed(1)}`,
				frame: { ...base, camera: { ...rest, rotY } },
			});
		}
	}

	// 4. dpr sweep: raster scales ~dpr². The live player renders at device dpr.
	yield* header("── dpr sweep (192 rects, resting camera) ──");
	{
		const frame = { ...(yield* firstFrame(grid(16, 12))), camera: rest };
		for (const dpr of [1, 2, 3]) {
			yield* runCase({ label: `dpr ${dpr}`, frame, dpr });
		}
	}

	// 5. depth of field: aperture > 0 adds per-bucket gaussian blur passes
	yield* header("── depth of field (48 depth-spread rects) ──");
	{
		const base = yield* firstFrame(grid(8, 6));
		for (const aperture of [0, 1.5, 3]) {
			yield* runCase({
				label: `aperture ${aperture}`,
				frame: {
					...base,
					camera: {
						...rest,
						aperture,
						focusDistance: rest.focusDistance + 400,
					},
				},
			});
		}
	}
});

Effect.runPromise(
	program.pipe(
		Effect.scoped,
		Effect.provide(layer),
		Effect.withTracer(collector.tracer),
		Effect.orDie,
	),
).catch((e) => {
	console.error(e);
	process.exit(1);
});
