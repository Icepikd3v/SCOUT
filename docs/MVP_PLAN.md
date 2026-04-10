# S.C.O.U.T. MVP Build Plan

## Milestone 1: Conversational Core + Session Skeleton
- Create API service with session create/start/stop endpoints.
- Add chat endpoint with coach persona and short-term memory.
- Create UI shell with chat panel and session timeline.
- Persist sessions and messages.

## Milestone 2: Live Feed Ingestion
- Add stream input connector for one source type.
- Add telemetry ingestion endpoint/socket.
- Display live feed in UI with basic telemetry HUD.

## Milestone 3: Event Detection + Guidance
- Add perception service with initial obstacle/event model.
- Define normalized event schema.
- Build rule-based guidance engine for first cue set.
- Emit real-time guidance cards to UI.

## Milestone 4: Debrief + Training Loop
- Save event timeline and key metrics.
- Generate post-session summary (mistakes, wins, drills).
- Add replay markers for key moments.

## Milestone 5: Hardening
- Add tests for ingestion/guidance/session flows.
- Add latency instrumentation and reliability guards.
- Add safety disclaimers and confidence-based fallback behavior.

## Definition of Done (MVP)
- User can run a full session with:
  - Live stream view
  - Conversational coaching
  - Real-time guidance prompts
  - Post-session debrief report
