# S.C.O.U.T. System Architecture

## 1. High-Level Components
1. Client App (desktop/tablet): UI for stream view, overlays, guidance feed, and chat/voice.
2. Session Orchestrator API: session lifecycle, routing, user state, auth.
3. Conversational Brain: LLM-based reasoning + coach persona + memory access.
4. Vision & Telemetry Pipeline: video ingestion, inference, event extraction.
5. Guidance Engine: rules + model layer converting events to pilot instructions.
6. Data Layer: session logs, telemetry records, event timelines, debrief artifacts.

## 2. Data Flow (Real-Time)
1. Drone stream and telemetry enter pipeline.
2. Vision service extracts object/obstacle/course events.
3. Guidance engine fuses events + telemetry + mission objective.
4. Guidance output is emitted to UI and optional voice channel.
5. Session events are persisted for replay/debrief.

## 3. Service Boundaries
- `ingestion-service`: handles stream and telemetry adapters.
- `perception-service`: runs vision models and emits normalized events.
- `guidance-service`: produces actionable instruction cards and voice lines.
- `conversation-service`: handles natural language and coaching dialogue.
- `session-service`: session state, scoring, and debrief generation.

## 4. Suggested Tech Baseline (MVP)
- Frontend: React + TypeScript.
- Backend API: Node.js + TypeScript (Fastify/Express).
- Real-time transport: WebSocket.
- Queue/event bus: Redis streams or lightweight pub/sub.
- Storage: Postgres (structured) + object storage for media.
- Inference: Python microservice for CV models.

## 5. Safety Layer
- Confidence threshold gating before critical guidance.
- Fallback messaging when confidence is low.
- Clear "assistive only" mode boundaries in UI.

## 6. MVP Simplifications
- Start with one drone integration path.
- Start with one vision model and a narrow event taxonomy.
- Use rule-based guidance templates before advanced policy learning.
