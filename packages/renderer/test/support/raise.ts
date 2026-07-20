/** Throw at a place the types say is unreachable (instead of a non-null assertion). */
export const unreachable = (message = "unreachable"): never => {
	throw new Error(message);
};
