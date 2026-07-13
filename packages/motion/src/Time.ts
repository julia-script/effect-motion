import * as Duration from "effect/Duration";

export const toFrames = (duration: Duration.Input, fps: number) => {
	return Math.round(Duration.toSeconds(duration) * fps);
};
