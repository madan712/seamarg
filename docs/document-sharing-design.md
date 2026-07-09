# Secure Document Sharing (QR) — SeaMarg Private Portal

Status: **Implemented** (2026-07-09) — decisions locked (§12); see implementation notes (§13)
Related: `docs/certificates-design.md`, `docs/profile-data-design.md`, `docs/project-context.md`,
`backend/src/main/java/com/seamarg/backend/share/*`, `backend/src/main/java/com/seamarg/backend/security/*`,
`frontend/src/main.ts` (share UI + `#/s/<token>` viewer), `mobile/app/(app)/certificates/share.tsx`

## Decisions locked (2026-07-09)
- **D1 — visibility model:** persistent per-file `SHAREABLE`/`PRIVATE` flag. The user pre-decides which
  files are shareable; a Share/QR exposes **all currently-shareable files** — no per-share subset
  picking. The shared set is resolved **live** at access time (§2, §3.2). (§12)
- **D2 — no PIN in MVP.** Build the redeem path loosely coupled so a PIN (or email OTP) can be added
  later without reshaping the flow, but do not implement it now. (§2.3)
- **D3 — token lookup via a DynamoDB GSI** (`tokenHashIndex`). No extra lookup record. (§3.3)
- **D4 — delivery via short-lived S3 presigned URLs** (reuse the certificate module's helper). (§6)
- **D5 — link expiry is config-driven** (property file), **default 30 minutes**, link auto-expires after
  that. No per-share expiry input in MVP. (§2.2, §10)

## Summary

Let a registered seafarer share uploaded documents with an **unauthenticated third party (`xyz`)** via
a secure link encoded as a QR code. The owner pre-marks which files are shareable; generating a **Share**
produces a QR that exposes **all currently-shareable files** (D1). `xyz` scans it from any phone camera,
lands on a public web viewer, and reads/downloads only those files — no account, no app install.

The security backbone is the **capability-URL** pattern (the link *is* the credential), hardened with
high-entropy hashed tokens, expiry, instant revocation, live per-file re-validation, an optional PIN,
and short-lived S3 presigned URLs. Nothing new is exposed on the S3 bucket.

---

## 1. Guiding principles

| # | Principle | Consequence |
|---|-----------|-------------|
| P1 | **Default private** | A file is never shareable until the owner explicitly flags it. |
| P2 | **The link is the credential** | Recipient is anonymous; whoever holds the link can access. So the link must be unguessable, expiring, and revocable. |
| P3 | **Live re-validation, not snapshots** | Every access re-checks share status + per-file `SHAREABLE` + existence, so un-sharing/revoking/deletion takes effect instantly for links already in the wild. |
| P4 | **Bucket never exposed** | S3 stays private; recipient only ever gets short-lived presigned URLs (or a backend-proxied stream). |
| P5 | **Web-only recipient** | The recipient uses their phone browser via QR; the mobile app is owner-only. |
| P6 | **Stateless** | No server-side session store, matching the existing `SecurityConfig` filter-chain design. |

---

## 2. Security model — the capability link

A **Share** is a new first-class entity owned by a user, reachable by a secret token. It does **not**
store a chosen file subset — it is a live view of the owner's `SHAREABLE` set, resolved at access time
(D1).

### 2.1 Token
- **256 bits** of CSPRNG randomness → `base64url` (~43 chars). Brute-force is infeasible.
- **Stored hashed** (SHA-256) in DynamoDB, never plaintext — a DB leak does not hand out live links.
  Lookup = hash the incoming token, then find the share by hash.
- The QR encodes a **fragment URL**:

  ```
  https://<cloudfront-domain>/#/s/<token>
  ```

  The SPA already uses hash routing, so this fits naturally — **and the fragment is never sent to the
  server**, keeping the token out of CloudFront / EC2 access logs and out of the `Referer` header. The
  SPA reads the token client-side and posts it to the API. This is a deliberate improvement over a
  `?token=` query string.

### 2.2 Redeem → session (two-step)
1. `POST /api/public/shares/redeem { token }` — validates token hash, `status`, and `expiresAt`.
   Returns a **short-lived share-session token** (a backend-signed HMAC JWT, claims
   `{ shareId, scope: "share", exp }`) plus share metadata (owner display label, file list with
   names/types/sizes). **No file bytes yet.** The session `exp` is capped at
   `min(configured session TTL, share expiresAt)` so a session can never outlive its link.
2. Subsequent calls carry the share-session JWT; a small filter validates it for
   `/api/public/shares/files/**`. Keeps the long-lived capability token off the wire after the first
   hop. Fully stateless (HMAC, no store).

### 2.3 Second factor — deferred (D2)
No PIN or OTP in MVP. The `redeem` request/response and the `ShareService.redeem(...)` seam are built
**loosely coupled** so a second factor can be added later without reshaping the flow:
- `redeem` accepts an **optional** `pin` field (ignored/unused in MVP) so the client contract does not
  change when it is enabled.
- The share item reserves `pinHash?` / `pinAttempts` fields (unset in MVP).
- Redemption goes through a single validation seam where a PIN/OTP check can be slotted in.

Future options when enabled: **PIN** (4–6 digits, shared out-of-band, hashed, rate-limited with
lockout) or **email OTP** (owner-specified email receives a code) for the most sensitive bundles.

---

## 3. Data model (single-table DynamoDB, `seamarg-dev-app-data`)

### 3.1 Per-file visibility flag
Add `visibility: PRIVATE (default) | SHAREABLE` to the file record.

> **Two file stores — must handle both (easy to miss).** A file can live either as a standalone
> `CERTIFICATE#<id>` item *or* nested under a `file` key inside a `CERT#<CATEGORY>#<TYPE_SLUG>` entry
> payload. The visibility flag, and all "list this user's shareable files" logic, must read **both**.
> (Same caveat called out in `CLAUDE.md` / `docs/certificates-design.md`.)

### 3.2 Share item (owned; lives under the owner)
```
pk = USER#<ownerSub>
sk = SHARE#<shareId>
payload = {
  shareId,                // uuid
  tokenHash,              // SHA-256 of the capability token
  status,                 // ACTIVE | REVOKED
  createdAt, expiresAt,   // expiresAt = createdAt + configured TTL (default 30 min, D5)
  recipientLabel?,        // free-text label the owner sets (avoid leaking real names)
  allowDownload: bool,
  pinHash?, pinAttempts,  // reserved for D2; unset in MVP
  viewCount, downloadCount, lastAccessedAt
}
ttl = <expiresAt epoch>   // DynamoDB TTL auto-cleans (lags up to 48h) — still check expiresAt live
```
**No file subset is stored (D1).** The shared file set is resolved live at access time as "all files
under this owner currently flagged `SHAREABLE`," re-checked for existence (P3). Consequences:
- Flipping a file to `PRIVATE` removes it from every active link immediately.
- Flipping a new file to `SHAREABLE` adds it to any active link immediately — the QR always reflects the
  owner's current shareable set.

### 3.3 Token → share reverse lookup (D3)
The recipient has no `ownerSub`, so lookup is by token via a **DynamoDB GSI** `tokenHashIndex`
(`GSI1PK = SHARETOKEN#<hash>`) that resolves directly to the share item. No separate lookup record is
stored. Adding the GSI is a Terraform change (§10).

### 3.4 Audit
Increment `viewCount` / `downloadCount` / `lastAccessedAt` on the share item; optionally append
`SHARE#<shareId>#ACCESS#<ts>` events so the owner sees "viewed 3×, last at …".

---

## 4. API surface

### 4.1 Owner side — `/api/customer/**` (Cognito JWT; user id always `token.getSubject()`)
| Method | Path | Purpose |
|--------|------|---------|
| PATCH  | `/api/customer/files/{ref}/visibility` | Flip a file `SHAREABLE`/`PRIVATE` (resolves across both stores). |
| GET    | `/api/customer/files/shareable` | List the user's currently-shareable files (the set a QR will expose). |
| POST   | `/api/customer/shares` | Create a share. Body: `{ allowDownload, recipientLabel? }` (expiry comes from config, D5). Returns `{ shareId, url, token (shown once), expiresAt }`. |
| GET    | `/api/customer/shares` | List shares with live status + stats. |
| GET    | `/api/customer/shares/{shareId}` | Detail + access log. |
| DELETE | `/api/customer/shares/{shareId}` | Revoke (`status=REVOKED`; link dies immediately). |

No per-share expiry input and no file-subset editing in MVP (D1, D5). To change the shared set, the
owner flips file visibility; to change expiry policy, edit the config property (§10).

### 4.2 Recipient side — new `/api/public/shares/**` (open tier, rate-limited)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/public/shares/redeem` | `{ token, pin? (ignored in MVP, D2) }` → share-session JWT + metadata. Rate-limited. |
| GET  | `/api/public/shares/files` | (share-session JWT) list files — or fold into redeem. |
| POST | `/api/public/shares/files/{fileId}/download` | Short-lived (~5 min) presigned S3 URL (or backend-proxied stream). |

> **CORS gotcha:** any new custom request header (e.g. `X-Share-Session`, if not reusing
> `Authorization`) must be added to `corsConfigurationSource` allowed headers in `SecurityConfig`, or
> the cross-origin preflight fails. If the share-session travels as a `Bearer` token in `Authorization`,
> no CORS change is needed. Native recipients are out of scope (recipient is always a browser).

---

## 5. Flows

### 5.1 Owner creates a share (frontend or mobile)
```
1. Mark files SHAREABLE / PRIVATE (PATCH visibility) — the persistent shareable set.
2. "Create secure link" → download on/off (expiry is fixed by config, 30 min default).
3. POST /shares → url = https://<domain>/#/s/<token>. Link auto-expires in 30 min.
4. Client renders the QR from the URL string (client-side lib; no image round-trip).
5. Owner shows QR to xyz. The QR exposes all currently-shareable files.
```

### 5.2 Recipient (`xyz`) accesses — any phone, no account
```
1. Phone camera scans QR → opens https://<domain>/#/s/<token> in the browser.
2. SPA reads token from the fragment, renders the public "Shared documents" route.
3. POST /redeem { token } → share-session JWT + file list (all shareable files).
4. Viewer lists files (name/type/size); previews inline where possible.
5. Download/view → POST .../download → presigned S3 URL (5-min TTL) → fetch bytes.
6. On expiry (30 min) / revoke → redeem returns 410 Gone with a friendly message.
```

---

## 6. S3 delivery
- **Presigned URL (MVP):** backend returns a short-TTL presigned GET; client fetches directly from S3.
  Fast, offloads bandwidth, bucket stays private. `Content-Disposition: inline` for preview vs
  `attachment` for download, based on `allowDownload`. Reuses the existing `DocumentStorage` /
  presigned-URL helper (`download-url` TTL 300 s) from the certificate module.
- **Backend-proxied stream (phase 3, if needed):** backend streams the object — enables watermarking,
  hard view-only enforcement, and per-byte audit, at bandwidth cost. Never reveals even a temporary URL.
- **Local dev:** when `SEAMARG_DOCUMENT_BUCKET` is unset, the in-memory storage fallback must serve the
  share flow too, so it is testable without AWS (consistent with the existing infra-config fallback).

---

## 7. Threat model & mitigations

| Threat | Mitigation |
|--------|-----------|
| Token guessing / enumeration | 256-bit random token; no sequential IDs exposed; hashed at rest. |
| Link leaked / forwarded / logged | Token in **fragment** (not query) → off server logs & Referer; **short 30-min expiry** (D5); instant revoke. PIN available later (D2). |
| DB compromise | Only token **hashes** and PIN **hashes** stored. |
| Direct S3 access | Private bucket; presigned URLs only, ~5-min TTL. |
| Owner un-shares / deletes a file | Live re-check of `SHAREABLE` + existence on every access (P3). |
| PIN brute force | N/A in MVP (no PIN). When enabled (D2): rate-limit + lockout on `redeem`, `pinAttempts` on the share item. |
| Public-endpoint abuse / DoS | Rate-limit `/api/public/shares/**`; consider CloudFront WAF; optional captcha after repeated failures. |
| PII over-exposure (passport/ID) | Short default expiry; view-only option; owner display *label* not real name; audit trail; optional email OTP. |
| Share-session replay | Session JWT scoped to one `shareId`, ~15-min exp, backend-signed (HMAC). |

---

## 8. Frontend / mobile parity

Per the `CLAUDE.md` sync mandate:
- **Owner controls** (mark shareable, create share, show QR, list/revoke, view stats) → built in
  **both** clients: `frontend/` (extend the delegated `handleClick`/`handleSubmit` switches and
  `apiRequest`, add a public hash route) and `mobile/` (`src/api/client.ts`, `src/features/`, a new
  screen; QR via a React Native QR component). Backend contract identical.
- **Recipient viewer** → **web-only by design** (new public hash route in `frontend/src/main.ts`, no
  auth). This is a justified non-mobile change: the recipient uses their phone browser via QR, not the
  app.

---

## 9. Backend structure

New `com.seamarg.backend.share` domain package, following the package-per-domain, package-private +
public `*AdminService`/DTO-facade convention:
- `ShareController` (customer), `PublicShareController` (public tier).
- `ShareService` (create/list/revoke/redeem, token gen + hashing, PIN handling).
- `ShareRepository` (DynamoDB; in-memory fallback twin).
- `ShareSessionService` (HMAC JWT sign/verify) + a filter for `/api/public/shares/files/**`.
- Reuse `DocumentStorage` (S3 presigned) and file resolution across both stores (add a shared helper if
  the certificate module doesn't already expose "list a user's files across both stores").

---

## 10. Infra / config touchpoints (region `ap-south-1`)
- **Terraform:** add `tokenHashIndex` GSI (if D3=A); enable DynamoDB TTL attribute; confirm S3 CORS
  allows browser `GET` on presigned URLs from the CloudFront origin. Terraform is the source of truth —
  read `docs/project-context.md` before touching infra.
- **Backend config** (`application.properties`, overridable by env, D5): share link TTL
  `seamarg.share.link-ttl` (**default `PT30M`**), share-session TTL, presigned-URL TTL, rate-limit knobs.
- **Backend env** (`/opt/seamarg/backend.env`, 0600, never committed): new HMAC secret for share-session
  JWTs; any of the above TTLs overridden per environment.
- **CloudFront:** public share API rides the existing `/api/*` proxy — no new distribution behavior.

---

## 11. Suggested phasing
1. **MVP:** visibility flag (both stores) → create/revoke share → fragment link → client QR →
   redeem→session → presigned download → expiry. No PIN.
2. **Hardening:** PIN + rate-limit/lockout + access audit & owner stats + download caps + token rotation.
3. **High-assurance:** email OTP, backend-proxied streaming with watermark/view-only, WAF.

---

## 12. Decisions locked (2026-07-09)

| # | Decision | Rationale / notes |
|---|----------|-------------------|
| **D1** | **Persistent per-file `SHAREABLE`/`PRIVATE` flag; a Share exposes all currently-shareable files (no per-share subset).** The set is resolved live at access time. | Owner pre-decides once what is shareable; the QR simply shares that set. Simplest model, and un-sharing/deletion takes effect instantly (P3). Drops `fileRefs` from the share item (§3.2). |
| **D2** | **No PIN/second factor in MVP; build the redeem path loosely coupled for it.** | `redeem` carries an optional (ignored) `pin`; share item reserves `pinHash?`/`pinAttempts`; a single validation seam allows adding PIN/OTP later with no contract change (§2.3). |
| **D3** | **DynamoDB GSI `tokenHashIndex` for token→share lookup.** | Clean; no extra lookup record. Terraform change (§10). |
| **D4** | **Short-lived S3 presigned URLs for delivery.** | Reuses the certificate module's presigned-URL helper; bucket stays private (§6). |
| **D5** | **Link expiry config-driven (`seamarg.share.link-ttl`), default 30 min, auto-expire.** | No per-share expiry input in MVP; change the property to adjust (§2.2, §3.2, §10). |

---

## 13. Implementation notes (2026-07-09)

What shipped, and where it refined the design:

**Backend** — new `com.seamarg.backend.share` package (package-per-domain, package-private internals):
- `ShareController` (`/api/customer/**`), `PublicShareController` (`/api/public/shares/**`),
  `ShareService`, `ShareableFilesService`, `ShareSessionService`, `ShareRepository`
  (`DynamoDbShareRepository` / `InMemoryShareRepository` fallback), `ShareItem`, `ShareSettings`,
  `ShareInfrastructureConfig`.
- **No Terraform change was needed (refines D3).** The app-data table already had a `gsi1`
  (`gsi1Pk`/`gsi1Sk`, projection ALL) and TTL enabled on `expiresAt`. Share items reuse `gsi1` with
  `gsi1Pk = SHARETOKEN#<tokenHash>` for the recipient's token→share lookup, and set `expiresAt` as an
  epoch-seconds Number so DynamoDB TTL auto-cleans them. No new index, no IAM change.
- **Visibility is a sidecar item, not an inline flag (refines D1/§3.1).** Shareable state is stored as
  `SHAREVIS#<fileId>` items in the share package, keeping the certificate package's storage untouched.
  Files are reached only through the certificate package's public facade: a new non-scanning
  `CertificateAdminService.ownedFilesForUser(userId)` method, wrapped by the `OwnedFilesGateway` seam.
- **Session validation is in-service, not a servlet filter.** After `redeem`, the recipient sends the
  share-session token in the request **body** (`POST /files/download`) or a **query param**
  (`GET /files`); the `X-Share-Session` header is still accepted for native clients. `Authorization` is
  deliberately avoided so the Cognito resource-server filter never tries to decode it. `ShareSessionService`
  is a self-contained HMAC-signed token (`base64url(payload).base64url(hmacSha256)`) carrying
  `shareId|ownerSub|exp` — no JWT dependency, no server-side session store.
  - **Why body/query, not the header (fixed 2026-07-10):** behind CloudFront the custom
    `X-Share-Session` header was stripped (not in the forwarded set) and also forced a CORS preflight,
    so the download call hung in production while `redeem` (no custom header) worked. Moving the session
    into the body makes the download request shape-identical to the working `redeem` call. The token in
    the body also stays out of access logs.
- **HTTP verbs:** CORS allows only GET/POST/PUT, so revoke is `POST /shares/{id}/revoke` and visibility
  is `PUT /files/visibility` (no DELETE/PATCH).
- **Config:** `seamarg.share.link-ttl-seconds` (1800), `seamarg.share.session-ttl-seconds` (900),
  `seamarg.share.hmac-secret` (blank → random per-boot secret for local dev). Session expiry is capped
  at `min(sessionTtl, share.expiresAt)`.

**Frontend** — a new **Share documents** sub-page under Certificates (owner: toggle shareable files,
generate link, QR, list/revoke) plus the anonymous **`#/s/<token>`** recipient viewer. QR codes are
generated **client-side** with the `qrcode` package (lazy-imported) — the token never reaches a
third-party QR service. Verified end-to-end in-browser: the recipient route redeems against the live
backend and renders a clean "no longer available" for an unknown/expired token (410).
- **View/Download fix (2026-07-10):** the recipient's download opens the new tab **synchronously inside
  the click** and only redirects it to the presigned URL once the fetch resolves — opening it after the
  `await` was treated as an unsolicited popup and blocked (the "it just blinks" symptom).

**Mobile** — owner-side parity screen at `mobile/app/(app)/certificates/share.tsx` (`src/api/share.ts`),
QR via `react-native-qrcode-svg`, native share sheet for the link. The recipient viewer stays **web-only
by design** (§8) — recipients use their phone's browser via the QR, not the app.

**Tests:** `ShareServiceTests`, `ShareSessionServiceTests`, `ShareableFilesServiceTests` (fake gateway,
no Mockito — its inline mock-maker fails on JDK 21 in this environment), plus share security/flow
assertions in `EndpointSecurityTests`. Full backend suite + frontend build + mobile typecheck all pass.
