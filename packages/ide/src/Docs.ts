/**
 * The prose an editor shows — as Markdown, built once and reused by hovers,
 * completion details, and the easing gallery.
 *
 * @remarks
 * Editor-agnostic on purpose: nothing here imports an editor API, so a
 * second integration (a language server, a Zed extension) renders exactly
 * the same reference text as the VS Code one.
 */

import * as Durations from "./Durations.js";
import * as Easings from "./Easings.js";
import * as Entities from "./Entities.js";
import * as Springs from "./Springs.js";

/** Which curve palette to draw with. */
export type Theme = "dark" | "light";

const themeOf = (theme: Theme): Easings.CurveTheme =>
	theme === "light" ? Easings.lightTheme : Easings.darkTheme;

const image = (svg: string, alt: string) =>
	`![${alt}](${Easings.toDataUri(svg)})`;

/** Markdown for a built-in easing: its curve, then what it is for. */
export const easing = (
	name: string,
	options: { theme?: Theme; width?: number; height?: number } = {},
): string | undefined => {
	const found = Easings.find(name);
	if (found === undefined) return undefined;
	const svg = Easings.curveSvg(found.name, {
		theme: themeOf(options.theme ?? "dark"),
		...(options.width === undefined ? {} : { width: options.width }),
		...(options.height === undefined ? {} : { height: options.height }),
	});

	const notes: string[] = [];
	if (found.periodic)
		notes.push(
			"Periodic — it RETURNS to its starting value instead of landing on the target.",
		);
	else if (found.overshoots)
		notes.push(
			"Leaves [0, 1] mid-animation; the overshoot is the effect, so values are extrapolated rather than clamped.",
		);
	else
		notes.push("f(0) = 0 and f(1) = 1, so the tween lands exactly on target.");

	return [
		image(svg, `${found.name} curve`),
		"",
		`**${found.name}** · ${found.family}`,
		"",
		found.summary,
		"",
		`_${notes.join(" ")}_`,
	].join("\n");
};

/** Markdown for a spring preset: its simulated curve, params, and length. */
export const spring = (
	name: string,
	options: {
		theme?: Theme;
		frameRate?: number;
		distance?: number;
		width?: number;
		height?: number;
	} = {},
): string | undefined => {
	const found = Springs.find(name);
	if (found === undefined) return undefined;
	const frameRate = options.frameRate ?? 60;
	const distance = options.distance ?? 100;
	const run = Springs.simulate(found.spring, { frameRate, distance });
	const svg = Easings.plotSvg(run.samples, {
		theme: themeOf(options.theme ?? "dark"),
		...(options.width === undefined ? {} : { width: options.width }),
		...(options.height === undefined ? {} : { height: options.height }),
	});

	const { mass, stiffness, damping, initialVelocity } = found.spring;
	const params = [
		`mass ${mass}`,
		`stiffness ${stiffness}`,
		`damping ${damping}`,
		...(initialVelocity === undefined
			? []
			: [`initial velocity ${initialVelocity}`]),
	].join(" · ");

	const length = run.truncated
		? `Never settles at this damping — it animates until something else ends the scene.`
		: `Settles in **${run.frames} frames** (${run.seconds.toFixed(2)}s at ${frameRate} fps) over a ${distance}-unit move.`;

	return [
		image(svg, `${found.name} spring`),
		"",
		`**${found.name}** · spring preset`,
		"",
		found.summary,
		"",
		`\`${params}\``,
		"",
		length,
		"",
		"_Springs have no duration: length emerges from the simulation, and scales with the distance travelled._",
	].join("\n");
};

/** Markdown for a duration string: what it is in seconds and in frames. */
export const duration = (
	text: string,
	frameRate: number,
): string | undefined => {
	const info = Durations.describe(text, frameRate);
	if (info === undefined) return undefined;
	const rounded = info.rounded
		? ` _(rounded — ${((info.millis / 1000) * frameRate).toFixed(2)} exactly)_`
		: "";
	return [
		`\`"${text}"\` · **${info.frames} frames** at ${frameRate} fps${rounded}`,
		"",
		`${info.seconds}s — ${info.millis}ms.`,
		"",
		"_Frame counts follow the editor's `effectMotion.frameRate` setting; match it to your scene settings._",
	].join("\n");
};

/** Markdown for an entity tag: what it draws and what it carries. */
export const entity = (tag: string): string | undefined => {
	const found = Entities.find(tag);
	if (found === undefined) return undefined;
	const shared = found.paintable
		? [...Entities.TRANSFORM_FIELDS, ...Entities.APPEARANCE_FIELDS]
		: [...Entities.TRANSFORM_FIELDS];
	return [
		`**${found.tag}** · entity`,
		"",
		found.summary,
		"",
		`Own fields: ${found.fields.map((field) => `\`${field}\``).join(", ")}`,
		"",
		`Shared: ${shared.map((field) => `\`${field}\``).join(", ")}`,
		...(found.container ? ["", "_Holds children._"] : []),
	].join("\n");
};

/** A self-contained HTML page showing every easing and spring side by side. */
export const gallery = (theme: Theme = "dark"): string => {
	const curveTheme = themeOf(theme);
	const fg = theme === "light" ? "#1c1c22" : "#e8e8ef";
	const muted = theme === "light" ? "#5c5c68" : "#9a9aa8";
	const bg = theme === "light" ? "#ffffff" : "#16161d";
	const cardBg = theme === "light" ? "#f6f6f8" : "#1e1e24";

	// the attribute carries the BARE name; the quotes an author wants around
	// it are added on insertion, where they cannot close the attribute
	const card = (name: string, subtitle: string, svg: string) =>
		`<button class="card" data-insert="${name}" title="Click to insert or copy">${svg}<span class="name">${name}</span><span class="sub">${subtitle}</span></button>`;

	const easingCards = Easings.easings
		.map((item) =>
			card(
				item.name,
				item.family,
				Easings.curveSvg(item.name, {
					theme: curveTheme,
					width: 148,
					height: 92,
				}),
			),
		)
		.join("");

	const springCards = Springs.presets
		.map((item) => {
			const run = Springs.simulate(item.spring, {
				frameRate: 60,
				distance: 100,
			});
			return card(
				item.name,
				run.truncated ? "never settles" : `${run.frames} frames @ 60fps`,
				Easings.plotSvg(run.samples, {
					theme: curveTheme,
					width: 148,
					height: 92,
				}),
			);
		})
		.join("");

	return `<!doctype html>
<html><head><meta charset="utf-8"><title>effect-motion curves</title><style>
:root { color-scheme: ${theme}; }
body { margin: 0; padding: 20px; background: ${bg}; color: ${fg};
  font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
  color: ${muted}; margin: 24px 0 12px; }
h2:first-child { margin-top: 0; }
.grid { display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(164px, 1fr)); }
.card { display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
  background: ${cardBg}; border: 1px solid transparent; border-radius: 10px;
  padding: 10px; cursor: pointer; color: inherit; font: inherit; text-align: left; }
.card:hover, .card:focus-visible { border-color: ${curveTheme.stroke}; outline: none; }
.card svg { width: 100%; height: auto; border-radius: 6px; }
.name { font-weight: 600; margin-top: 6px; }
.sub { color: ${muted}; font-size: 12px; }
.hint { color: ${muted}; margin: 0 0 16px; }
</style></head><body>
<p class="hint">Click a curve to insert its name at the cursor — or to copy it when no editor is focused.</p>
<h2>Easings</h2><div class="grid">${easingCards}</div>
<h2>Spring presets</h2><div class="grid">${springCards}</div>
<script>
const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;
for (const card of document.querySelectorAll(".card")) {
  card.addEventListener("click", () => {
    vscode?.postMessage({ type: "insert", value: JSON.stringify(card.dataset.insert) });
  });
}
</script>
</body></html>`;
};
