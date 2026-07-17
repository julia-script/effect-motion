# thorvg-images (delta)

## MODIFIED Requirements

### Requirement: Picture data is paint-tier
Per-frame picture paints SHALL follow the existing paint lifecycle: the paint owns its decoded data, ownership transfers to the parent on add, and a detached picture is freed by its scope finalizer. A render session MAY hold source pictures for reuse across frames — those are still scope-owned paints, released when the session closes. No engine-level registry SHALL hold picture data.

#### Scenario: Detached picture freed on scope close
- **WHEN** a picture is loaded but never added to a parent and the scope closes
- **THEN** the picture and its decoded data are freed exactly once

#### Scenario: Session-held source pictures die with the session
- **WHEN** a session holding decoded source pictures closes
- **THEN** those pictures are freed by the session scope, and no engine-level state retains them
