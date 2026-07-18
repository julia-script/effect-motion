import { Cause, Duration, Effect, Schedule } from "effect";

// recurs (zero delay, like `Schedule.forever`) while the previous run's result
// is < limit, then stops. The run result is fed back as the schedule input,
// so this exercises the input-feedback path of the schedule driver. Replaces
// the `Schedule.collectWhile(forever, pred)` combinator dropped in effect 4.
export const whileInputBelow = (limit: number) =>
	Schedule.fromStep(
		Effect.sync(
			() => (_now: number, input: number) =>
				input < limit
					? Effect.succeed<[number, Duration.Duration]>([input, Duration.zero])
					: Cause.done(input),
		),
	);
