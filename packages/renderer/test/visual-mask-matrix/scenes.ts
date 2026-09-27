import * as Effect from "effect/Effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Image from "effect-motion/Image";
import * as Motion from "effect-motion/Motion";
import * as Runner from "effect-motion/Runner";
import * as Scene from "effect-motion/Scene";

export const width = 320;
export const height = 240;
export const frameRate = 2;

const checker = Image.Image("visual-mask-matrix-checker");
const checkerPng =
	"iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJ0lEQVR4AYXBMQEAIAzAsK6S8C8AV/DC1WTOXoff8JAgQYIECRIkXBMIAwlZoWDMAAAAAElFTkSuQmCC";

export const renderLayers = Image.layer(
	checker,
	Effect.sync(() =>
		Uint8Array.from(atob(checkerPng), (ch) => ch.charCodeAt(0)),
	),
);

const settings = {
	width,
	height,
	backgroundColor: Color.hex("#192330"),
};

export const alphaAndMedia = Scene.make(
	"alpha and media matrix",
	function* () {
		const image = yield* checker;
		const normal = yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ x: -80, y: 58 }),
			width: 120,
			height: 72,
			fillColor: Color.hex("#4c9aff"),
		});
		const normalMask = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -110, y: 58 }),
			radius: 35,
			fillColor: Color.rgba(255, 0, 0, 0.4),
		});
		yield* Scene.setMask(normal, normalMask);

		const inverse = yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ x: 80, y: 58 }),
			width: 120,
			height: 72,
			fillColor: Color.hex("#ffb454"),
		});
		const inverseMask = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: 110, y: 58 }),
			radius: 34,
			opacity: 254 / 255,
		});
		yield* Scene.setMask(inverse, inverseMask, { mode: "inverse" });

		const textTarget = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ x: -143, y: -74 }),
			text: "TYPE",
			fontSize: 46,
			fillColor: Color.hex("#b8ed84"),
		});
		const imageMask = yield* Scene.instantiate("Image", {
			image,
			position: Entity.vec3({ x: -82, y: -58 }),
			width: 115,
			height: 68,
		});
		yield* Scene.setMask(textTarget, imageMask);

		const imageTarget = yield* Scene.instantiate("Image", {
			image,
			position: Entity.vec3({ x: 80, y: -58 }),
			width: 120,
			height: 68,
		});
		const textMask = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ x: 31, y: -73 }),
			text: "INK",
			fontSize: 47,
			fillColor: Color.rgba(0, 255, 255, 0.65),
		});
		yield* Scene.setMask(imageTarget, textMask);

		yield* Scene.tick;
		yield* Scene.all([
			Motion.moveTo(normalMask, { x: -52 }, "1 second"),
			Motion.moveTo(inverse, { x: 65 }, "1 second"),
			Motion.moveTo(imageMask, { x: -64 }, "1 second"),
		]);
	},
	settings,
);

export const nestedGroups = Scene.make(
	"nested groups matrix",
	function* () {
		yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ z: -40 }),
			width: 300,
			height: 180,
			fillColor: Color.hex("#225a62"),
		});
		const leaf = yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ x: -18, z: 30 }),
			width: 110,
			height: 110,
			fillColor: Color.hex("#e37a9d"),
		});
		const inner = yield* Scene.instantiate("Group", {
			position: Entity.vec3({ x: 30 }),
			children: [leaf],
		});
		const outer = yield* Scene.instantiate("Group", {
			position: Entity.vec3({ x: -45 }),
			children: [inner],
		});
		const outerMaskShape = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: 0 }),
			radius: 62,
			fillColor: Color.rgba(255, 0, 0, 0.75),
		});
		const outerMask = yield* Scene.instantiate("Group", {
			position: Entity.vec3({ x: -10 }),
			children: [outerMaskShape],
		});
		const innerMask = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -15 }),
			radius: 45,
		});
		yield* Scene.setMask(outer, outerMask);
		yield* Scene.setMask(leaf, innerMask);
		yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ x: 18, z: 10 }),
			width: 42,
			height: 165,
			fillColor: Color.hex("#fee37d"),
		});
		yield* Scene.tick;
		yield* Scene.all([
			Motion.moveTo(outerMask, { x: 32 }, "1 second"),
			Motion.moveTo(inner, { x: 58 }, "1 second"),
		]);
	},
	settings,
);

const childComposition = Scene.make(
	"masked child composition",
	function* () {
		const child = yield* Scene.instantiate("Rect", {
			width: 105,
			height: 84,
			fillColor: Color.hex("#49cdb8"),
		});
		const source = yield* Scene.instantiate("Circle", { radius: 42 });
		yield* Scene.setMask(child, source);
		yield* Scene.tick;
	},
	{ width: 140, height: 110, backgroundColor: Color.rgba(0, 0, 0, 0) },
);

export const compositionHudFocus = Scene.make(
	"composition HUD and focus matrix",
	function* () {
		yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ z: -100 }),
			width: 300,
			height: 180,
			fillColor: Color.hex("#454f9d"),
		});
		const mounted = yield* Scene.play(childComposition);
		const compMask = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -18 }),
			radius: 64,
		});
		yield* Scene.setMask(mounted.group, compMask);
		const hudTarget = yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ x: 110, y: 80 }),
			width: 60,
			height: 30,
			fillColor: Color.hex("#ffde73"),
		});
		const hudSource = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: 110, y: 80 }),
			radius: 17,
		});
		const hudControl = yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ x: -110, y: 80 }),
			width: 34,
			height: 30,
			fillColor: Color.hex("#fefefe"),
		});
		yield* Scene.instantiate("Hud", {
			children: [hudTarget, hudSource, hudControl],
		});
		yield* Scene.setMask(hudTarget, hudSource);
		const camera = yield* Scene.camera;
		yield* Scene.update(camera, (data) => ({
			...data,
			aperture: 18,
			focusDistance: 160,
		}));
		yield* Scene.tick;
		yield* Scene.all([
			Motion.moveTo(compMask, { x: 20 }, "1 second"),
			Motion.moveTo(camera, { x: 25 }, "1 second"),
		]);
		yield* mounted.finished;
	},
	settings,
);

export const lifecycle = Scene.make(
	"mask lifecycle matrix",
	function* () {
		const target = yield* Scene.instantiate("Rect", {
			width: 180,
			height: 95,
			fillColor: Color.hex("#52aaff"),
		});
		const left = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -55 }),
			radius: 38,
			fillColor: Color.hex("#ff617e"),
		});
		const right = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: 55 }),
			radius: 38,
			fillColor: Color.hex("#f8dc75"),
		});
		yield* Scene.setMask(target, left);
		yield* Scene.tick;
		yield* Scene.setMask(target, right);
		yield* Scene.tick;
		yield* Scene.clearMask(target);
		yield* Scene.tick;
		const root = (yield* Runner.Runner).root;
		yield* Scene.removeChild(root, target);
		yield* Scene.tick;
	},
	settings,
);

export const scenes = {
	"alpha-media": alphaAndMedia,
	"nested-groups": nestedGroups,
	"composition-hud-focus": compositionHudFocus,
	lifecycle,
};
