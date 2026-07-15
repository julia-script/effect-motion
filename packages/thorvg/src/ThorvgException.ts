import { Data } from "effect";

/** ThorVG C-API result codes (mirrors the glue's `ThorVGResultCode`). */
export const resultCodeMessages: Record<number, string> = {
	0: "Success",
	1: "Invalid arguments",
	2: "Insufficient condition",
	3: "Failed allocation",
	4: "Memory corruption",
	5: "Not supported",
	6: "Unknown error",
};

export const messageForCode = (code: number): string =>
	resultCodeMessages[code] ?? "Unknown error";

export class ThorvgException extends Data.TaggedError("ThorvgException")<{
	cause?: unknown;
	/** ThorVG result code, when the failure came from a checked C-API call. */
	code?: number;
	/** Name of the C-API operation that failed. */
	operation?: string;
}> {}
