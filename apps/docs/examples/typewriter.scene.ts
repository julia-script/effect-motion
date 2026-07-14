import { Motion, Scene, Shapes, Typewriter } from "effect-motion";

// The typewriter diffs the current text against the target and replays only
// the difference — so the second line doesn't retype the shared "Built with ",
// and the third only swaps the last word. Backspacing reads faster than
// typing, and seeded jitter keeps the rhythm human but deterministic.
export const scene = Scene.make(function* () {
	const line = yield* Scene.instantiate(Shapes.Text, {
		text: "",
		x: 250,
		y: 150,
		fontSize: 28,
		fill: "#2cb67d",
		textAnchor: "middle",
		baseline: "middle",
	});

	yield* line.pipe(
		// reveal from empty — the classic letter-by-letter case
		Typewriter.typewriteTo("Built with code.", { cps: 18, jitter: 0.6 }),
		Motion.wait("600 millis"),
		// only "code." is rewritten; "Built with " is left in place
		Typewriter.typewriteTo("Built with Effect.", { cps: 16, jitter: 0.6 }),
		Motion.wait("600 millis"),
		// swap the final word again — one local edit
		Typewriter.typewriteTo("Built with motion.", { cps: 16, jitter: 0.6 }),
		Motion.wait("800 millis"),
	);
});
