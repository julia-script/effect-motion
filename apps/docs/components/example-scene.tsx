"use client";

import { Player } from "@effect-motion/react";
import { examples } from "@/examples/registry";

export function ExampleScene({ name }: { name: string }) {
	const scene = examples[name];
	if (scene === undefined) {
		throw new Error(`Unknown example "${name}"`);
	}
	return (
		<div className="rounded-xl border bg-white p-3 [&_svg]:max-w-full">
			<Player scene={scene} width={500} height={300} />
		</div>
	);
}
