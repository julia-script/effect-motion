# Tasks: Add Group Hierarchy

## 1. Group definition

- [x] 1.1 `shapes/Group.ts`: position + opacity + `children: Schema.Array(Schema.String)` (default empty), namespace `shapes/Group`; export from shapes index (design D1)

## 2. Runner and Scene

- [x] 2.1 Runner: create the root Group instance (fixed id `"root"`) at make(); `state` returns `{ instances, root: "root" }` (design D2)
- [x] 2.2 Runner.instantiate gains `parent?: Instance` — append the new id to the parent's children, default root (design D3)
- [x] 2.3 Runner.destroy strips the destroyed id from every group's children (full scan, no parent map) (design D3)
- [x] 2.4 Scene: thread `{ parent? }` options through `Scene.instantiate`; update `Frame` type to `{ instances, root }` (design D2)

## 3. Renderer traversal

- [x] 3.1 Renderer.make: post-order traversal from `frame.root` (duck-typed containers: data with a `children` id array); visited-set defects for duplicate/cycle and dangling ids; root's children become the top-level entries for `config.render` (design D2/D4)
- [x] 3.2 `RenderFunction` payload gains `children: ReadonlyArray<RenderEntitySuccess>` (empty for leaves) (design D4)
- [x] 3.3 `svg/shapes.ts`: group entry — `{ tag: "g", props: { transform (omitted at 0/0), opacity (omitted at 1) }, children }`; register in `shapesLayer` (design D5/D6)

## 4. Tests

- [x] 4.1 Group rendering: group translate + opacity wrap children through BOTH sinks; nested groups nest `g` elements; child coordinates stay local
- [x] 4.2 Attachment: default parent is root (flat scenes unchanged); explicit parent attaches; destroy detaches; reorder children changes output order
- [x] 4.3 Defects: duplicate reference across two groups; cycle; dangling id — each dies naming the id
- [x] 4.4 Update existing tests for the `{ instances, root }` frame shape (manual frames in svg/shapes tests gain a root group)

## 5. Demo and verify

- [x] 5.1 Playground/demo: a grouped pair moving together via one `Motion.moveTo` on the group
- [x] 5.2 `pnpm check`, `pnpm lint`, `pnpm test` green; headless + browser verification of grouped motion
