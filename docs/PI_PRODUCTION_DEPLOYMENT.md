# S.C.O.U.T. Pi Production Deployment

This guide makes a Raspberry Pi clone-and-run ready using scripts in this repo.

## 1. Clone

```bash
git clone <YOUR_REPO_URL> S.C.O.U.T
cd S.C.O.U.T
```

## 2. Bootstrap dependencies

```bash
npm run pi:bootstrap
```

What it handles:
- Base apt packages (`ffmpeg`, `v4l-utils`, `alsa-utils`, Chromium, etc)
- Node.js 20 install (if missing)
- `npm install`
- Ollama install + service start + default model pull
- Syntax check

## 3. Configure environment

```bash
cp .env.example .env
```

Set at least:
- `OPENAI_API_KEY` (optional if fully local)
- `AI_PROVIDER=auto`
- `AI_ROUTING_POLICY=local_first`
- `OLLAMA_MODEL_*` and `OPENAI_MODEL_*` as needed

## 4. Install systemd services

```bash
npm run pi:systemd
```

Optional (face shell auto-start):

```bash
sudo systemctl enable scout-face-shell.service
sudo systemctl start scout-face-shell.service
```

## 5. Validate hardware/runtime

```bash
npm run pi:preflight
```

## 6. Useful service commands

```bash
sudo systemctl status scout-runtime.service
sudo systemctl restart scout-runtime.service
journalctl -u scout-runtime.service -f
```

## 7. Camera and Microphone Access on Raspberry Pi

1. Ensure user is in required groups:

```bash
sudo usermod -aG video,audio $USER
```

Then reboot:

```bash
sudo reboot
```

2. Verify camera and mic devices:

```bash
v4l2-ctl --list-devices
arecord -l
```

3. If multiple devices exist, pin preferred devices in `.env`:
- `SCOUT_VIDEO_DEVICE_ID`
- `SCOUT_AUDIO_DEVICE_ID`
- or use label hints:
  - `SCOUT_VIDEO_LABEL_HINT`
  - `SCOUT_AUDIO_LABEL_HINT`

4. Re-run validation:

```bash
npm run pi:preflight
```
