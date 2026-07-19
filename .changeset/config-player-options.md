---
"@effect-motion/cli": patch
---

`motion.config.ts` targets accept a `player` block — studio-only preview options mirroring `PlayerProps` (`autoPlay`, `defaultRepeatMode`, `isInfinite`, `prebufferedFrames`, `bufferCapacity`, `fps`) passed to the studio's Player, overriding its defaults. `player.fps` is a preview-only rate that wins over `settings.frameRate` in the studio (e.g. preview a heavy 60fps target at 30 — the scene runs at that rate, so previewed frames are not the export's frames). `motion render` ignores the whole block.
