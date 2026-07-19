---
"@effect-motion/cli": patch
---

`motion.config.ts` targets accept a `player` block — studio-only preview options (`autoPlay`, `defaultRepeatMode`, `isInfinite`, `prebufferedFrames`, `bufferCapacity`) passed to the studio's Player, overriding its defaults. `motion render` ignores it.
