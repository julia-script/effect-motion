# Tasks: add-text-entity

## 1. Entity

- [x] 1.1 Add `shapes/Text.ts` (`Entity.make("shapes/Text", …)`): required `text`, `Shape2D.filled` spread, `fontSize` defaultedNumber(16), `fontFamily` defaulted to `"sans-serif"`, optional `textAnchor`/`baseline` literals; standard `~position`/`~opacity` lenses; export from `shapes/index.ts`
- [x] 1.2 Tests: constructor defaults (visible, 16px, sans-serif); required `text` (constructing without it is a type/decode error)

## 2. SVG rendering

- [x] 2.1 Add the `text` render function in `svg/shapes.ts` (props mapping incl. conditional `text-anchor`/`dominant-baseline`, `children: data.text`) and register it in `shapesLayer`
- [x] 2.2 Tests: string-sink markup (attributes, content escaping of `<`/`&`); optional attrs omitted when unset; centered-text attributes present when set

## 3. Motion coverage

- [x] 3.1 Tests: `moveTo`/`fadeTo` on a Text via traits; `tweenTo({ fontSize })` interpolates and renders

## 4. Docs

- [x] 4.1 Playable example: a title that fades in, pops `fontSize` (easeOutBack), and settles — registered in the docs example registry; note the no-measurement limitation and the `textAnchor`/`baseline` centering idiom wherever shapes are documented
