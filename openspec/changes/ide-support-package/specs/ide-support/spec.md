# ide-support Delta Specification

## ADDED Requirements

### Requirement: Editor support ships as one package with two faces
Editor support SHALL live in a single workspace package published to npm as `@effect-motion/ide` and packageable as a VS Code extension from the same folder. The npm surface SHALL expose the editor-agnostic library and the asset files; the vsix SHALL contain only the bundled extension entry and the contributed data files. The extension entry SHALL be CommonJS (the format the extension host loads) while the library SHALL be ESM like every other package in the workspace. No module reachable from the extension entry SHALL import an editor API from the library half.

#### Scenario: npm consumer imports the catalogs
- **WHEN** a project installs `@effect-motion/ide` and imports `@effect-motion/ide/Easings`
- **THEN** the module loads without VS Code present

#### Scenario: vsix excludes the library half
- **WHEN** the package is built and packaged
- **THEN** the vsix contains `dist/extension.cjs` and the `assets/` tree, and does not contain the package's `src/`, `test/`, or `dist/*.js` library output

### Requirement: Derived facts are computed from the library, never restated
Every fact the integration displays that the library also determines — easing curve shape, spring length, entity fields, colour values, the set of valid names — SHALL be either computed from the library at runtime or verified against it by an automated test. A catalog the integration keeps locally SHALL fail a test when it disagrees with the library's own.

#### Scenario: Curves come from the real easing functions
- **WHEN** a curve preview is generated for a named easing
- **THEN** its samples equal the corresponding `Timing.timingFunctions` entry evaluated at the same inputs

#### Scenario: Spring frame counts match the engine
- **WHEN** the test suite runs a scene through `Physics.springTo` for each preset and compares the frames it emits against the integration's reported length
- **THEN** the counts agree, at more than one frame rate and more than one travel distance

#### Scenario: A new easing in the core fails the integration's tests
- **WHEN** an easing is added to `Timing.timingFunctions` without being added to the catalog and the grammar
- **THEN** the integration's tests fail

#### Scenario: A palette change fails the drift test
- **WHEN** `Color.twMap` changes and the generated palette is not regenerated
- **THEN** the integration's tests fail

### Requirement: TextMate injection grammar for scene vocabulary
The package SHALL ship a TextMate injection grammar registered against the TypeScript and JavaScript scopes. It SHALL scope built-in easing names, spring preset names, entity tags, and the value and unit of Effect duration strings, plus namespace-qualified authoring calls on `Scene`, `Motion`, `Physics`, and `Camera`. The grammar SHALL NOT define a new language and SHALL NOT apply inside comments or template literals. Name matching SHALL be restricted to argument-terminal position, and a matched literal SHALL retain the string scopes the base grammar would have applied to its quotes.

#### Scenario: An easing in an animator call is scoped
- **WHEN** a file contains `Motion.moveTo(dot, { x: 1 }, "1 second", "easeInOutCubic")`
- **THEN** `easeInOutCubic` carries an easing scope and the surrounding quotes still carry the base grammar's string scopes

#### Scenario: A name outside argument position is left alone
- **WHEN** a file contains `const mode = "linear";`
- **THEN** `linear` carries no easing scope

#### Scenario: No alternative shadows a longer one
- **WHEN** the grammar's easing alternation is read
- **THEN** no name in it is a prefix of a name appearing later in the same alternation

### Requirement: Hovers show what types cannot
Hovering a built-in easing name SHALL show its curve, drawn so that a curve leaving [0, 1] is visible rather than clipped, together with whether it lands on target, overshoots deliberately, or returns to its starting value. Hovering a spring preset SHALL show its simulated curve, its physical parameters, and the frames and seconds it occupies at a stated frame rate and travel distance, or that it never settles. Hovering a duration string SHALL show its length in frames at a stated frame rate, flagging a duration that does not land on a whole frame. Hovering an entity tag SHALL show what it draws and its own and shared fields. Previews SHALL follow the editor's light or dark theme.

#### Scenario: An overshooting curve is drawn in full
- **WHEN** `easeOutBack` is hovered
- **THEN** the preview's plotted points all fall inside the image bounds

#### Scenario: A spring reports its length
- **WHEN** `"plop"` is hovered with the frame rate set to 60
- **THEN** the hover names the frames it occupies, the seconds that is, and the frame rate and distance assumed

#### Scenario: Frame counts state their assumption
- **WHEN** any hover reports a frame count
- **THEN** it names the frame rate used and identifies it as the editor's setting

### Requirement: Colour swatches preserve the author's constructor
Calls to the colour constructors `hex`, `rgba`, `hsl`, `lab`, `oklch`, and `tw`, reached through whatever identifier the file binds `Color` to, SHALL show a colour swatch when every argument is a literal. Editing through the colour picker SHALL rewrite the call using the same constructor wherever that constructor can express the chosen colour, and SHALL fall back to `hex` for `tw`, whose palette is a closed set of names. A call with a non-literal argument, an unterminated call, or a call in a file that does not import effect-motion SHALL produce no swatch.

#### Scenario: A perceptual constructor survives an edit
- **WHEN** the picker changes the colour of an `oklch` call
- **THEN** the replacement is an `oklch` call

#### Scenario: A palette call falls back visibly
- **WHEN** the picker changes the colour of a `tw` call
- **THEN** the replacement is a `hex` call with the chosen colour

#### Scenario: A computed colour is skipped
- **WHEN** a file contains `Color.hex(brand)`
- **THEN** no swatch appears

### Requirement: Suggestions are offered by argument order, not index
Completions SHALL be offered inside a string argument according to the call it belongs to and the order of the arguments before it, so that both call forms of a dual animator behave identically. Inside a `Motion` animator, a string argument SHALL offer durations until a duration argument has been written and easings thereafter. `Physics` spring animators SHALL offer spring presets, `Scene.instantiate`'s first argument SHALL offer entity tags, and `Motion.wait` / `Scene.sleep` SHALL offer durations. A string inside a nested object or array literal SHALL NOT inherit the enclosing call's suggestions. Each item SHALL carry the same preview its hover would show.

#### Scenario: Both dual forms behave the same
- **WHEN** the cursor is in the final string of `Motion.fadeTo(dot, 0, "400 millis", "")` and of `dot.pipe(Motion.fadeTo(0, "400 millis", ""))`
- **THEN** both offer easings

#### Scenario: Props are not arguments
- **WHEN** the cursor is inside `Scene.instantiate("Circle", { text: "" })`
- **THEN** no entity tags are offered

### Requirement: A gallery for comparing curves
The extension SHALL provide a command opening a view showing every easing and every spring preset side by side, each with its curve, and SHALL insert a chosen name at the cursor when one is selected. The view SHALL load nothing from the network. A quick-pick command over the same catalog SHALL also be provided.

#### Scenario: Selecting a curve inserts it
- **WHEN** a curve is chosen in the gallery and an editor is open
- **THEN** its quoted name replaces the selection

### Requirement: Run lenses invoke the project's own CLI
Code lenses SHALL appear above scene declarations and above studio and render entrypoints, and SHALL run the `motion` CLI through the workspace's package manager, detected from the workspace lockfile unless configured. A scene's lens SHALL open the studio and SHALL NOT offer a render, which the CLI runs from an entrypoint rather than a scene module.

#### Scenario: The project's CLI is used
- **WHEN** a lens is invoked in a workspace with a `pnpm-lock.yaml`
- **THEN** the CLI is run through `pnpm exec`

### Requirement: No cost in unrelated TypeScript
Every provider SHALL determine that a document imports effect-motion before doing any other work, and SHALL produce nothing for a document that does not. Recognition of effect-motion's namespaces SHALL follow the file's own imports, covering both the barrel and deep-import forms and any alias, and SHALL ignore type-only imports.

#### Scenario: An unrelated file produces nothing
- **WHEN** a TypeScript file that never imports effect-motion is opened
- **THEN** no swatches, hovers, completions, or lenses are produced for it

#### Scenario: An aliased deep import is recognised
- **WHEN** a file contains `import * as C from "effect-motion/Color"` and `C.hex("#7f5af0")`
- **THEN** the call gets a swatch, and an edit rewrites it as `C.hex(...)`

### Requirement: Assets and catalogs are consumable outside VS Code
The package SHALL export the absolute paths of the shipped grammar and snippet files, and SHALL export every catalog — easings, spring presets, and entity tags, with their prose — as JSON-serialisable data, so that another editor's integration or the documentation site can consume them without vendoring a copy.

#### Scenario: Another editor registers the grammar
- **WHEN** a consumer reads the exported grammar path
- **THEN** it resolves to the shipped injection grammar file inside the installed package

#### Scenario: The catalog round-trips as JSON
- **WHEN** the exported catalog is serialised and parsed
- **THEN** it is unchanged, and covers every easing, preset, and entity the library defines
