# S.C.O.U.T. Phase 1 Stackflow

## Goal
Run an interactive AI co-pilot on Raspberry Pi 4B hardware with:
- Wake/listen via webcam mic
- Camera vision input via NexiGo webcam
- Display avatar + status on 7-inch screen
- Speak responses through Bluetooth speaker
- Use cloud LLM (OpenAI API key)

## Architecture (Phase 1)
1. Edge Device (Raspberry Pi 4B)
- `scout-ui` (Electron or kiosk web app): avatar face, status, transcript.
- `scout-runtime` (Node.js): session logic, audio pipeline, API calls.
- `vision-worker` (Python): lightweight frame analysis and event tags.
- Local SQLite for sessions/events.

2. Cloud Services
- OpenAI API for conversation intelligence.
- Optional cloud logging endpoint later.

## Recommended Runtime Stack
- Node.js 20 LTS (runtime orchestration)
- TypeScript (safer iteration)
- Python 3.11+ (OpenCV vision worker)
- WebSocket local bus (runtime <-> UI)
- SQLite (Phase 1 persistence)

## AI Stack Decision
Primary path (recommended):
- OpenAI API for chat reasoning + guidance persona.
- Keep prompts structured around training modes (safety/training/race).

Fallback/alt path:
- Add local fallback intents (hardcoded safety prompts) when internet/API is unavailable.
- Optional future local model for offline emergency behavior.

## Audio/Vision Pipeline
1. Mic capture (webcam mic).
2. Voice activity detection + short chunks.
3. Speech-to-text.
4. LLM response with coaching persona.
5. Text-to-speech output to Bluetooth speaker.
6. In parallel, webcam frame sampling -> vision-worker -> event tags.
7. Guidance layer fuses user context + events -> short actionable cues.

## Guidance Modes (Phase 1)
- Safety: conservative warnings first.
- Training: correction + explanation.
- Race: short tactical cues, minimal verbosity.

## Latency Targets (Phase 1)
- Voice turn (user end speech -> bot speech start): <= 1.8s median.
- Event cue latency (frame event -> displayed cue): <= 900ms median.

## Hardware Mapping
- Raspberry Pi 4B 8GB: runtime + UI host.
- 7-inch touchscreen: avatar + guidance HUD.
- NexiGo webcam: microphone + camera feed.
- Onn Bluetooth speaker: TTS and audible alerts.
- SugarPiS1Pro: mobile power source for prototype sessions.

## Risks and Mitigations
- Bluetooth audio instability:
  - Auto-reconnect script + startup device health check.
- Pi thermal throttling:
  - Active cooling + reduced frame sampling under load.
- Network/API outages:
  - Offline fallback phrases and local alerts.

## Build Order
1. Device bootstrap (audio in/out, camera, display).
2. Chat + TTS loop with OpenAI API.
3. Avatar render and mouth-state animation.
4. Basic vision event detection.
5. Guidance fusion and debrief summary.
