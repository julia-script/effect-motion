"use client";

import { Player } from "@effect-motion/react";
import { type ExampleEntry, examples } from "@/examples/registry";

export function ExampleScene({ name }: { name: string }) {
	const example = examples[name];
	if (example === undefined) {
		throw new Error(`Unknown example "${name}"`);
	}
	// registry entries are heterogeneous (each example file keeps its own
	// precise scene/layer typing); normalize here and hand the player the
	// loader layers when the example ships them
	const entry: ExampleEntry = "scene" in example ? example : { scene: example };
	return (
		<div className="my-6">
			{entry.renderLayers !== undefined ? (
				<Player
					scene={entry.scene as never}
					renderLayers={entry.renderLayers as never}
				/>
			) : (
				<Player scene={entry.scene as never} />
			)}
		</div>
	);
}
