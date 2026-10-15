## ADDED Requirements

### Requirement: A played scene's end includes its forks
A played scene SHALL end the way it would standalone: after its body returns, it SHALL keep running until every fork it spawned reaches its semantic end, and only then finish its branch. The last such fork SHALL finish the played branch synchronously, so awaiters of `finished` proceed at the same frame boundary as for a child without forks. The child's backgrounds and finished tails SHALL be cut when the played scene ends. `Scene.finish` inside the child SHALL still finish the played branch early.

#### Scenario: Exit tail forked at the end of the child
- **WHEN** a played scene's body ends by forking a half-second exit animation, and the parent awaits the handle's `finished`
- **THEN** the exit plays to its target, the stream ends, and the movie has as many frames as one that plays and awaits a child of the same total length without forks

#### Scenario: Background spawned as the child's last statement
- **WHEN** a played scene's body ends by spawning a background
- **THEN** the movie ends normally, with the same length as without that background
