# cli-studio Specification (delta)

## REMOVED Requirements

### Requirement: Scene discovery without registration
**Reason**: Explicit registration in `studio.ts` replaces the `src/scenes/*.ts` glob. Registration is the feature: it is what lets the studio type loader coverage across all scenes, and it puts every scene in the entrypoint's import graph so Vite's ordinary HMR covers add/edit/remove — deleting the out-of-root watcher plugin the glob forced.
**Migration**: Add each scene to `studio.ts`'s `scenes` record (one import + one entry).

## MODIFIED Requirements

### Requirement: Player preview server
`motion studio [file]` SHALL start a Vite dev server hosting a CLI-shipped app that imports the studio entrypoint (default `./studio.ts` relative to the working directory; the positional argument selects a different file) and mounts the `@effect-motion/react` `Player` for the selected entry, passing the entry's player options and the config's `layers` as `renderLayers`. There SHALL be no config discovery walk: a missing entrypoint SHALL exit non-zero naming the expected path with a scaffold hint. `--port` and `--host` flags SHALL pass through to Vite; the chosen URL SHALL be printed on startup.

#### Scenario: Studio serves the registered scenes
- **WHEN** `motion studio` runs in a project whose `studio.ts` registers two scenes and the printed URL is opened
- **THEN** the picker lists both entries and selecting one plays it through the Player

#### Scenario: Alternate studio file
- **WHEN** `motion studio ./experiments.studio.ts` runs
- **THEN** that file's registrations are served instead of `./studio.ts`

#### Scenario: A resource-carrying scene previews with its loaders
- **WHEN** a registered scene requires a font and `studio.ts` provides it in `layers`
- **THEN** the preview renders that scene's text in the loaded font (the layers reach the Player as `renderLayers`)

#### Scenario: Missing entrypoint names the path
- **WHEN** `motion studio` runs in a directory with no `studio.ts`
- **THEN** the command exits non-zero with an error naming `./studio.ts`

### Requirement: Hot reload on scene edits
Editing the studio entrypoint or any module in its import graph (scenes, layers, transitive imports) SHALL update the running studio without a manual server restart, through Vite's ordinary module-graph HMR — no bespoke file watchers. Full-page reload semantics are acceptable (playback restarts from frame 0). Adding or removing a registration edits `studio.ts` itself and SHALL therefore refresh the picker the same way.

#### Scenario: Edit reflects in the browser
- **WHEN** a registered scene file is saved with a visible change
- **THEN** the browser updates to the new scene without restarting `motion studio`

#### Scenario: New registration appears without restart
- **WHEN** a new scene is imported and added to the `scenes` record in `studio.ts`
- **THEN** the picker shows the new entry without restarting the server

### Requirement: Load failures surface in the browser
A studio entrypoint (or any module it imports) that throws, or an entrypoint whose default export is not a branded `studioConfig` value, SHALL produce a visible error in the studio UI naming the file — not a blank page or silent console-only failure — and SHALL recover on the next successful save.

#### Scenario: Broken scene shows an error panel
- **WHEN** a registered scene file is saved with a syntax error
- **THEN** the studio shows an error naming the file, and recovers on the next successful save

#### Scenario: Wrong default export named
- **WHEN** `studio.ts` default-exports a plain object instead of `studioConfig(...)`
- **THEN** the studio shows an error naming `studio.ts` and the expected contract
