/**
 * biome-ignore-all lint/a11y/noNoninteractiveTabindex: the player root is a
 * deliberate focus target for transport shortcuts (space/arrows), like the
 * native <video> element
 * biome-ignore-all lint/a11y/noStaticElementInteractions: keyboard transport
 * is scoped to the focused player root
 */
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
const renderFrame = (frame: PlayerFrame, target: HTMLElement): void =>
	Effect.runSync(
		Effect.gen(function* () {
			const renderer = yield* Svg.SvgDomRenderer.Context;
			// no size in the config: the sink falls back to frame metadata
			yield* renderer.render(frame as never, { target });
		}).pipe(Effect.provide(layers)) as Effect.Effect<void>,
	);

const iconProps = {
	width: 14,
	height: 14,
	viewBox: "0 0 16 16",
	fill: "currentColor",
} as const;

// icons are decorative: the owning buttons carry the accessible labels
const PlayIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<path d="M4.5 2.5v11l9-5.5z" />
	</svg>
);

const PauseIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />
	</svg>
);

const LoopIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<path d="M4 5h6V3l3.5 3L10 9V7H5v3H3V6a1 1 0 0 1 1-1zM12 11H6v2l-3.5-3L6 7v2h5V6h2v4a1 1 0 0 1-1 1z" />
	</svg>
);

const buttonStyle = (active: boolean): React.CSSProperties => ({
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	width: 28,
	height: 28,
	padding: 0,
	border: "none",
	borderRadius: 6,
	background: "transparent",
	color: active ? "#8b9cff" : "#d6d6de",
	cursor: "pointer",
});

const formatTime = (frames: number, frameRate: number): string => {
	const seconds = Math.floor(frames / frameRate);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export interface PlayerProps extends UsePlayerOptions {
	readonly scene: AnyScene;
}

/**
 * A scene player: metadata-sized SVG viewport and a transport bar with
 * play/pause, a scrubber clamped to the buffered range, a time readout,
 * and a loop toggle. Focus the player for keyboard control: Space toggles
 * playback, arrow keys step one frame.
 */
export const Player = ({ scene, ...options }: PlayerProps) => {
	const player = usePlayer(scene, options);
	const viewportRef = useRef<HTMLDivElement>(null);

	// scene resolution: frame metadata once available, else explicit props
	const sceneWidth = player.currentFrame?.width ?? options.width;
	const sceneHeight = player.currentFrame?.height ?? options.height;

	useEffect(() => {
		const target = viewportRef.current;
		if (target === null || player.currentFrame === null) {
			return;
		}
		renderFrame(player.currentFrame, target);
		// ponytail: post-process the sink's root for responsive scaling —
		// viewBox + CSS size lets the fixed-pixel SVG fill the viewport box;
		// move viewBox into the sink if another consumer needs scaling
		const svg = target.querySelector("svg");
		if (svg !== null) {
			svg.setAttribute(
				"viewBox",
				`0 0 ${player.currentFrame.width} ${player.currentFrame.height}`,
			);
			svg.style.width = "100%";
			svg.style.height = "100%";
			svg.style.display = "block";
		}
	}, [player.currentFrame]);

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		// buttons and the scrubber already handle these keys natively
		const tag = (event.target as HTMLElement).tagName;
		if (tag === "BUTTON" || tag === "INPUT") {
			return;
		}
		if (event.key === " ") {
			event.preventDefault();
			player.toggle();
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			player.pause();
			player.seek(player.frame + 1);
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			player.pause();
			player.seek(player.frame - 1);
		}
	};

	return (
		<div
			tabIndex={0}
			onKeyDown={handleKeyDown}
			style={{
				display: "flex",
				flexDirection: "column",
				// fill the container like a video element; the aspect ratio
				// below keeps the scene's proportions at any width
				width: "100%",
				background: "#101014",
				borderRadius: 10,
				overflow: "hidden",
			}}
		>
			<div
				style={{
					position: "relative",
					width: "100%",
					aspectRatio:
						sceneWidth !== undefined && sceneHeight !== undefined
							? `${sceneWidth} / ${sceneHeight}`
							: undefined,
					minHeight: sceneHeight === undefined ? 120 : undefined,
				}}
			>
				<div ref={viewportRef} style={{ width: "100%", height: "100%" }} />
				{player.status === "loading" ? (
					<div
						style={{
							position: "absolute",
							inset: 0,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "#6b6b76",
							fontSize: 13,
						}}
					>
						Loading…
					</div>
				) : null}
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "6px 10px",
					background: "#1a1a20",
				}}
			>
				<button
					type="button"
					onClick={player.toggle}
					disabled={player.status !== "ready"}
					aria-label={player.playing ? "Pause" : "Play"}
					style={buttonStyle(false)}
				>
					{player.playing ? <PauseIcon /> : <PlayIcon />}
				</button>
				<input
					type="range"
					aria-label="Progress"
					min={0}
					max={Math.max(0, (player.totalFrames ?? player.bufferedFrames) - 1)}
					step={1}
					value={player.frame}
					onChange={(event) => player.seek(Number(event.currentTarget.value))}
					disabled={player.status !== "ready"}
					style={{ flex: 1, accentColor: "#8b9cff", margin: 0 }}
				/>
				<span
					style={{
						color: "#b9b9c3",
						fontSize: 12,
						fontVariantNumeric: "tabular-nums",
						whiteSpace: "nowrap",
					}}
				>
					{player.totalFrames !== null
						? `${formatTime(player.frame, player.frameRate)} / ${formatTime(player.totalFrames, player.frameRate)}`
						: formatTime(player.frame, player.frameRate)}
				</span>
				<button
					type="button"
					onClick={() => player.setLoop(!player.loop)}
					aria-label="Loop"
					aria-pressed={player.loop}
					style={buttonStyle(player.loop)}
				>
					<LoopIcon />
				</button>
			</div>
			{player.status === "error" ? (
				<div role="alert" style={{ color: "#ff8a8a", padding: "6px 10px" }}>
					Scene failed: {String(player.error)}
				</div>
			) : null}
		</div>
	);
};
