# S.C.O.U.T.

Smart Companion for Observation, Understanding, and Training

S.C.O.U.T. is an AI companion designed for realistic conversation, live visual awareness, and training/coaching workflows.

## Vision
S.C.O.U.T. is more than a chatbot. It should:
- Hold natural, context-aware conversation with a coach-like tone.
- Ingest live drone video/telemetry streams.
- Observe environments and detect obstacles.
- Guide users through race courses, training drills, and decision making.
- Adapt coaching to skill level and session goals.

## Core Product Pillars
1. Conversational AI Co-Pilot
2. Live Observation (video + telemetry)
3. Guidance and Coaching Engine
4. Safety, Logging, and Session Replay

## Initial MVP Scope
- Voice/text conversation with session memory.
- Single live video source input.
- Basic obstacle/event detection overlays.
- Real-time guidance prompts ("turn left", "slow approach", etc).
- Post-session debrief with performance summary.

## Repository Docs
- [Product Spec](docs/SCOUT_PRODUCT_SPEC.md)
- [System Architecture](docs/ARCHITECTURE.md)
- [MVP Build Plan](docs/MVP_PLAN.md)
- [Phase 1 Stackflow](docs/PHASE1_STACKFLOW.md)
- [Avatar System](docs/AVATAR_SYSTEM.md)
- [Phase 1 Quickstart](docs/PHASE1_QUICKSTART.md)
- [Mac-to-Pi Workflow](docs/MAC_TO_PI_WORKFLOW.md)
- [Pi Production Deployment](docs/PI_PRODUCTION_DEPLOYMENT.md)
- [Mobile Packaging (iOS/Android)](docs/MOBILE_PACKAGING.md)
- [Macbook Test and Release Flow](docs/MACBOOK_TEST_AND_RELEASE.md)

## Current Build Status
Milestone 1 starter scaffold is now in place:
- Runtime API with sessions + chat
- OpenAI integration path via environment key
- Kiosk avatar UI and conversation panel
- Local session persistence in `data/sessions.json`
- Persistent user memory in `data/memory.json`
- Motion-intent bridge endpoint for future servo/base integration
- Token-protected filesystem CRUD API for trusted local automation
