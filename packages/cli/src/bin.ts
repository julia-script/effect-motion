#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import * as Runtime from "effect/Runtime";
import { Command } from "effect/unstable/cli";
import { CLI_VERSION, reportErrors, rootCommand } from "./cli.js";

// read pre-parse so the reporter works even when parsing itself fails
const verbose = process.argv.includes("--verbose");

const program = reportErrors(
	Command.run(rootCommand, { version: CLI_VERSION }),
	verbose,
);

// every typed failure is handled by reportErrors, so the default reporter
// only ever fires for defects — bugs in the CLI itself, where a trace is right
// runMain only exits on failure, and after a GPU render three's rAF shim
// keeps the event loop alive — so exit on success too, once stdout drains
// (piped stdout is async on macOS; `--json -` output must not be cut off)
NodeRuntime.runMain(Effect.provide(program, NodeServices.layer), {
	teardown: (exit) =>
		Runtime.defaultTeardown(exit, (code) => {
			// a success exit keeps the reporter's `process.exitCode`
			process.stdout.write("", () =>
				process.exit(code === 0 ? (process.exitCode ?? 0) : code),
			);
		}),
});
