# Certificates Mini-Spec — SeaMarg Private Portal (Step 2)

Status: **Approved design** (2026-07-05) — decisions locked; implementation pending
Related: `docs/private-portal-prd.md` §5, `docs/profile-data-design.md`,
`backend/src/main/java/com/seamarg/backend/certificate/*`

## Decisions locked (2026-07-05)
- **D1 — key scheme:** one DynamoDB item per catalog type (`CERT#<CATEGORY>#<TYPE_SLUG>`) + one
  `CERT#MAINDOCS` item. (§3)
- **D2 — upload flow:** upload-first; the file is stored + AI-analysed and the returned metadata
  prefills the form for review before Save. (§6)
- **D3 — backend:** refactor the existing `com.seamarg.backend.certificate` module in place (re-key,
  widen fields, reshape controller); reuse S3 storage + the analyzer wiring. (§1, §9)
- **D4 — AI extraction provider: MiniMax.** Use the user's **MiniMax** API key as the primary
  extractor (vision-capable, via MiniMax's OpenAI-compatible chat-completions API), with the existing
  `LocalCertificateExtractor` heuristic as the no-key fallback. This **replaces OpenAI** as the
  primary. See §6/§9 for the extractor change. Exact MiniMax base URL + model id to confirm at build.

This spec covers Step 2 (Certificates). It reuses the Step-1 profile patterns (per-section GET/PUT,
dummy option lists, honest load/error/saved states) and the **existing certificate backend POC**
(S3 upload + AI extraction), which is still in the codebase and largely reusable.

---

## 1. What already exists (reuse inventory)

The POC left a working, JWT-protected pipeline under `com.seamarg.backend.certificate`:

| Piece | File | Reuse? |
|-------|------|--------|
| Multipart upload endpoint | `CertificateController` (`POST /api/customer/certificates`) | Refactor |
| Upload → validate → S3 store → AI extract → save | `CertificateService` | Refactor |
| S3 store + presigned download URL | `DocumentStorage` / S3 impl | ✅ Reuse as-is |
| AI extraction (provider + local fallback) | `CertificateAnalyzer`, `OpenAiCertificateExtractor`, `LocalCertificateExtractor` | Swap provider → MiniMax (D4); reuse analyzer + local fallback |
| Extraction result shape | `CertificateExtraction` (documentName, category, rank, expiryDate, issuer, certificateNumber, confidence, source, notes) | Extend |
| DynamoDB persistence | `DynamoDbCertificateRepository` (`sk=CERTIFICATE#<uuid>`, `gsi1`) | Re-key |
| Settings + config | `CertificateSettings`, `application.properties` (`SEAMARG_DOCUMENT_BUCKET`, `OPENAI_API_KEY`, max-upload 10 MB, download-url TTL 300 s) | ✅ Reuse |
| Allowed types / size | PDF, JPEG, PNG, WEBP, HEIC (+ txt/doc/docx), ≤ 10 MB | ✅ Reuse |

**Implication:** we do **not** rebuild storage or AI extraction. We (a) re-key the DynamoDB records
to the catalog model below, (b) widen the field set (issue date / place / authority / COC grade /
clinic name), and (c) reshape the controller to be catalog/category-aware and form-first.

---

## 2. Information architecture (§5)

Step 2 left submenu (8 items):

1. Guide to entering certificates — informational only (reuse `.portal-guide`)
2. Main documents — checkbox grid (held / not held)
3. General certificates ┐
4. National Certificates Of Competency │
5. Medical Certificates ├ six **detailed categories**, same accordion pattern
6. Tanker/Passenger certificates │
7. Offshore certificates │
8. Flag State Documents ┘

Routes: `#/certificates/guide`, `#/certificates/main-documents`, `#/certificates/general`,
`#/certificates/ncoc`, `#/certificates/medical`, `#/certificates/tanker-passenger`,
`#/certificates/offshore`, `#/certificates/flag-state`. (Slugs already exist in `privateSteps`.)

---

## 3. Data model (DynamoDB, single table `seamarg-dev-app-data`)

Keyed by Cognito `sub`, mirroring the profile "one logical item per thing" philosophy.

| Item | pk | sk |
|------|----|----|
| Main documents checklist | `USER#<sub>` | `CERT#MAINDOCS` |
| One detailed certificate entry | `USER#<sub>` | `CERT#<CATEGORY>#<TYPE_SLUG>` |

- `<CATEGORY>` ∈ `GENERAL | NCOC | MEDICAL | TANKER | OFFSHORE | FLAGSTATE`.
- `<TYPE_SLUG>` = the predefined certificate type from that category's catalog (§4).
- **One item per (category, type)** the user actually fills in — an unfilled catalog row has no item.
  This maps 1:1 to the accordion (one row per catalog type) and gives natural upsert + per-entry Save.
- Each entry item stores: the form fields (§5), optional attached-file metadata
  (`bucketName`, `objectKey`, `originalFilename`, `contentType`, `sizeBytes`), the AI-extraction
  metadata (`confidence`, `extractionSource`, `extractionNotes`) when a file was analysed, and
  `updatedAt`.

**D1 locked:** one item per catalog type (`CERT#<CATEGORY>#<TYPE_SLUG>`), not the POC's free-form
`CERTIFICATE#<uuid>`.

Old POC `CERTIFICATE#<uuid>` items (if any exist in dev) are orphaned by the re-key; safe to ignore
or purge in dev.

---

## 4. Certificate catalogs (dummy — final lists load later)

Catalogs are **frontend constants** for now (consistent with Step-1 dummy option lists); the backend
does not need a catalog store yet. Representative dummy sets:

- **Main documents** (from PRD §5.2, checkbox grid): COVID-19 fully vaccinated, ARAMCO approval,
  BOSIET (NOGEPA), BOSIET (OPITO), DP Advanced/Induction/Limited/Maintenance/Unlimited Course, FOET,
  High voltage, HUET (NOGEPA), HUET (OPITO), Sparrow Stage 1/2/3, TBOSIET.
- **General:** STCW Basic Safety Training; Proficiency in Survival Craft & Rescue Boats; Advanced
  Fire Fighting; Medical First Aid; GMDSS General Operator; Ship Security Awareness.
- **National Certificates Of Competency (NCOC):** Certificate of Competency — Deck; CoC — Engine;
  GMDSS Radio Operator. *(each requires **COC grade**)*
- **Medical:** Medical Fitness (ILO/MLC); Drug & Alcohol Test; Yellow Fever Vaccination.
  *(each supports **Clinic Name**)*
- **Tanker/Passenger:** Basic Training Oil & Chemical Tanker; Advanced Oil Tanker Operations;
  Liquefied Gas Tanker; Passenger Ship Crowd Management.
- **Offshore:** BOSIET; HUET; FOET; T-BOSIET.
- **Flag State Documents:** Panama Flag Endorsement; Liberia Flag Endorsement; Marshall Islands Flag
  Endorsement.

---

## 5. Entry field model (§5.3–5.8)

Common fields per detailed certificate entry:

| Field | Required | Control | Notes |
|-------|----------|---------|-------|
| Number | no | text | certificate number; not all documents have one |
| Issued Date | **yes** | date | |
| Expiry Date | no | date | some certs are permanent; **past date rejected** |
| Issue Place | **yes** | text | |
| Issuing Authority | **yes** | text | |

Category-specific extras:
- **NCOC:** `COC grade` — **required**, dropdown (dummy grades, e.g. Master / Chief Mate / OOW /
  Chief Engineer / Second Engineer / EOOW).
- **Medical:** `Clinic Name` — optional text.

Main documents: no per-item fields — just held/not-held booleans (like Professional skills).

Validation (mirrors PRD §7): required fields block save; **expiry date in the past is rejected**
(both client and server); each Save persists that one entry independently.

---

## 6. File upload + AI extraction flow

PRD §5.3–5.8: each entry supports **one** attached scanned file (PDF/image); **AI extracts metadata
to help populate the entry fields**. Intended UX is **upload-first**:

```
1. User expands a catalog row (e.g. General → "STCW Basic Safety Training").
2. User attaches a file → POST .../file (multipart).
   Backend: validate → store in S3 → run CertificateAnalyzer → return
     { extraction: {issuedDate?, expiryDate?, issuePlace?, issuingAuthority?, number?, confidence,
       source, notes}, file: {objectKey, originalFilename, contentType, sizeBytes} }
   Frontend: PREFILL the form fields from extraction (marked "AI-suggested — please review"),
     keeping the file reference.
3. User reviews/edits, then Save → PUT persists the entry fields + the file reference.
4. "View file" → GET .../download-url returns a short-lived presigned S3 URL.
```

- The **upload endpoint stores the file and returns suggestions**; it does **not** by itself create
  the final entry. The **PUT Save** is the source of truth and links the `objectKey`.
- File is optional — a user can fill the form manually and Save with no attachment.
- Replace file = upload again (overwrites the entry's file reference; old object can be left or
  cleaned up). Remove file = a flag on PUT (or a small DELETE .../file).
- Extraction fields to widen in `CertificateExtraction`: add `issuedDate`, `issuePlace`,
  `issuingAuthority` (currently it has documentName/category/rank/expiryDate/issuer/number). The
  extractor prompt + local heuristic get the new target fields.

### Extractor provider — MiniMax (D4)
The POC's `OpenAiCertificateExtractor` calls OpenAI's **Responses API** (`/v1/responses`, with
`input_image`/`input_file` parts and `text.format` json_schema). **MiniMax exposes an
OpenAI-compatible Chat Completions API** (`/v1/chat/completions`), which is a *different* shape, so
this is not a base-URL swap. Plan:

- Add a `MiniMaxCertificateExtractor` (vision-capable model) that posts a chat-completions request:
  a system prompt + a user message combining an image/file part (base64 data URL) and the
  extraction instruction, requesting a strict JSON object (the widened field set). Parse the JSON
  from the assistant message; set `source = "minimax:<model>"`.
- `CertificateAnalyzer` picks MiniMax when its key is configured, else falls back to
  `LocalCertificateExtractor`. Keep `OpenAiCertificateExtractor` in the tree (unused unless an OpenAI
  key is set) or remove it — decide at build.
- New config: `SEAMARG_MINIMAX_API_KEY`, `SEAMARG_MINIMAX_BASE_URL` (default MiniMax OpenAI-compatible
  endpoint), `SEAMARG_MINIMAX_MODEL` (a vision model). Exact base URL + model id **to confirm at
  build** against current MiniMax docs.
- Non-image files (PDF): if the chosen MiniMax model can't take a PDF directly, either send as an
  image after a client/server render, or fall back to the local heuristic for PDFs initially.

---

## 7. API contract (proposed)

All under `/api/customer/certificates`, JWT-protected; `sub` from the token, never the body.

| Method & path | Purpose |
|---------------|---------|
| `GET /api/customer/certificates` | Return the main-documents map + all saved detailed entries, grouped by category. |
| `PUT /api/customer/certificates/main-documents` | Upsert the held/not-held checkbox map. |
| `PUT /api/customer/certificates/{category}/{type}` | Upsert one detailed entry (fields in body). Validates required + expiry-not-past. |
| `POST /api/customer/certificates/{category}/{type}/file` (multipart) | Store file, run AI extraction, return suggestions + file metadata. |
| `GET /api/customer/certificates/{category}/{type}/download-url` | Short-lived presigned URL for the attached file. |
| `DELETE /api/customer/certificates/{category}/{type}` | Remove an entry (and its file). |

`{category}` ∈ `general|ncoc|medical|tanker-passenger|offshore|flag-state`; `{type}` is a catalog
slug. Unknown category/type → 400. Response shapes reuse the existing `ApiError` + a
`CertificateEntryResponse`.

---

## 8. Frontend shape

- **Accordion per detailed category:** one collapsible row per catalog type, with top-right
  **"Expand filled"** and **"Collapse all"** controls (PRD §5). A row shows a filled/empty badge and,
  when expanded, the entry form + file dropzone + (if attached) a "View file" link.
- **Main documents:** reuse the Professional-skills checkbox pattern (single Save).
- **Guide:** reuse `.portal-guide`.
- Load once via `GET /api/customer/certificates` into a `certificatesState` (mirrors
  `profileState`: `loadedForSubject`/`loading`/`error`/`sections`), triggered from `bindCurrentPage`
  when the path starts with `/certificates`. **Reuse the loop-safe guard** from `loadProfileFromApi`.
- Per-entry Save posts to the entry PUT; per-entry file upload posts multipart then prefills.
- Catalogs live as TS constants (like `PROFESSIONAL_SKILLS`, `VISAS`).

---

## 9. Infra / config

- **S3 bucket** for documents already exists (`SEAMARG_DOCUMENT_BUCKET`) and the backend IAM role has
  access (POC). Confirm it is provisioned in Terraform and non-empty in `dev` before building upload.
- **MiniMax (D4)**: extraction uses a new `SEAMARG_MINIMAX_API_KEY` (+ base URL + vision model id);
  if absent, `CertificateAnalyzer` falls back to `LocalCertificateExtractor` (heuristic), so the
  feature degrades gracefully without a key. The old `OPENAI_API_KEY`/`SEAMARG_OPENAI_MODEL` keys
  become inactive unless the OpenAI extractor is retained.
- No new CORS methods needed (PUT/POST/GET already allowed); confirm multipart size aligns with any
  CloudFront/EC2 body-size limits.

---

## 10. Build sequence (proposed)

1. ✅ **Guide to entering certificates (done, 2026-07-05)** — static `.portal-guide` page: two entry
   patterns, category list, rules (expired rejected, Expand filled / Collapse all). No backend.
2. ✅ **Main documents (done, 2026-07-05)** — checkbox grid (`.portal-check-grid`, 17 dummy items) +
   `GET`/`PUT /api/customer/certificates/main-documents` (stored as `CERT#MAINDOCS` JSON via the new
   generic `CertificateDataRepository`). Shipped the certificates load/state plumbing
   (`certificatesState`, loop-safe `loadCertificatesFromApi`, `retry-certificates`, reset on sign-out).
   Backend test coverage in `EndpointSecurityTests` (auth-required, round-trip, no cross-user leak).
3. ✅ **General certificates (done, 2026-07-05)** — accordion (`.certificate-accordion`, Expand
   filled / Collapse all, expansion tracked in `expandedCertificates`) over the dummy
   `GENERAL_CERTIFICATES` catalog; per-entry form (Number, Issued Date*, Expiry Date, Issue Place*,
   Issuing Authority*) with required + past-expiry validation on client and server. `GET
   /api/customer/certificates/entries` (grouped by category) + `PUT
   /api/customer/certificates/{category}/{type}`. Backend: `CertificateCategory` enum, prefix query
   on `CertificateDataRepository`, `CertificateEntryService`/`CertificateEntryController`; tests in
   `EndpointSecurityTests` (round-trip, required, past-expiry, unknown-category). No file upload yet.
4. **File upload + AI extraction** on that category: `POST .../file` (reuse storage + analyzer,
   widen extraction fields) → prefill → Save with file link → `download-url`.
5. **Replicate** the accordion+form+upload to the remaining five categories, adding the
   category-specific fields (COC grade for NCOC, Clinic Name for Medical).

Each step: typecheck + backend tests + in-browser verification (stubbed API), same as Step 1.

---

## 11. Decisions — locked (2026-07-05)

- **D1** ✅ one item per catalog type (`CERT#<CATEGORY>#<TYPE_SLUG>`).
- **D2** ✅ upload-first; AI prefills the form for review before Save.
- **D3** ✅ refactor the existing certificate module in place.
- **D4** ✅ **MiniMax** is the primary AI extractor (user has the key); local heuristic is the
  fallback. Add MiniMax config; confirm exact base URL + vision model id at build.

Still to confirm at build (non-blocking): S3 document bucket is provisioned + non-empty in `dev`;
MiniMax base URL/model id + whether it accepts PDFs directly (else render-to-image or local fallback
for PDFs).
