# S.C.O.U.T. Phase 1 Quickstart

## What This Starter Includes
- Runtime API server (`apps/runtime/server.js`)
- Kiosk-style avatar/chat UI (`apps/ui/*`)
- Session persistence to `data/sessions.json`
- Persistent memory in `data/memory.json`
- OpenAI-backed chat + voice + optional camera observation
- Always-on wake phrase listener (`Hey Scout`) when browser speech recognition is supported

## Setup
1. `.env` is already included in this repo for zero-setup prototype runs
2. Optional: update `OPENAI_API_KEY` in `.env` if you rotate keys
3. Optional: set `OPENAI_MODEL` and `PORT`
4. Optional: tune voice with `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, `OPENAI_TTS_STYLE`, and `OPENAI_TTS_SPEED`
5. Optional: tune speech-to-text/vision with `OPENAI_TRANSCRIBE_MODEL` and `OPENAI_VISION_MODEL`
6. Optional: choose chat engine:
   - `AI_PROVIDER=auto` (default, prefers OpenAI then Ollama)
   - `AI_PROVIDER=openai`
   - `AI_PROVIDER=ollama`
7. Optional Ollama config:
   - `OLLAMA_BASE_URL=http://127.0.0.1:11434`
   - `OLLAMA_MODEL=llama3.1:8b`
8. Optional secure control APIs:
   - `SCOUT_ADMIN_TOKEN=<set-a-strong-token>`
   - `SCOUT_FS_ENABLED=1`
   - `SCOUT_FS_ROOT=.`
   - `SCOUT_FS_ALLOW_ABSOLUTE=0`

## Run
```bash
npm install
npm start
```

Then open:
```text
http://localhost:8787
```

Dev-only detection overlay:
- Start with `http://localhost:8787/?debug=1` to show face/item detection boxes.
- Toggle anytime with `Shift + D`.
- Overlay is off by default, so Pi face mode stays clean.
- Voice row includes `Source: ...` to show active listening path (`manual`, `wake`, `followup`, `music`) during testing.

Music detection behavior:
- Music ID runs only when explicitly prompted by the user:
  - voice prompt like `what song is this?`
  - or typed prompt, which arms a short listening window for song detection.
- Background noise alone should not trigger song identification.

Idle consistency behavior:
- After extended idle time, S.C.O.U.T. auto-resets to a fresh session so responsiveness stays stable in long-running use.

If startup fails with `EADDRINUSE` on port `8787`:
```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
kill <PID>
```
Or run with a different port:
```bash
PORT=8788 npm start
```

## Standalone App Mode (No Browser UI)
If you want S.C.O.U.T. to run as a desktop app window (no address bar/tabs/controls):

```bash
npm install
npm run app
```

This launches:
- runtime server
- fullscreen frameless S.C.O.U.T. face shell via Electron

## API Endpoints
- `GET /health`
- `POST /api/session/start` body: `{ "strongFocus": true|false }`
- `POST /api/chat` body: `{ "sessionId": "...", "message": "...", "strongFocus": true|false }`
- `POST /api/session/stop` body: `{ "sessionId": "..." }`
- `GET /api/session/:sessionId`
- `GET /api/capabilities`
- `GET /api/memory`
- `POST /api/stt` body: `{ "audioBase64": "...", "mimeType": "audio/webm" }`
- `POST /api/vision` body: `{ "imageDataUrl": "data:image/jpeg;base64,..." }`
- `POST /api/detect` body: `{ "imageDataUrl": "data:image/jpeg;base64,..." }` (item + face detection)
- `POST /api/music-identify` body: `{ "audioBase64": "...", "mimeType": "audio/webm", "hint": "what song is this" }`
- `POST /api/tts` body: `{ "text": "..." }`
- `POST /api/motion-intent` body: `{ "state": "...", "mood": "...", "mode": "...", "expression": "...", "head": { "pitchDeg": 0, "yawDeg": 0, "rollDeg": 0 }, "base": { "yawRateDegPerSec": 0 } }`
- `GET /api/motion-intent`
- `GET /api/fs/list?path=.`
- `GET /api/fs/read?path=README.md`
- `POST /api/fs/stat` body: `{ "path": "README.md" }`
- `POST /api/fs/write` body: `{ "path": "notes.txt", "content": "hello", "append": false }`
- `POST /api/fs/mkdir` body: `{ "path": "tmp/newdir", "recursive": true }`
- `POST /api/fs/move` body: `{ "from": "tmp/a.txt", "to": "tmp/b.txt" }`
- `POST /api/fs/delete` body: `{ "path": "tmp/b.txt", "recursive": false }`

Filesystem API auth:
- If `SCOUT_ADMIN_TOKEN` is set, send it in `x-scout-token` (or `Authorization: Bearer <token>`).
- By default, filesystem paths are sandboxed to `SCOUT_FS_ROOT` unless `SCOUT_FS_ALLOW_ABSOLUTE=1`.

## Pi Kiosk Notes
- Preferred for true no-browser look (frameless fullscreen shell):
```bash
npm run shell:pi
```
- Launch Chromium app+kiosk mode (fallback option):
```bash
bash scripts/start-pi-kiosk.sh
```
- Direct command equivalent:
```bash
chromium-browser --noerrdialogs --disable-infobars --kiosk --app="http://localhost:8787/?kiosk=1&face=1"
```
- `face=1` enables face-only screen (no chat panel or controls).
- In face-only mode, double-click/tap the screen to start or stop voice listening.
- With microphone permission granted, you can also say `Hey Scout` (or `OK Scout`) to start listening hands-free.
- Keep display awake and disable screen blanking for always-on avatar mode.
- Pair Bluetooth speaker before launching runtime so browser TTS uses expected audio output.

## Clone To Pi
On Raspberry Pi OS:
```bash
git clone <your-repo-url> scout
cd scout
npm install
npm run shell:pi
```

## Pi App Notes
For a browser-free feel on Pi, prefer Electron app mode:

```bash
npm install
npm run app
```

## Pi Webcam/Mic Setup (USB)
If webcam lights turn on but S.C.O.U.T. does not receive camera/mic context, verify:

1. Camera is detected by OS:
```bash
ls /dev/video*
```

2. Camera formats are available:
```bash
v4l2-ctl --list-devices
```

3. Audio input device is present:
```bash
arecord -l
```

4. On first launch, allow camera and microphone permissions for Chromium/Electron.

5. If using kiosk Chromium, launch with media flags when needed:
```bash
chromium-browser --noerrdialogs --disable-infobars --kiosk --app="http://localhost:8787/?kiosk=1&face=1" --use-fake-ui-for-media-stream
```

6. Prefer `npm run shell:pi` for final deployment (frameless full screen face); it avoids browser chrome and keeps the face-only experience.

Voice tuning defaults:
- `OPENAI_TTS_VOICE=nova` (restored default profile)
- `OPENAI_TTS_SPEED=1.0`
