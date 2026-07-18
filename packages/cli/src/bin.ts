#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import * as Effect from "effect/Effect";
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
NodeRuntime.runMain(Effect.provide(program, NodeServices.layer));
