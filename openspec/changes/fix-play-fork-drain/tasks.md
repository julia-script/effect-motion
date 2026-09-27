## 1. Fix

- [x] 1.1 `Phaser.run`: fork uninterruptibly; `onExit` hook + party release installed before the interruptible body
- [x] 1.2 `forkBranch`: failure recording and finish move into the `onExit` hook
- [x] 1.3 `Scene.play`: drain the child's own forks; last fork finishes the played branch synchronously

## 2. Tests

- [x] 2.1 play: fork at the child's end plays out; frame count matches standalone / fork-free child
- [x] 2.2 play: background as the child's last statement does not hang
- [x] 2.3 fork: fork spawned as a fork's last statement does not deadlock
- [x] 2.4 background-only scenes yield one resting frame, like an empty body
