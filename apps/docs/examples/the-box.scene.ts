import { Effect, Schedule } from "effect";
import { Color, Motion, Entities as S, type Timing } from "effect-motion";
import * as Scene from "effect-motion/Scene";

// ─── The Box ────────────────────────────────────────────────────────────
// A small fable in four acts: a ball, a ledge, a star it cannot reach,
// and the discovery that trying harder is not the only move available.

const GROUND = 260; // floor surface
const LEDGE_X = 340; // left face of the ledge
const LEDGE_TOP = 150;
const R = 16; // the ball at rest

export const scene = Scene.make(
	function* () {
		// ── the world ──
		yield* Scene.instantiate("Rect", { position: S.vec3({ x: 0, y: GROUND }), width: 500, height: 40, fillColor: Color.hex("#efeeea") });
		yield* Scene.instantiate("Rect", { position: S.vec3({ x: LEDGE_X, y: LEDGE_TOP }), width: 160, height: GROUND - LEDGE_TOP, fillColor: Color.hex("#c9d1e5") });
		const star = yield* Scene.instantiate("Circle", { position: S.vec3({ x: 430, y: LEDGE_TOP - 12 }), radius: 8, fillColor: Color.hex("#ff8906") });
		const box = yield* Scene.instantiate("Square", { position: S.vec3({ x: -90 }), // waiting in the wings
			y: GROUND - 56, size: 56, fillColor: Color.hex("#2cb67d") });
		const ball = yield* Scene.instantiate("Ellipse", { position: S.vec3({ x: -30, y: GROUND - R }), fillColor: Color.hex("#7f5af0") });

		// squash & stretch, sole planted on a surface: y follows ry
		const squash = (
			surface: number,
			rx: number,
			ry: number,
			ms: number,
			timing?: Timing.TimingInput,
		) =>
			Scene.all([
				Motion.tweenTo(
					ball,
					{ radiusX: rx, radiusY: ry },
					`${ms} millis`,
					timing as never,
				),
				Motion.moveTo(ball, { y: surface - ry }, `${ms} millis`, timing as never),
			]);
		const landOn = (surface: number) =>
			Effect.gen(function* () {
				yield* squash(surface, R + 6, R - 6, 80);
				yield* squash(surface, R, R, 380, "easeOutElastic");
			});
		// a jump arc: horizontal drift while y rises then falls
		const arc = (toX: number, peakY: number, landY: number, ms: number) =>
			Scene.all([
				Motion.moveTo(ball, { x: toX }, `${ms} millis`),
				Effect.gen(function* () {
					yield* Motion.moveTo(
						ball,
						{ y: peakY },
						`${ms / 2} millis`,
						"easeOutQuad",
					);
					yield* Motion.moveTo(
						ball,
						{ y: landY },
						`${ms / 2} millis`,
						"easeInQuad",
					);
				}),
			]);

		// ── act I: arrival ──
		yield* Motion.moveTo(ball, { x: 140 }, "900 millis", "easeOutCubic");
		yield* squash(GROUND, R + 1.5, R - 1.5, 300); // a small breath
		yield* squash(GROUND, R, R, 300);
		// it sees the star: a hop of intent
		yield* arc(150, GROUND - R - 26, GROUND - R, 350);
		yield* Motion.wait("250 millis");

		// ── act II: try harder ──
		// attempt 1: an honest jump, an honest shortfall
		yield* Motion.moveTo(ball, { x: 250 }, "450 millis", "easeInCubic");
		yield* arc(316, 186, GROUND - R, 460);
		yield* landOn(GROUND);
		yield* Motion.wait("300 millis");

		// attempt 2: back up further, run faster, jump higher —
		yield* Motion.moveTo(ball, { x: 80 }, "500 millis", "easeInOutCubic");
		yield* Motion.wait("250 millis");
		yield* Motion.moveTo(ball, { x: 290 }, "420 millis", "easeInQuad");
		// — and meet the wall, exactly at ledge height
		yield* Scene.all([
			Motion.moveTo(ball, { x: LEDGE_X - R }, "260 millis"),
			Motion.moveTo(ball, { y: LEDGE_TOP + 4 }, "260 millis", "easeOutQuad"),
		]);
		// the slow cartoon slide down the wall
		yield* Motion.moveTo(ball, { y: GROUND - R }, "600 millis", "easeInSine");
		yield* squash(GROUND, R + 7, R - 7, 90);

		// dejection: it stays squashed and thinks about its life
		yield* squash(GROUND, R + 4, R - 5, 450);
		const dots = yield* Scene.instantiate("Text", { position: S.vec3({ x: LEDGE_X - R, y: 205 }), text: "…", fontSize: 22, fillColor: Color.hex("#9490a6"), opacity: 0, textAnchor: "middle" });
		yield* Motion.fadeTo(dots, 1, "350 millis");
		yield* Motion.wait("700 millis");
		yield* Motion.fadeTo(dots, 0, "250 millis");

		// ── act III: the idea ──
		const idea = yield* Scene.instantiate("Text", { position: S.vec3({ x: LEDGE_X - R, y: 200 }), text: "!", fontSize: 6, fillColor: Color.hex("#ff8906"), opacity: 0, textAnchor: "middle" });
		yield* Scene.all([
			Motion.fadeTo(idea, 1, "150 millis"),
			Motion.tweenTo(idea, { fontSize: 26 }, "400 millis", "easeOutBack"),
			// the ball re-inflates with the thought
			squash(GROUND, R, R, 300),
		]);
		yield* arc(LEDGE_X - R, GROUND - R - 20, GROUND - R, 300); // excited hop
		yield* Motion.fadeTo(idea, 0, "200 millis");

		// off it goes, stage left, with purpose
		yield* Motion.moveTo(ball, { x: -40 }, "600 millis", "easeInCubic");
		yield* Motion.wait("400 millis");

		// …and returns, pushing the answer. Leaning into the work.
		yield* Scene.all([
			Motion.moveTo(box, { x: LEDGE_X - 56 }, "1500 millis", "easeInOutSine"),
			Motion.moveTo(
				ball,
				{ x: LEDGE_X - 56 - R },
				"1500 millis",
				"easeInOutSine",
			),
			Motion.moveTo(ball, { y: GROUND - (R - 2) }, "300 millis"),
		]);
		yield* squash(GROUND, R, R, 250);
		yield* Motion.wait("250 millis");

		// ── act IV: up ──
		yield* arc(LEDGE_X - 28, GROUND - 56 - R - 30, GROUND - 56 - R, 380); // onto the box
		yield* landOn(GROUND - 56);
		yield* arc(384, LEDGE_TOP - R - 42, LEDGE_TOP - R, 430); // onto the ledge
		yield* landOn(LEDGE_TOP);
		yield* Motion.moveTo(ball, { x: 414 }, "400 millis", "easeOutCubic"); // to the star

		// the star celebrates — and so does everything around it
		const sparkle = (angle: number) =>
			Effect.gen(function* () {
				const s = yield* Scene.instantiate("Circle", { position: S.vec3({ x: 430, y: LEDGE_TOP - 12 }), radius: 3, fillColor: Color.hex("#ff8906") });
				yield* Scene.all([
					Motion.moveTo(
						s,
						{
							x: 430 + Math.cos(angle) * 34,
							y: LEDGE_TOP - 12 + Math.sin(angle) * 34,
						},
						"450 millis",
						"easeOutCubic",
					),
					Motion.fadeTo(s, 0, "450 millis"),
				]);
			});
		yield* Scene.fork(
			Effect.gen(function* () {
				yield* Motion.tweenTo(
					star,
					{ radius: 13 },
					"300 millis",
					"easeOutBack",
				);
				yield* Scene.stagger(
					[0, 1, 2, 3, 4, 5].map((i) => sparkle((i / 6) * Math.PI * 2)),
					Schedule.spaced("40 millis"),
				);
			}),
		);
		// two happy bounces while the sparkles fly
		yield* arc(414, LEDGE_TOP - R - 18, LEDGE_TOP - R, 280);
		yield* arc(414, LEDGE_TOP - R - 12, LEDGE_TOP - R, 240);

		// ── the moral ──
		const caption = yield* Scene.instantiate("Text", { position: S.vec3({ x: 250, y: 70 }), text: "persistence < tooling", fontSize: 6, fillColor: Color.hex("#232946"), opacity: 0, textAnchor: "middle", baseline: "middle" });
		yield* Scene.all([
			Motion.fadeTo(caption, 1, "400 millis"),
			Motion.tweenTo(caption, { fontSize: 24 }, "600 millis", "easeOutBack"),
		]);
		yield* Motion.wait("1200 millis");
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
