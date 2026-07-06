# Seamarg Mobile

Expo (React Native) app for the Seamarg seafarer portal — the customer-facing
side of the platform (profile + certificates), including a native camera flow
for scanning certificates. It talks to the **same Spring Boot backend and the
same Cognito user pool** as the web frontend; no backend changes are required.

The admin console is intentionally **not** part of this app — it stays web-only.

## What's inside

```
mobile/
├── app/                       # expo-router routes (file = screen)
│   ├── _layout.tsx            # root: crypto polyfill, providers, root stack
│   ├── index.tsx              # auth-gate: redirect to app or sign-in
│   ├── (auth)/                # sign-in / sign-up / confirm / forgot-password
│   └── (app)/                 # authenticated tabs (guarded)
│       ├── dashboard.tsx
│       ├── profile/           # section list + generic [section] editor
│       └── certificates/      # list, [category]/[type] detail, scan (camera)
└── src/
    ├── api/                   # client.ts (= web apiRequest), profile, certificates
    ├── auth/                  # Cognito wrapper, SecureStore session, AuthContext
    ├── components/            # Screen, Button, Field
    ├── features/profile/      # section field definitions (data-driven forms)
    ├── theme/                 # colors / spacing / typography tokens
    └── config.ts              # reads EXPO_PUBLIC_* env
```

## Prerequisites

- **Node 24+** (matches the repo root `engines`).
- The **Expo Go** app on your phone (App Store / Play Store) — the easiest way
  to run on a physical device without native build tooling.
- Optional: Xcode (iOS Simulator) or Android Studio (Android Emulator).
- The **backend running and reachable from your phone** (see below).

## 1. Install dependencies

Dependencies are managed by npm workspaces from the **repo root**:

```bash
# from the repo root (not from mobile/)
npm install
```

Because the versions in `package.json` are hand-pinned, reconcile them with the
installed Expo SDK once (this rewrites any mismatched native module versions):

```bash
npx expo install --fix --prefix mobile   # or: cd mobile && npx expo install --fix
```

## 2. Configure environment

```bash
cp mobile/.env.example mobile/.env.local
```

Edit `mobile/.env.local`:

- `EXPO_PUBLIC_API_BASE_URL` — **must be your computer's LAN IP**, not
  `localhost`. A phone running Expo Go cannot reach `localhost` (that's the
  phone itself). Example: `http://192.168.1.20:8080`.
- `EXPO_PUBLIC_COGNITO_USER_POOL_ID` / `EXPO_PUBLIC_COGNITO_CLIENT_ID` — the same
  values as `frontend/.env.local` (`VITE_COGNITO_*`).

Find your LAN IP:

```bash
# macOS
ipconfig getifaddr en0
# Linux
hostname -I | awk '{print $1}'
```

> Env changes are read at bundle time. After editing `.env.local`, restart the
> dev server with a clear cache: `npx expo start -c`.

## 3. Make the backend reachable

Run the backend as documented in the repo root `CLAUDE.md`:

```bash
export JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/ms-21.0.10/Contents/Home"
./gradlew :backend:bootRun          # serves on :8080, binds 0.0.0.0
```

Notes:

- Your **phone and computer must be on the same Wi-Fi network**.
- Native requests don't send a browser `Origin`, so the dev CORS allow-list in
  `SecurityConfig` is **not** involved — no backend change needed for the app.
  (This only matters if you run the app in a browser via `expo start --web`.)
- With no AWS env vars set, the backend uses in-memory repositories, so data is
  not persisted between restarts — fine for trying the app out.
- If your machine firewall blocks inbound `:8080`, allow it, or use a tunnel
  (e.g. `npx expo start --tunnel`) so the phone reaches Metro; the backend still
  needs to be reachable at `EXPO_PUBLIC_API_BASE_URL`.

## 4. Start the app

```bash
# from repo root
npm run mobile:start
# or
cd mobile && npx expo start
```

This prints a **QR code** in the terminal.

### On your phone (recommended)

1. Connect the phone to the **same Wi-Fi** as your computer.
2. Open **Expo Go** and scan the QR code
   - iOS: scan with the **Camera** app, tap the banner.
   - Android: scan from **inside Expo Go**.
3. The app loads over the network. Edit a file and it hot-reloads.

If the phone can't connect to Metro (VPN, isolated Wi-Fi, corporate network):

```bash
npx expo start --tunnel
```

### On a simulator / emulator

```bash
cd mobile
npx expo start
# then press:  i  → iOS Simulator     a  → Android Emulator
```

> On the **iOS Simulator**, `localhost` in `EXPO_PUBLIC_API_BASE_URL` works
> (it shares the Mac's network). On the **Android Emulator**, use
> `http://10.0.2.2:8080` to reach the host machine. A physical phone always
> needs the LAN IP.

## Camera / certificate scanning

The **Certificates → Scan** flow (and the dashboard shortcut) uses the camera or
photo library, uploads the image to
`POST /api/customer/certificates/{category}/{type}/file`, and shows the AI-
extracted field suggestions. Expo Go will prompt for camera/photo permission the
first time (strings are configured in `app.json`).

## Typecheck

```bash
npm run typecheck -w mobile      # tsc --noEmit
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Network request failed" on the phone | You're using `localhost`. Set `EXPO_PUBLIC_API_BASE_URL` to your LAN IP and restart with `-c`. |
| Requests work in simulator but not phone | Phone and computer are on different networks, or firewall blocks `:8080`. Same Wi-Fi + allow the port, or use `--tunnel`. |
| "Cognito User Pool ID and app client ID are required" | `EXPO_PUBLIC_COGNITO_*` are unset in `.env.local`. |
| Metro can't resolve a module in the monorepo | `metro.config.js` already watches the workspace root; try `npx expo start -c` to clear the cache. |
| Native module version warnings | Run `npx expo install --fix` inside `mobile/`. |
| 401 → kicked to sign-in | The access token expired; sign in again (the app doesn't refresh tokens, matching the web frontend). |

## Building standalone apps (later)

Expo Go is for development. For installable/TestFlight/Play builds use EAS:

```bash
npm i -g eas-cli
eas build --platform ios      # or android
```

This requires an Expo account and, for iOS, an Apple Developer account. Not
needed for local development on your phone.
