# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`seamarg` is a monorepo for an AI-assisted maritime career/compliance platform for seafarers. Five deployable parts:

- `backend/` — Spring Boot (Java 21, Gradle) REST API.
- `frontend/` — vanilla TypeScript + Vite single-page app (no framework).
- `mobile/` — Expo (React Native, TypeScript) app for the seafarer portal; consumes the same backend + Cognito pool as `frontend/`. Admin is intentionally web-only.
- `lambda/` — TypeScript AWS Lambda workspace (placeholder for future functions).
- `infra/terraform/` — dev AWS infrastructure (S3, CloudFront, Cognito, DynamoDB, EC2 runtime IAM, GitHub Actions OIDC).

npm workspaces are `frontend`, `mobile`, and `lambda`; the backend is Gradle-only. Import the repo root into IntelliJ as a Gradle project.

## Commands

Java is not on PATH in this environment. Prefix Gradle commands with the Microsoft JDK 21:

```bash
export JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/ms-21.0.10/Contents/Home"
```

Backend (from repo root):

```bash
./gradlew :backend:bootRun          # run locally on :8080
./gradlew :backend:test             # full test suite
./gradlew :backend:test --tests "com.seamarg.backend.certificate.CertificateAdminServiceTests"   # single test class
./gradlew :backend:bootJar          # build backend/build/libs/seamarg-backend.jar
```

Frontend / lambda:

```bash
npm install
npm run dev -w frontend             # Vite dev server on :5173
npm run build -w frontend           # tsc typecheck + vite build → frontend/dist
npm run typecheck -w frontend       # tsc --noEmit only
npm run build -w lambda
```

Mobile (Expo, from repo root):

```bash
npm run mobile:start                # expo start (QR for Expo Go); add -- -c to clear cache
npm run typecheck -w mobile         # tsc --noEmit
cd mobile && npx expo install --fix # reconcile native module versions to the installed SDK
```

Terraform (dev stack):

```bash
terraform fmt -recursive infra/terraform
terraform -chdir=infra/terraform/environments/dev validate
```

## Backend architecture

**Three endpoint tiers, one security filter chain** (`security/SecurityConfig.java`, stateless):

- `/api/public/**`, `/actuator/health` — open.
- `/api/customer/**` — Cognito JWT bearer token (OAuth2 resource server; issuer from `COGNITO_ISSUER_URI`). The user id is **always** `authentication.getToken().getSubject()`, never taken from the request body.
- `/api/admin/**` — static password via the `X-Admin-Password` header, checked by `AdminPasswordAuthenticationFilter` before the authorization filter. The configured username/role are only the resulting principal/authority; the password is the real gate. Returns 503 when `SEAMARG_ADMIN_PASSWORD` is unset, 401 on mismatch.

Any new custom request header the browser sends must be added to `corsConfigurationSource` allowed headers in `SecurityConfig`, or cross-origin (dev `:5173` → `:8080`) preflight fails.

**Single-table DynamoDB design.** One table (`seamarg-dev-app-data`), every item keyed `pk=USER#<cognito-sub>`. Sort keys:

- `PROFILE#<SECTION>` — seafarer profile, one item per section (`MAIN`, `CONTACT`, `PASSPORT`, …).
- `CERTIFICATE#<id>` — legacy standalone uploaded-file records.
- `CERT#MAINDOCS` — the main-documents held/not-held checklist.
- `CERT#<CATEGORY>#<TYPE_SLUG>` — a detailed certificate entry (category = enum name, e.g. `CERT#GENERAL#stcw-basic-safety-training`).

Profile/certificate items store their fields as a JSON `payload` attribute plus `updatedAt`. See `docs/certificates-design.md` and `docs/profile-data-design.md` before touching these.

**Two separate certificate file stores** (important, easy to miss): a file can live either as a standalone `CERTIFICATE#` record *or* nested under a `file` key inside a `CERT#<CATEGORY>#<TYPE>` entry payload. The portal UI uses the entry flow, so most real uploads are inside entry payloads. Code that lists "a user's files" must read **both**.

**In-memory repository fallback.** When `SEAMARG_APP_DATA_TABLE` (and `SEAMARG_DOCUMENT_BUCKET`) are unset, `*InfrastructureConfig` wires in-memory repositories instead of DynamoDB/S3. This is how the backend runs locally without AWS — data is not persisted and starts empty.

**Package-per-domain with tight visibility.** `certificate/`, `profile/`, `security/`, `admin/`. Most controllers, services, and repositories are package-private. Cross-package access (e.g. the admin dashboard reading profiles/certificates) goes through **public `*AdminService` facades and public DTOs** exposed by each domain package — do not widen visibility of internals; add a facade method instead.

**AI extraction.** Certificate scans are read by `MiniMaxCertificateExtractor` (the current entry flow) with a legacy `OpenAiCertificateExtractor` for the POC upload path. Both degrade gracefully: no key / failure / non-image → empty suggestions and the user fills the form manually. Nothing hard-fails on a missing key.

## Frontend architecture

The entire SPA is `frontend/src/main.ts` (~3900 lines) plus `frontend/src/styles.css` — no framework, no components.

- **Hash routing.** `renderApp()` reads `window.location.hash`, picks a view, sets `appRoot.innerHTML` from string templates, then calls `bindCurrentPage()`. State changes re-render by calling `renderApp()` again. `hashchange` also triggers `renderApp()`.
- **Delegated events.** A single `click` and `submit` listener on the app root drive everything. Buttons/links carry `data-action="..."` (+ `data-*` payload) handled in `handleClick`; forms are dispatched by `id`/class in `handleSubmit`. Add UI behavior by extending those switch blocks, not by attaching per-element listeners (except inputs wired in `bindCurrentPage`).
- **Auth.** Customer auth uses `amazon-cognito-identity-js` against the Cognito user pool; the session (access token + claims) lives in `sessionStorage`. `apiRequest()` attaches `Authorization: Bearer <token>` and centralizes error/JSON handling. The `/admin` console is a separate area with its own login that sends `X-Admin-Password` and persists the password in `sessionStorage`, re-validated on load.
- **Config.** API base and Cognito IDs come from `VITE_*` env (`frontend/.env.local`) or a runtime `window.__SEAMARG_CONFIG__`; locally the API base defaults to `http://localhost:8080`.

Escape all interpolated user/content strings with `escapeHtml()` when building template HTML.

## Mobile architecture

Expo SDK 54 (React 19, React Native 0.81) app under `mobile/`, using **expo-router** file-based routing. It is a **native rebuild of the seafarer/customer portal**, not a port of the vanilla-TS frontend — the web UI is DOM strings and does not transfer. What is shared conceptually (and kept deliberately parallel) is the backend contract, the Cognito auth flow, and the domain shapes.

- **Routing.** `app/` = routes only (`app/_layout.tsx` root; `(auth)` group for sign-in/up/confirm/forgot; guarded `(app)` group with tabs for dashboard/profile/certificates). Everything non-routable lives in `src/` (`api/`, `auth/`, `components/`, `features/`, `theme/`, `lib/`, `config.ts`).
- **Auth.** Same `amazon-cognito-identity-js` USER_SRP_AUTH flow as the web app (`src/auth/cognito.ts` mirrors the frontend helpers), but the session is stored in **`expo-secure-store`** (only access token + expiry + decoded claims), not `sessionStorage`. `AuthProvider`/`useAuth` (`src/auth/AuthContext.tsx`) hold app-wide auth state; the `(app)` layout redirects to sign-in when there is no session. On RN, Cognito requires the `react-native-get-random-values` polyfill (imported first in `app/_layout.tsx`) and `@react-native-async-storage/async-storage`.
- **API.** `src/api/client.ts` is the RN twin of the web `apiRequest()` (attaches `Authorization: Bearer`, centralizes error/JSON handling, throws `SessionExpiredError` on 401). Endpoint paths and request/response shapes match the web app exactly.
- **Config.** From `EXPO_PUBLIC_*` env (`mobile/.env.local`). API base **must be HTTPS** on a device (iOS ATS / Android cleartext block the raw `http://ec2-…` origin) — point it at the CloudFront domain, which proxies `/api/*`. Native requests send no browser `Origin`, so the `SecurityConfig` CORS allow-list is not involved.
- **Profile forms are data-driven** from `src/features/profile/sections.ts` (field defs → generic `[section]` editor); the certificate scan flow uploads a captured image to `POST /api/customer/certificates/{category}/{type}/file` and shows the AI extraction.
- See `mobile/README.md` for local run / on-device testing.

> **IMPORTANT — keep the mobile app in sync with the frontend.** From now on, whenever you change the web frontend (`frontend/`) — a new/changed API call, endpoint path, request/response shape, auth behavior, profile section or field, certificate flow, or validation rule — **replicate the equivalent change in `mobile/`** (the matching file in `src/api/`, `src/auth/`, `src/features/`, or the relevant screen). The two clients must not drift on the backend contract or user-facing behavior. If a frontend change genuinely does not apply to mobile (e.g. admin-console-only, or DOM/CSS-only styling), note that rather than silently skipping it. This applies in reverse too: a mobile-first change that touches shared behavior should be reflected in the frontend.

## Deployment (dev)

Region `ap-south-1`. Deploys are **manual** via the GitHub Actions `Deploy` workflow (`unlock_deploy` checkbox + `target` = backend/frontend/lambda/infra/all; `terraform_apply` only for infra).

- Backend runs as a single Docker container on a manually provisioned EC2 host (port 80→8080). CI builds the jar, ships it to EC2 via `scripts/deploy-backend-ec2.sh`, rebuilds a small runtime image, and smoke-tests `/api/public/hello`. Runtime env lives in `/opt/seamarg/backend.env` (0600, never committed).
- Frontend builds to `frontend/dist`, syncs to a private S3 bucket, and CloudFront serves it. CloudFront proxies `/api/*` to the HTTP EC2 origin so the HTTPS frontend calls same-origin (avoids mixed-content).
- Terraform is the source of truth for infra; don't make manual AWS changes without codifying them.
- Mobile is **not** in the deploy pipeline yet — it runs via Expo Go for dev. Installable/store builds will use EAS (`eas build`) later; see `mobile/README.md`.

## Conventions

- `.editorconfig`: 2-space indent, **tabs for Java and Gradle**. Java packages under `com.seamarg.backend`. Keep TypeScript strict.
- Backend tests are JUnit under the matching package in `backend/src/test/java`; prefer focused unit tests, Spring context tests only when wiring matters.
- Commits: concise imperative (e.g. `Add backend health endpoint`).
- **Read `docs/project-context.md` before any infrastructure, security, or pipeline change** — it holds live AWS resource names, deployment lessons, and known risks. `docs/frontend-prd.md` is the living frontend product record; `docs/private-portal-prd.md`, `docs/profile-data-design.md`, and `docs/certificates-design.md` cover the private portal, profile, and certificate designs. `AGENTS.md` mirrors these expectations.
- Do not commit or push unless explicitly asked. Never commit secrets, AWS keys, or Terraform state.

## Local testing notes

- Customer endpoints return 401 until the request carries a valid Cognito JWT. The README (“Customer endpoint token for local testing”) documents the full hosted-UI code→token exchange.
- Admin endpoints: run with `SEAMARG_ADMIN_PASSWORD` set, then `curl -H "X-Admin-Password: <pw>" http://localhost:8080/api/admin/users`.
- Mobile: run the Expo dev server on your dev machine (not on the EC2 host) and open it in Expo Go on a phone on the same Wi-Fi. The phone reaches Metro at the machine's LAN IP:8081, while `EXPO_PUBLIC_API_BASE_URL` points at the HTTPS CloudFront backend. Expo Go must match the project's Expo SDK (currently 54). See `mobile/README.md`.
