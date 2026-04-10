# Mac-to-Pi Workflow (Recommended)

## 1. Develop and Verify on macOS First
From project root:

```bash
cp .env.example .env
# add OPENAI_API_KEY in .env
npm run check
npm start
```

Open `http://localhost:8787` and verify:
- Avatar loads and state changes when sending chat
- Chat replies are returned
- Browser speech synthesis works when "Speak replies" is enabled

In a second terminal, run API smoke test:

```bash
npm run smoke
```

You should see `[smoke] pass`.

## 2. Freeze a Known-Good Laptop Build
Before Pi transfer, confirm these are green on Mac:
- `npm run check`
- `npm run smoke`
- Manual UI test at `http://localhost:8787`

## 3. Copy Project to Raspberry Pi
Option A: Git clone on Pi (preferred once repo exists).

Example:
```bash
ssh pi@<PI_IP>
cd /home/pi
git clone <YOUR_REPO_URL> S.C.O.U.T
cd S.C.O.U.T
cp .env.example .env
# add OPENAI_API_KEY and optional engine vars
npm install
npm run check
```

Option B: direct copy now:

```bash
rsync -av --exclude '.git' --exclude '.env' /path/to/S.C.O.U.T/ pi@<PI_IP>:/home/pi/S.C.O.U.T/
```

## 4. Pi Bring-Up
On Pi:

```bash
cd /home/pi/S.C.O.U.T
cp .env.example .env
# add OPENAI_API_KEY
npm run check
npm start
```

Open from Pi browser:
- `http://localhost:8787`

## 5. Kiosk Mode (Pi)
Use Chromium kiosk launch after runtime works in normal mode:

```bash
chromium-browser --kiosk http://localhost:8787
```

## 6. Phase 1 Gate
Do not move to voice-input/STT work until both Mac and Pi pass:
- Syntax check (`npm run check`)
- API smoke test (`npm run smoke`)
- Manual avatar/chat test

## 7. SSH Local Edits on Pi
When you need Pi-specific fixes after deployment:

```bash
ssh pi@<PI_IP>
cd /home/pi/S.C.O.U.T
git pull
npm run check
npm start
```

You can edit directly on Pi (vim/nano) or remote-edit through VS Code SSH.
Keep commits small and push back to the main repo so Mac + Pi stay in sync.
