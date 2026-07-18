import { Player, type PlayerProps } from "@effect-motion/react";
import { useEffect, useMemo, useState } from "react";
import { projectRoot } from "./project";

// minimal local mirror of the CLI's config types — the app deliberately
// avoids importing @effect-motion/cli so it has zero resolution assumptions
// beyond the project's own dependencies
type TargetLike = {
	readonly name?: string;
	readonly scene?: string;
	readonly settings?: Record<string, unknown>;
};
type ConfigLike = { readonly targets?: ReadonlyArray<TargetLike> };

type SceneEntry = {
	/** picker identity: `target:<name>` for config targets, `file:<path>` otherwise */
	readonly key: string;
	readonly label: string;
	/** project-relative module path */
	readonly path: string;
	readonly registered: boolean;
	readonly settings: PlayerProps["settings"] | undefined;
	readonly load: () => Promise<unknown>;
};

// every scene in src/scenes is previewable without registration; vite keeps
// this list current as files appear and disappear
const globbed = import.meta.glob("../../src/scenes/*.ts");

const normalize = (p: string) => p.replace(/^\.\//, "").replace(/^\//, "");
const globKey = (p: string) => normalize(p.replace(/^(\.\.\/)+/, ""));
const fileLabel = (key: string) =>
	key
		.split("/")
		.at(-1)
		?.replace(/\.(ts|tsx|mts|js|mjs)$/, "") ?? key;

const loadByAbsolutePath = (key: string) => () =>
	import(/* @vite-ignore */ `/@fs${projectRoot}/${key}`);

const buildEntries = (config: ConfigLike | null): ReadonlyArray<SceneEntry> => {
	// one entry per config target (a scene file can back several targets with
	// different settings), plus one per scenes-dir file no target references
	const globLoaders = new Map(
		Object.entries(globbed).map(([path, load]) => [globKey(path), load]),
	);
	const referenced = new Set<string>();
	const entries: Array<SceneEntry> = [];
	for (const target of config?.targets ?? []) {
		if (typeof target?.scene !== "string" || typeof target.name !== "string")
			continue;
		const path = normalize(target.scene);
		referenced.add(path);
		entries.push({
			key: `target:${target.name}`,
			label: target.name,
			path,
			registered: true,
			// a registered scene previews with its target settings so the
			// preview aspect matches the export
			settings: target.settings as PlayerProps["settings"],
			load: globLoaders.get(path) ?? loadByAbsolutePath(path),
		});
	}
	for (const [path, load] of globLoaders) {
		if (referenced.has(path)) continue;
		entries.push({
			key: `file:${path}`,
			label: fileLabel(path),
			path,
			registered: false,
			settings: undefined,
			load,
		});
	}
	return entries.sort((a, b) => a.label.localeCompare(b.label));
};

// selection survives the full-page reloads that scene edits trigger
const selectionFromHash = () =>
	decodeURIComponent(window.location.hash.slice(1)) || null;

type SceneState =
	| { readonly _tag: "idle" }
	| { readonly _tag: "loading" }
	| { readonly _tag: "error"; readonly key: string; readonly message: string }
	| {
			readonly _tag: "ready";
			readonly key: string;
			readonly scene: PlayerProps["scene"];
	  };

export const App = () => {
	const [config, setConfig] = useState<ConfigLike | null>(null);
	const [configError, setConfigError] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(selectionFromHash);
	const [state, setState] = useState<SceneState>({ _tag: "idle" });

	useEffect(() => {
		// the config is optional for studio — a project without one still
		// previews everything in src/scenes
		import(/* @vite-ignore */ `/@fs${projectRoot}/motion.config.ts`).then(
			(module_) => setConfig((module_.default ?? null) as ConfigLike | null),
			() => setConfig(null),
		);
	}, []);

	const entries = useMemo(() => buildEntries(config), [config]);
	const entry = entries.find((e) => e.key === selected) ?? entries[0];

	useEffect(() => {
		if (entry === undefined) return;
		let cancelled = false;
		setState({ _tag: "loading" });
		setConfigError(null);
		entry.load().then(
			(module_) => {
				if (cancelled) return;
				const scene = (module_ as { scene?: PlayerProps["scene"] }).scene;
				if (scene === undefined) {
					setState({
						_tag: "error",
						key: entry.key,
						message: `${entry.path} has no \`scene\` export`,
					});
				} else {
					setState({ _tag: "ready", key: entry.key, scene });
				}
			},
			(error) => {
				if (cancelled) return;
				setState({
					_tag: "error",
					key: entry.key,
					message: `failed to load ${entry.path}\n\n${error instanceof Error ? error.message : String(error)}`,
				});
			},
		);
		return () => {
			cancelled = true;
		};
	}, [entry]);

	return (
		<>
			<nav className="studio-sidebar">
				<h1>Scenes</h1>
				{entries.map((e) => (
					<button
						key={e.key}
						type="button"
						className="studio-scene-button"
						data-active={e.key === entry?.key}
						onClick={() => {
							window.location.hash = encodeURIComponent(e.key);
							setSelected(e.key);
						}}
					>
						{e.label}
						<small>{e.registered ? e.path : `${e.path} (unregistered)`}</small>
					</button>
				))}
				{entries.length === 0 && (
					<p className="studio-empty">
						No scenes found — add one in src/scenes/
					</p>
				)}
				{configError !== null && <p className="studio-empty">{configError}</p>}
			</nav>
			<main className="studio-main">
				{state._tag === "error" && (
					<div className="studio-error">
						<h2>Scene failed to load</h2>
						<pre>{state.message}</pre>
					</div>
				)}
				{state._tag === "ready" && (
					<Player
						key={state.key}
						scene={state.scene}
						autoPlay
						defaultRepeatMode
						{...(entry?.settings !== undefined
							? { settings: entry.settings }
							: {})}
					/>
				)}
				{(state._tag === "idle" || state._tag === "loading") &&
					entries.length === 0 && (
						<p className="studio-empty">
							Create src/scenes/my-scene.ts exporting a `scene` to get started.
						</p>
					)}
			</main>
		</>
	);
};
