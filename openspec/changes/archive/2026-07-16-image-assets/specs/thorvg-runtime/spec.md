# thorvg-runtime (delta)

## MODIFIED Requirements

### Requirement: Render session bundles canvas and fonts
The package SHALL expose a render-session resource that, on open, acquires a canvas at the requested size, acquires the requested fonts (per the thorvg-fonts capability), and loads the requested images (name→url, decoded once into session-owned pictures), and on close releases all of them. Consumers (player mounts, export runs) SHALL interact with the canvas/fonts/pictures only through a session.

#### Scenario: Session opens with fonts ready
- **WHEN** a session is opened with a family→source font map
- **THEN** after open, text in those families renders on the session's canvas

#### Scenario: Session close releases fonts
- **WHEN** the only session holding a family closes
- **THEN** that family's refcount reaches zero and the registry releases the hold (engine unload is best-effort per the thorvg-fonts capability)

#### Scenario: Session opens with images decoded
- **WHEN** a session is opened with a name→url image map
- **THEN** after open, the session exposes a decoded picture per successfully loaded name

#### Scenario: Session close releases pictures
- **WHEN** a session closes
- **THEN** its decoded pictures are freed with the session scope
