# S.C.O.U.T. Mobile Packaging (iOS/Android)

S.C.O.U.T. includes a Capacitor mobile shell at `apps/mobile` for tablet-ready packaging.

## Build location requirement

The tablet is not a build machine.
Run all commands below on your MacBook, then install artifacts onto iPad/Android tablets.

## What this gives you now

- Native app container for iOS and Android
- Camera + microphone access through WebView APIs
- Runtime URL configuration inside the app
- Session start/stop + chat + camera frame description endpoints

## Build flow

```bash
npm run mobile:install
npm run mobile:sync
npm run mobile:ios
npm run mobile:android
```

## Camera and Microphone Permissions (tablets)

1. iPadOS/iOS:
   - In Xcode target settings, ensure `Info.plist` includes:
     - `NSCameraUsageDescription`
     - `NSMicrophoneUsageDescription`
   - On first app launch, accept both camera and microphone prompts.
   - If denied previously, re-enable under `Settings > Privacy & Security > Camera/Microphone`.

2. Android tablets:
   - Ensure manifest permissions exist:
     - `android.permission.CAMERA`
     - `android.permission.RECORD_AUDIO`
     - `android.permission.INTERNET`
   - On first launch, grant camera and mic runtime permissions.
   - If denied previously, re-enable in App Info -> Permissions.

3. Network requirement:
   - Tablet must reach runtime URL over LAN/Internet.
   - For local HTTP testing on iOS, configure ATS exceptions.

## Runtime connectivity model

1. Tablet app captures user input/video.
2. App calls your S.C.O.U.T. runtime API (`/api/session/start`, `/api/chat`, `/api/vision`).
3. Runtime handles local/cloud model routing and live data.

## Production recommendations

1. Use HTTPS runtime endpoint for off-LAN deployments.
2. Keep offline-first routing enabled (`AI_ROUTING_POLICY=local_first`).
3. Pin per-mode models via `OPENAI_MODEL_*` and `OLLAMA_MODEL_*`.
4. For iOS local HTTP testing, configure ATS exceptions.
5. Add mobile MDM policies for kiosk/tablet fleet rollouts.
