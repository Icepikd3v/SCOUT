# S.C.O.U.T. Product Spec

## 1. Product Summary
S.C.O.U.T. (Smart Companion for Observation, Understanding, and Training) is an AI assistant for pilots/racers/operators that combines conversation, real-time environmental observation, and tactical guidance.

## 2. Target Users
- Beginner drone pilots (training and confidence).
- Intermediate/advanced racing pilots (performance optimization).
- Coaches/instructors (session review and feedback).

## 3. Primary Use Cases
- Pre-flight briefing: weather/context checklist, objective setup.
- In-flight co-pilot: live guidance based on video + telemetry.
- Course training: turn-by-turn obstacle/course instruction.
- Post-flight debrief: key mistakes, strengths, and next drills.

## 4. Functional Requirements
### A. Conversational Core
- Natural chat/voice interactions.
- Session memory and personalized coaching style.
- Context retention for current mission/training objective.

### B. Live Observation
- Accept live stream input (RTSP/WebRTC or capture feed).
- Consume telemetry (altitude, speed, battery, heading, GPS).
- Detect obstacles/events and confidence score.

### C. Guidance Engine
- Convert observations into concise pilot cues.
- Multi-mode guidance:
  - Safety mode
  - Training mode
  - Race mode
- Adjustable coaching intensity (low, medium, high).

### D. Session Intelligence
- Save time-stamped events.
- Generate performance scorecard.
- Recommend practice drills by weak area.

## 5. Non-Functional Requirements
- Low-latency event-to-guidance path.
- Stable operation under intermittent telemetry drops.
- Audit logging for critical guidance decisions.
- Privacy and secure storage for session data.

## 6. Constraints & Risks
- Vision model false positives in cluttered scenes.
- Hardware heterogeneity (different drones/sensors).
- Latency spikes from stream processing.
- Safety liability if guidance is misinterpreted.

## 7. Success Metrics (MVP)
- Median guidance latency <= 750 ms.
- >= 90% session completion without system interruption.
- User-rated coaching usefulness >= 4.2/5.
- Debrief generated within 10 seconds of session end.
