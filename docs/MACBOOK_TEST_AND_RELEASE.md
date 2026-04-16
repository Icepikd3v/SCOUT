# S.C.O.U.T. Macbook-First Test and Release Flow

This is the required workflow for your setup:
- Build and test on MacBook first
- Push to repo
- Clone to Raspberry Pi
- Install iPad app build from Mac (not from the iPad)

## Important iPad note (iPad 9th gen)

The iPad itself does not run `npm` or build tooling for this project.
All iOS app builds are created on MacBook (Xcode + Capacitor) and then installed on iPad.

## 1. Local Mac validation (single command)

From repo root:

```bash
npm run qa:mac
```

This command performs:
1. `npm run check`
2. Starts runtime locally if needed
3. Runs API smoke test
4. Builds mobile web shell assets

## 2. Pi readiness gate (before push)

Confirm:
1. `.env.example` contains required defaults
2. `docs/PI_PRODUCTION_DEPLOYMENT.md` is up to date
3. `scripts/pi/*` are executable and committed

## 3. Push to repo

```bash
git add .
git commit -m "scout: mac-validated release candidate"
git push
```

## 4. Raspberry Pi clone + bring-up

On Pi:

```bash
git clone <YOUR_REPO_URL> S.C.O.U.T
cd S.C.O.U.T
npm run pi:bootstrap
cp .env.example .env
npm run pi:systemd
npm run pi:preflight
```

## 5. iPad build and install (from Mac)

From Mac:

```bash
npm run mobile:install
npm run mobile:sync
npm run mobile:ios
```

Then in Xcode:
1. Select connected iPad 9th gen target (or Generic iOS Device for archive)
2. Configure signing team + bundle id
3. Build/Run to device for direct testing
4. Archive and distribute via TestFlight for broader installs

## 6. Cross-device runtime test

On iPad app:
1. Set `Runtime URL` to Pi IP, e.g. `http://192.168.1.50:8787`
2. Start session
3. Send chat
4. Test camera describe
5. Verify time/weather/date live answers
