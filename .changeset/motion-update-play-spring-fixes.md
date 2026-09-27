---
"effect-motion": patch
---

`Scene.update` now dies naming the instance and its missing fields when given partial data (possible from untyped code), instead of silently corrupting the entity. `PlayHandle.group` is typed `Instance<"Group">`, so it passes to Group helpers without a cast. `Physics.springTo`/`spring` only simulate the axes you name: omitted axes stay exactly unchanged, where a preset with `initialVelocity` (`jump`, `strike`, `beat`) used to drift them before settling.
