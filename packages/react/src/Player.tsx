import { Layer } from "effect";
import * as Effect from "effect/Effect";
import { Svg } from "effect-motion";
import { useEffect, useRef } from "react";
import {
	type AnyScene,
	type PlayerFrame,
	type UsePlayerOptions,
	usePlayer,
} from "./usePlayer";

const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));

// everything in the SVG DOM sink and its entity renderers is synchronous
const renderFrame = (
	frame: PlayerFrame,
	config: { target: HTMLElement; width: number; height: number },
): void =>
	Effect.runSync(
		Effect.gen(function* () {
			const renderer = yield* Svg.SvgDomRenderer.Context;
			yield* renderer.render(frame as never, config);
		}).pipe(Effect.provide(layers)) as Effect.Effect<void>,
	);

export interface PlayerProps extends UsePlayerOptions {
	readonly scene: AnyScene;
	readonly width?: number | undefined;
	readonly height?: number | undefined;
}

/**
 * A scene player with standard transport controls: SVG viewport,
 * play/pause toggle, and a scrubbable progress bar.
 */
export const Player = ({
	scene,
	width = 500,
	height = 300,
	...options
}: PlayerProps) => {
	const player = usePlayer(scene, options);
	const viewportRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const target = viewportRef.current;
		if (target === null || player.currentFrame === null) {
			return;
		}
		renderFrame(player.currentFrame, { target, width, height });
	}, [player.currentFrame, width, height]);

	return (
		<div style={{ width, display: "flex", flexDirection: "column", gap: 8 }}>
			<div ref={viewportRef} style={{ width, height }} />
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<button
					type="button"
					onClick={player.toggle}
					disabled={player.status !== "ready"}
					aria-label={player.playing ? "Pause" : "Play"}
				>
					{player.playing ? "❚❚" : "▶"}
				</button>
				<input
					type="range"
					aria-label="Progress"
					min={0}
					max={Math.max(0, player.totalFrames - 1)}
					step={1}
					value={player.frame}
					onChange={(event) => player.seek(Number(event.currentTarget.value))}
					disabled={player.status !== "ready"}
					style={{ flex: 1 }}
				/>
			</div>
			{player.status === "error" ? (
				<div role="alert">Scene failed: {String(player.error)}</div>
			) : null}
		</div>
	);
};
