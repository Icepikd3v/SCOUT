# S.C.O.U.T. Avatar System (Phase 1)

## Visual Direction
- Friendly, simple, expressive face inspired by your screenshots.
- Less complex art style (cartoon robot vibe like BMO-type simplicity).
- Blue-toned face palette with high-contrast eyes for readability.

## Avatar States
- `idle`: soft blink every few seconds.
- `listening`: attentive eyes + subtle pulse.
- `thinking`: small eye movement / eyebrow tilt.
- `speaking`: mouth shapes tied to speech amplitude buckets.
- `alert`: brief highlight when safety cue is urgent.

## Rendering Approach
Recommended for Pi:
- HTML/CSS/Canvas face renderer in kiosk mode.
- State machine drives expressions (no heavy 3D stack).
- 30 FPS target, degrade to 20 FPS under load.

## Lip-Sync (Simple)
- Do not do phoneme-level sync in Phase 1.
- Use 3-4 mouth shapes based on outgoing audio amplitude:
  - closed
  - small open
  - medium open
  - smile/open

## Data Contract
Runtime sends events over WebSocket:
- `avatar.state` (`idle|listening|thinking|speaking|alert`)
- `avatar.intensity` (`0-1`)
- `avatar.mood` (`calm|encouraging|urgent`)

## UX Rules
- Voice and face should always agree on state.
- Urgent cues must be short and visually distinct.
- Keep expression changes smooth; avoid rapid flicker.

## Asset Plan
- 2D layered assets (face base, eyes, brows, mouth, cheeks).
- SVG preferred for crisp scaling to 7-inch display.

## Phase 1 Deliverable
- On boot: avatar enters `idle`.
- On user speech: avatar switches to `listening`.
- During model call: avatar shows `thinking`.
- During TTS: avatar animates `speaking` + transcript line.
