// Empty shim: the @thorvg/webcanvas glue references node:"module" in a
// Node-only branch that never runs in the browser. This satisfies the
// bundler resolve without pulling anything real in.
export default {};
export const createRequire = () => () => ({});
