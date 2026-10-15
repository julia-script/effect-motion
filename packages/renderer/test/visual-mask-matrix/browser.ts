import * as Renderer from "@effect-motion/renderer/Renderer";
import * as RenderTarget from "@effect-motion/three/RenderTarget";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as Scene from "effect-motion/Scene";
import { frameRate, height, renderLayers, scenes, width } from "./scenes.js";

type Frame = Parameters<typeof Renderer.syncFrame>[1];
type SceneName = keyof typeof scenes;

const canvas = document.querySelector("canvas");
const status = document.querySelector("#status");
const selector = document.querySelector<HTMLSelectElement>("#scene");
const slider = document.querySelector<HTMLInputElement>("#frame");
const playButton = document.querySelector<HTMLButtonElement>("#play");

if (
	!(canvas instanceof HTMLCanvasElement) ||
	!status ||
	!selector ||
	!slider ||
	!playButton
) {
	throw new Error("visual mask matrix controls are missing");
}

let scope: Scope.Closeable | null = null;
let renderer: Renderer.Renderer | null = null;
let frames: Frame[] = [];
let currentScene: SceneName = "alpha-media";
let currentFrame = 0;
let playing = false;
let runId = 0;

const setStatus = (message: string) => {
	status.textContent = message;
};

const stop = () => {
	playing = false;
	runId++;
	playButton.textContent = "Play";
};

const show = async (index: number) => {
	const active = renderer;
	const frame = frames[index];
	if (!active || !frame) return;
	await Effect.runPromise(
		Renderer.resolveResources(active, frame).pipe(
			Effect.flatMap(() => Renderer.syncFrame(active, frame)),
			Effect.flatMap(() => Renderer.render(active)),
			Effect.provide(renderLayers),
		),
	);
	currentFrame = index;
	slider.value = String(index);
	setStatus(
		`${currentScene} • frame ${index + 1}/${frames.length} • masks ${Object.keys(frame.masks ?? {}).length}`,
	);
};

const load = async (name: SceneName) => {
	stop();
	if (scope) {
		await Effect.runPromise(Scope.close(scope, Exit.succeed(undefined)));
	}
	scope = await Effect.runPromise(Scope.make());
	renderer = await Effect.runPromise(
		Renderer.make({
			canvas,
			width,
			height,
			pixelRatio: 1,
			dofQuality: "full",
		}).pipe(Effect.provideService(Scope.Scope, scope)),
	);
	currentScene = name;
	selector.value = name;
	frames = [
		...(await Effect.runPromise(
			Scene.stream(scenes[name] as never, { frameRate }).pipe(
				Stream.runCollect,
				Effect.provide(renderLayers),
			) as Effect.Effect<Iterable<Frame>>,
		)),
	];
	slider.max = String(frames.length - 1);
	await show(0);
	return frames.length;
};

const play = async () => {
	if (playing) return;
	playing = true;
	playButton.textContent = "Pause";
	const id = ++runId;
	while (playing && id === runId) {
		const next = (currentFrame + 1) % frames.length;
		await show(next);
		await new Promise((resolve) => setTimeout(resolve, 1000 / frameRate));
	}
};

const dispose = async () => {
	stop();
	if (scope) {
		await Effect.runPromise(Scope.close(scope, Exit.succeed(undefined)));
		scope = null;
		renderer = null;
	}
	setStatus("renderer disposed");
};

selector.addEventListener("change", () => {
	void load(selector.value as SceneName).catch((error) =>
		setStatus(String(error)),
	);
});
slider.addEventListener("input", () => {
	stop();
	void show(Number(slider.value)).catch((error) => setStatus(String(error)));
});
playButton.addEventListener("click", () => {
	if (playing) stop();
	else void play().catch((error) => setStatus(String(error)));
});

const gpu = (
	navigator as Navigator & {
		gpu?: {
			requestAdapter: () => Promise<{
				info?: { vendor?: string; architecture?: string };
			} | null>;
		};
	}
).gpu;
if (!gpu) {
	setStatus("WebGPU unavailable in this browser");
} else {
	const adapter = await gpu.requestAdapter();
	const info = adapter?.info;
	const deviceLabel = document.querySelector("#device");
	if (deviceLabel) {
		deviceLabel.textContent = `${navigator.userAgent} • ${info?.vendor ?? "unknown vendor"} / ${info?.architecture ?? "unknown architecture"}`;
	}
	await load("alpha-media");
}

Object.assign(window, {
	maskMatrix: {
		load,
		show,
		play,
		stop,
		dispose,
		resize: (pixelRatio: number) => {
			if (renderer) Renderer.setViewport(renderer, width, height, pixelRatio);
		},
		state: () => {
			const maskTarget = renderer
				? [...renderer.sync.maskTargets.values()][0]?.rt
				: undefined;
			return {
				scene: currentScene,
				frame: currentFrame,
				frames: frames.length,
				playing,
				maskTargets: renderer?.sync.maskTargets.size ?? 0,
				maskDrawables: renderer?.sync.maskDrawables.size ?? 0,
				maskTargetWidth: maskTarget ? RenderTarget.width(maskTarget) : 0,
				hudChildren:
					renderer?.sync.hudScene["~three.scene"].children.length ?? 0,
				dof: renderer?.sync.dof.on ?? false,
				dofChain: renderer?.dofChain != null,
				cameraAperture: frames[currentFrame]?.camera.aperture ?? null,
				device: document.querySelector("#device")?.textContent ?? "",
			};
		},
	},
});
