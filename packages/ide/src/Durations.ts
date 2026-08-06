/**
 * Duration strings, read the way Effect reads them.
 *
 * @remarks
 * Every animator takes a `Duration.Input`, and in scenes that is almost
 * always the string form — `"1 second"`, `"400 millis"`. What an author
 * actually wants to know at the call site is how many FRAMES that is, since
 * frames are the unit the engine counts in. `toFrames` mirrors
 * `Time.toFrames` (`Math.round(seconds * fps)`), so the number in a hover
 * is the number of frames the scene will produce.
 *
 * The grammar here is Effect's own `DURATION_REGEXP`, kept deliberately
 * strict: a string that Effect would reject gets no hover rather than a
 * confident wrong answer.
 */

const DURATION =
	/^(-?\d+(?:\.\d+)?)\s+(nanos?|micros?|millis?|seconds?|minutes?|hours?|days?|weeks?)$/;

const MILLIS_PER: Record<string, number> = {
	nano: 1e-6,
	micro: 1e-3,
	milli: 1,
	second: 1000,
	minute: 60_000,
	hour: 3_600_000,
	day: 86_400_000,
	week: 604_800_000,
};

/** Milliseconds for a duration string, or `undefined` if Effect would reject it. */
export const toMillis = (input: string): number | undefined => {
	const match = DURATION.exec(input.trim());
	if (match === null) return undefined;
	const value = Number(match[1]);
	const unit = (match[2] ?? "").replace(/s$/, "");
	const scale = MILLIS_PER[unit];
	if (scale === undefined || !Number.isFinite(value)) return undefined;
	return value * scale;
};

/** Is this string one Effect would decode as a duration? */
export const isDuration = (input: string): boolean =>
	toMillis(input) !== undefined;

/** Frames a duration occupies at `frameRate` — mirrors `Time.toFrames`. */
export const toFrames = (millis: number, frameRate: number): number =>
	Math.round((millis / 1000) * frameRate);

export interface DurationInfo {
	readonly millis: number;
	readonly seconds: number;
	readonly frames: number;
	readonly frameRate: number;
	/**
	 * True when the duration does not land on a whole frame, so the rounded
	 * frame count is not exactly what was asked for.
	 */
	readonly rounded: boolean;
}

/** Everything a hover wants to say about a duration string. */
export const describe = (
	input: string,
	frameRate: number,
): DurationInfo | undefined => {
	const millis = toMillis(input);
	if (millis === undefined) return undefined;
	const exact = (millis / 1000) * frameRate;
	return {
		millis,
		seconds: millis / 1000,
		frames: Math.round(exact),
		frameRate,
		rounded: Math.abs(exact - Math.round(exact)) > 1e-9,
	};
};
