import { Effect } from "effect";
import { expect, it } from "vitest";

it("effect runs", () => {
	expect(Effect.runSync(Effect.succeed(1))).toBe(1);
});
