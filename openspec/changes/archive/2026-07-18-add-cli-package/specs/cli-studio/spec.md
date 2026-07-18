## ADDED Requirements

### Requirement: Player preview server
`motion studio` SHALL start a Vite dev server hosting a CLI-shipped app that mounts the `@effect-motion/react` `Player` for a selected scene from the user's project. `--port` and `--host` flags SHALL pass through to Vite; the chosen URL SHALL be printed on startup.

#### Scenario: Studio serves the player
- **WHEN** `motion studio` runs in a scaffolded project and the printed URL is opened
- **THEN** the page shows the Player playing a project scene

### Requirement: Scene discovery without registration
The studio scene picker SHALL list both config targets and unregistered scene modules matching `src/scenes/*.ts`. Preview MUST NOT require a scene to be registered in the config. When a picked scene corresponds to a config target, the target's `settings` SHALL be applied to the preview.

#### Scenario: Unregistered scene previewable
- **WHEN** a new file `src/scenes/scratch.ts` exporting `scene` is added without touching the config
- **THEN** it appears in the picker and plays

#### Scenario: Registered scene previews with its settings
- **WHEN** a picked scene is registered as a target declaring `width`/`height`
- **THEN** the preview uses those dimensions

### Requirement: Hot reload on scene edits
Editing a scene module or the config SHALL update the running studio without a manual server restart; full-page reload semantics are acceptable (playback restarts from frame 0).

#### Scenario: Edit reflects in the browser
- **WHEN** a previewed scene file is saved with a visible change
- **THEN** the browser updates to the new scene without restarting `motion studio`

### Requirement: Load failures surface in the browser
A scene module that throws or lacks a `scene` export SHALL produce a visible error in the studio UI (naming the file), not a blank page or silent console-only failure.

#### Scenario: Broken scene shows an error panel
- **WHEN** a previewed scene file is saved with a syntax error
- **THEN** the studio shows an error naming the file, and recovers on the next successful save
