import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Pull from "effect/Pull";
import * as Schedule from "effect/Schedule";

export const toFrames = (duration: Duration.Input, fps: number) => {
	return Math.round(Duration.toSeconds(duration) * fps);
};

/** exact scene time in ms of a frame index — deliberately not rounded */
export const frameToMillis = (frame: number, fps: number) =>
	(frame * 1000) / fps;

export type StepDecision<Output> =
	| {
			readonly done: false;
			readonly output: Output;
			/** absolute frame at which the next recurrence is due */
			readonly frame: number;
	  }
	| { readonly done: true; readonly output: Output };

export interface ScheduleDriver<Output, Input, Error, Env> {
	readonly next: (
		nowFrame: number,
		input: Input,
	) => Effect.Effect<StepDecision<Output>, Error, Env>;
}

/**
 * Drive an Effect `Schedule` in scene time (frames at `fps`). Internal.
 *
 * Contract: call `next` exactly once per decision, at the moment of the
 * decision (schedule start or effect/release completion) — NEVER poll it
 * per frame. Schedules like `Schedule.spaced` compute their target
 * relative to the `now` they are called with, so polling pushes the
 * target forward forever.
 *
 * Each absolute target (now + delay) is rounded to a frame once; rounded
 * deltas are never accumulated, so non-frame-aligned schedules keep their
 * own continuous bookkeeping and do not drift. A target at or before
 * `nowFrame` means "due now" — callers run without ticking.
 */
export const scheduleDriver = <Output, Input, Error, Env>(
	schedule: Schedule.Schedule<Output, Input, Error, Env>,
	fps: number,
): Effect.Effect<ScheduleDriver<Output, Input, Error, Env>, never, Env> =>
	Effect.map(Schedule.toStep(schedule), (step) => ({
		next: (nowFrame, input) => {
			const nowMs = frameToMillis(nowFrame, fps);
			return step(nowMs, input).pipe(
				Effect.map(
					([output, delay]): StepDecision<Output> => ({
						done: false,
						output,
						frame: Math.round(
							((nowMs + Duration.toMillis(delay)) * fps) / 1000,
						),
					}),
				),
				Pull.catchDone((output) =>
					Effect.succeed<StepDecision<Output>>({
						done: true,
						output: output as Output,
					}),
				),
			);
		},
	}));
