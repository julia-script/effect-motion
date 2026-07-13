import fs from "node:fs";
import path from "node:path";
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { ExampleScene } from "./example-scene";

/**
 * Embed a live example: the scene playing in the Player, followed by
 * the source that produced it. The code is read from the same file the
 * registry executes (`examples/<name>.scene.ts`), so the two can't
 * drift.
 */
export function Example({ name }: { name: string }) {
	const source = fs.readFileSync(
		path.join(process.cwd(), "examples", `${name}.scene.ts`),
		"utf8",
	);
	return (
		<div className="my-6 flex flex-col gap-4">
			<ExampleScene name={name} />
			<DynamicCodeBlock lang="ts" code={source.trim()} />
		</div>
	);
}
