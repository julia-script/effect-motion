import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
	reactStrictMode: true,
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
