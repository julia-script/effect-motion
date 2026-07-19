# Tasks — Nested Scene Composition

## 1. Scene composition config (core)

- [x] 1.1 Finish `Scene.make(gen, meta?)` in `packages/motion/src/Scene.ts` (in the working tree): `width`/`height`/`backgroundColor` on the Scene interface, defaults 1920/1080/transparent, shared through `annotate`/`annotateMerge`
- [x] 1.2 Shrink `Runner.Settings` to `frameRate`/`seed`/`maxFrames`; `Runner.make` takes root comp config (width/height/backgroundColor) as an explicit input; camera default stays `Camera.identity(rootWidth)`
- [x] 1.3 `Scene.run`/`Scene.stream` resolve comp config from the root scene and pass it to `Runner.make`; `FrameMeta` sources width/height/backgroundColor from it
- [x] 1.4 Update core tests that pass `{ width, height, backgroundColor }` as settings to set them via `Scene.make` meta instead

## 2. Bounded sub-composition mount

- [x] 2.1 `Scene.play`: instantiate an implicit Group per evaluation carrying the child's bounds, mounted under the ambient parent (or `options.parent`), set as the child's ambient current-parent, centered in the enclosing comp by default
- [x] 2.2 Expose the mount group on the play handle (`handle.group`); verify existing move/fade lenses and scale transforms drive the whole child
- [x] 2.3 Render layer (`render/paint.ts`): clip a scene-mount group's subtree to its bounds rect; paint non-transparent child backgroundColor within bounds beneath the subtree
- [x] 2.4 Tests: smaller child centered + clipped; child bigger than root; opaque vs transparent nested background; deep nesting (play inside play) composes transforms and clips; two parallel plays transform independently
- [x] 2.5 Determinism regression: nested-equals-standalone seed test still passes with the mount group in place

## 3. Downstream consumers

- [x] 3.1 `packages/react`: `Player`/`usePlayer` read width/height/backgroundColor from the scene (frame metadata), not from props/settings; drop the removed settings fields from prop types
- [x] 3.2 `packages/cli`: studio + render command + `motion.config.ts` schema — comp size/background come from the scene; config/player block keeps only playback fields (fps etc.)
- [x] 3.3 `apps/docs`: update example scenes and any MDX referencing width/height settings
- [x] 3.4 Changeset: major/minor per current pre-1.0 policy, noting the Settings break and the 500×300→1920×1080 default change

## 4. Verify

- [x] 4.1 `pnpm check && pnpm test && pnpm lint` clean (no NEW failures vs the pre-existing breakage baseline)
- [x] 4.2 Studio smoke: a root scene playing two smaller parallel scenes renders both, clipped, positioned independently
