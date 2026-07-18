import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type { ViteDevServer } from "vite";
import { MotionCliError } from "./MotionCliError.js";

/**
 * The one TypeScript loader of the CLI: a Vite server in middleware mode
 * whose `ssrLoadModule` executes user TS (config and scenes) in Node.
 * Studio uses a Vite server too, so preview and render resolve the same
 * module graph — the design's single-resolver invariant.
 */
export interface ViteLoader {
	readonly load: (
		file: string,
	) => Effect.Effect<Record<string, unknown>, MotionCliError>;
	readonly server: ViteDevServer;
}

export const makeViteLoader = (
	root: string,
): Effect.Effect<ViteLoader, MotionCliError, Scope.Scope> =>
	Effect.acquireRelease(
		Effect.tryPromise({
			try: async () => {
				const { createServer } = await import("vite");
				return createServer({
					root,
					configFile: false,
					logLevel: "error",
					appType: "custom",
					server: {
						middlewareMode: true,
						// a load-only server: no HMR socket, no file watching
						hmr: false,
						watch: null,
					},
					optimizeDeps: { noDiscovery: true },
				});
			},
			catch: (cause) =>
				new MotionCliError({
					reason: "SceneLoadFailed",
					message: `could not start the module loader (vite) in ${root}`,
					cause,
				}),
		}),
		(server) => Effect.promise(() => server.close()),
	).pipe(
		Effect.map((server) => ({
			server,
			load: (file: string) =>
				Effect.tryPromise({
					try: () => server.ssrLoadModule(file),
					catch: (cause) =>
						new MotionCliError({
							reason: "SceneLoadFailed",
							message: `failed to load ${file}`,
							cause,
						}),
				}),
		})),
	);
