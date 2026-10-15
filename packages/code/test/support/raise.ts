export const raise = (message: string): never => {
	throw new Error(message);
};

export const unreachable = (): never => {
	throw new Error("Unreachable");
};
