/**
 * biome-ignore-all lint/a11y/noNoninteractiveTabindex: the player root is a
 * deliberate focus target for transport shortcuts (space/arrows), like the
 * native <video> element
 * biome-ignore-all lint/a11y/noStaticElementInteractions: keyboard transport
 * is scoped to the focused player root
 */
import { useEffect, useRef } from "react";
import { type AnyScene, type UsePlayerOptions, usePlayer } from "./usePlayer";

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
 * A scene player: metadata-sized canvas viewport (rendered by the single
 * ThorVG renderer) and a transport bar with play/pause, a scrubber clamped to
 * the buffered range, a time readout, and a loop toggle. Focus the player for
 * keyboard control: Space toggles playback, arrow keys step one frame.
 */
export const Player = ({ scene, ...options }: PlayerProps) => {
	const player = usePlayer(scene, options);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// scene resolution: frame metadata once available, else explicit props
	const sceneWidth = player.currentFrame?.width ?? options.width;
	const sceneHeight = player.currentFrame?.height ?? options.height;

	// render the current frame onto the canvas through the shared ThorVG engine.
	// The render is async (wasm). We do NOT interrupt an in-flight render on
	// frame change: renderFramebuffer draws off-screen and blits last, so
	// interrupting mid-render leaves the canvas blank/stale — which froze
	// playback. Each frame renders to completion and blits. `shouldBlit` guards
	// only against a genuinely out-of-order completion: a render may still blit
	// if it is the newest one that has finished, so the canvas always shows the
	// latest COMPLETED frame even when rendering can't keep up with the clock.
	const latestRequestedRef = useRef(0);
	const latestBlittedRef = useRef(-1);
	useEffect(() => {
		const canvas = canvasRef.current;
		// wait for the engine (and its fonts) before rendering — otherwise the
		// first frames paint before fonts load and text is blank until they do
		if (
			canvas === null ||
			player.currentFrame === null ||
			player.status !== "ready"
		) {
			return;
		}
		const seq = ++latestRequestedRef.current;
		player.renderFrame(player.currentFrame, canvas, () => {
			// blit only if this render is newer than what's currently shown — drops
			// a late out-of-order completion, never the keep-up case
			if (seq <= latestBlittedRef.current) {
				return false;
			}
			latestBlittedRef.current = seq;
			return true;
		});
	}, [player.currentFrame, player.renderFrame, player.status]);

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
				{/* fixed-pixel canvas scaled to fill the aspect-ratio box, like the
				    old viewBox post-process — now native to <canvas> */}
				<canvas
					ref={canvasRef}
					style={{ width: "100%", height: "100%", display: "block" }}
				/>
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
