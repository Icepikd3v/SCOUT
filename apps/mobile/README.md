# S.C.O.U.T. Mobile (iOS/Android)

This Capacitor app packages S.C.O.U.T. as a native mobile shell for iPads and Android tablets.
It uses device camera/microphone and connects to your S.C.O.U.T. runtime (`/api/*`) via a configurable base URL.

## Critical deployment note

Do not run build commands on the tablet.
iPad/iPhone/Android tablets are install targets only.
All `npm`, Capacitor, and native build steps run on a MacBook (or CI runner).

## 1. Install

```bash
cd apps/mobile
npm install
```

## 2. Add native projects (first time)

```bash
npx cap add ios
npx cap add android
```

## 3. Build and sync web assets

```bash
npm run cap:sync
```

## 4. Open in native IDEs

```bash
npm run cap:ios
npm run cap:android
```

For iPad 9th gen specifically:
1. Connect iPad to MacBook.
2. Open iOS project in Xcode (`npm run cap:ios`).
3. Select the physical iPad as run target.
4. Build/Run from Xcode.

## 5. Required runtime permissions

1. iOS: ensure camera/microphone usage descriptions are present in `ios/App/App/Info.plist` (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`).
2. Android: ensure camera/audio/network permissions in `AndroidManifest.xml` (`CAMERA`, `RECORD_AUDIO`, `INTERNET`).

## 6. Runtime connection

1. Launch S.C.O.U.T. runtime on your Pi or server.
2. In mobile app, set `Runtime URL` to `http://<host>:8787` (or HTTPS endpoint).
3. Start session, then chat and camera describe.

## Notes

- For physical tablet testing, your runtime endpoint must be reachable from the tablet's network.
- If using plain HTTP on local LAN, iOS App Transport Security exceptions may be required.
