## ADDED Requirements

### Requirement: Fumadocs documentation app
The monorepo SHALL contain a docs app at `apps/docs` built on Next.js and Fumadocs, with MDX content pages (at minimum: an index/introduction and a getting-started page) and standard docs chrome (sidebar navigation, table of contents, highlighted code blocks). The app SHALL build with the monorepo `build` task and run locally with a `dev` task.

#### Scenario: Docs build in the task graph
- **WHEN** the monorepo build task runs
- **THEN** the docs app builds successfully after its workspace dependencies

#### Scenario: Content pages render
- **WHEN** a visitor opens the docs site root
- **THEN** an introduction page renders with sidebar navigation to the other pages

### Requirement: Live examples embed the Player
The docs SHALL include an examples section where each example page embeds the scene running in the `@effect-motion/react` Player (client-side; the scene collects and plays in the browser) alongside the example's source code. At minimum the following examples SHALL exist: easing race, springs, groups, and seeded randomness.

#### Scenario: Example page plays a scene
- **WHEN** a visitor opens an example page
- **THEN** the scene renders in the Player with working transport controls (play/pause, progress bar)

#### Scenario: Example source is displayed
- **WHEN** a visitor views an example page
- **THEN** the scene's source code is shown with syntax highlighting

### Requirement: Scratchpad route for ad-hoc experiments
The docs app SHALL provide a `/scratchpad` route rendering an editable-in-source scene in the Player, replacing the removed playground app as the place to try things quickly. It SHALL NOT appear in the docs navigation.

#### Scenario: Scratchpad plays its scene
- **WHEN** a developer opens `/scratchpad` and edits the scratchpad scene in source
- **THEN** the route plays the updated scene in the Player with transport controls

### Requirement: Example code and animation cannot drift
Each example SHALL be defined in a single source file that is both executed by the Player and displayed as the code sample. The displayed code MUST be derived from that file's actual contents, not a manually maintained copy.

#### Scenario: Editing an example updates both views
- **WHEN** an example's source file changes
- **THEN** the played animation and the displayed code both reflect the change with no other edits
