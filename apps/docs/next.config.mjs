import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
	reactStrictMode: true,
	// The font engine resolves its HarfBuzz WASM via `new URL(...,
	// import.meta.url)`. Bundling it server-side rewrites that to a
	// /_next/static asset URL the Node loader then tries to fs-read — keep it
	// external so SSR/prerender loads the real file from node_modules.
	serverExternalPackages: ["@text-rendering-toolkit/font"],
	// The @thorvg/webcanvas glue has a Node-only branch that statically
	// references `import("module")` (createRequire). It never runs in the
	// browser, but the bundler still resolves it — alias it to an empty module
	// for the client bundle. Consumers bundling @effect-motion/react need the
	// same shim (turbopack alias below; webpack fallback for `next build`).
	turbopack: {
		resolveAlias: {
			module: { browser: "./shims/empty.mjs" },
		},
	},
	webpack: (webpackConfig, { isServer }) => {
		if (!isServer) {
			webpackConfig.resolve.fallback = {
				...webpackConfig.resolve.fallback,
				module: false,
			};
		}
		return webpackConfig;
	},
};

export default withMDX(config);
