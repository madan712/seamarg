# Courses Feature — Design Spec (SeaMarg)

Status: **Implemented** (2026-07-10) — decisions D1–D4 locked; backend + web + mobile shipped.
See §13 for as-built notes.
Source data: `DGS_Maritime_Institutes_Websites_and_Courses.xlsx` (227 institutes, free-text course lists; **no batch/seat data**).
Related: `CLAUDE.md` (single-table DynamoDB, three security tiers), `docs/certificates-design.md`
(catalog + admin-facade patterns reused here), `docs/project-context.md`.

---

## 0. What this feature is

Let seafarers **discover** maritime training (institutes → courses → scheduled batches), **search**
by institute / course / date, and **request enrollment** in a batch. Admins **manage** the whole
catalog (institutes, the canonical course list, per-institute offerings, batches with seat counts)
and **approve/reject** enrollment requests from the dashboard.

This is the first feature with **global / shared catalog data**. Everything built so far is per-user
(`pk=USER#<sub>`); institutes, course types, offerings, and batches are shared entities that exist
independently of any user. Enrollments are the bridge (per-user, admin-actioned).

## 1. Decisions locked (2026-07-10)

- **D1 — Enrollment model: request → admin confirms.** Enrolling creates a `PENDING` enrollment and
  does **not** change seats. Seats are only consumed when an admin **approves** (atomic, capacity-
  guarded). No public waitlist. (§5, §6)
- **D2 — One-time load: institutes + AI-normalized courses + seeded demo batches.** Import all
  institute columns cleanly; use the existing **MiniMax** key (offline, reviewed) to normalize the
  free-text "Courses Offered" into canonical course types + per-institute offerings; **seed dummy
  batches** (future dates e.g. `2026-08-01`, `2026-09-01`; seats e.g. 10/15/20, status `OPEN`) so the
  feature is demoable on day one. Admin can then add / edit / disable / delete course types,
  offerings, and batches. (§7)
- **D3 — Course model: canonical catalog + offerings.** A shared master list of standardized course
  types (GP Rating, GME, DNS, STCW Basic Safety, AFF, ECDIS, …); institutes *offer* types; batches
  belong to an offering. "Search a course" spans every institute/batch offering that type. Mirrors
  the certificate-catalog pattern already in the app. (§3, §4)
- **D4 — Browse access: public discovery.** Catalog + search live under `/api/public/**` (no auth).
  **Enrollment requires a Cognito login** (`/api/customer/**`). Admin management is
  `X-Admin-Password` (`/api/admin/**`), web-only. (§5)

Open sub-decisions (non-blocking, default chosen):
- **Import all 227 institutes**, carrying `approvalStatus` from the sheet; `active = (status == Approved)`.
  Non-approved institutes are imported but hidden from public browse until an admin enables them.
- **Global "all-courses date search"** (a date range with no course chosen) uses a bounded scan at
  this data scale; the primary search flow is course-first (see §5.4).

---

## 2. Storage strategy — reuse the existing single table

No new table and **no Terraform schema change**. Reuse `seamarg-dev-app-data`
(`pk`/`sk` + one GSI `gsi1` on `gsi1Pk`/`gsi1Sk`, projection `ALL`, PAY_PER_REQUEST). We add new
**`pk` namespaces** for the shared entities and reuse `gsi1` with new `gsi1Pk` namespaces
(`INSTITUTE`, `COURSETYPE#<slug>`, `BATCH#<batchId>`) that don't collide with existing user-oriented
GSI values. Data is small (227 institutes, a few hundred course types, low-thousands of batches), so
every access pattern below is a **single-partition Query** — no full-table scans on the hot paths.

The in-memory-repository fallback (`*InfrastructureConfig` when `SEAMARG_APP_DATA_TABLE` is unset)
is extended so Courses works locally without AWS, exactly like profile/certificate.

## 3. Data model (single table)

Every entity stores its fields as a JSON `payload` + `updatedAt`, consistent with profile/certificate.

| Entity | pk | sk | gsi1Pk | gsi1Sk | Purpose of GSI entry |
|--------|----|----|--------|--------|----------------------|
| **Course type** (canonical) | `CATALOG#COURSETYPE` | `TYPE#<slug>` | — | — | one small partition; Query = whole catalog |
| **Institute** (meta) | `INSTITUTE#<instId>` | `META` | `INSTITUTE` | `<STATE>#<name>` | list/browse all institutes, sorted |
| **Offering** (institute offers a type) | `INSTITUTE#<instId>` | `OFFERING#<typeSlug>` | `COURSETYPE#<typeSlug>` | `OFFERING#<instId>` | "who offers course X" |
| **Batch** | `INSTITUTE#<instId>` | `BATCH#<typeSlug>#<batchId>` | `COURSETYPE#<typeSlug>` | `BATCH#<startDate>#<instId>#<batchId>` | course + date-range search across institutes |
| **Enrollment** | `USER#<sub>` | `ENROLLMENT#<batchId>` | `BATCH#<batchId>` | `ENROLLMENT#<createdAt>#<sub>` | per-user list (main) + per-batch roster (GSI) |

Key ids:
- `instId` = stable slug of institute name (fallback uuid); `dgsCode`, `approvalStatus` stored as
  attributes (DGS codes are *mostly* unique but the sheet notes brand/code overlaps, so we don't key
  on them).
- `typeSlug` = canonical course-type slug (e.g. `gp-rating`, `gme`, `stcw-basic-safety-training`).
- `batchId` = uuid, **globally unique** so the `BATCH#<batchId>` GSI partition is unambiguous.
- Dates are ISO `YYYY-MM-DD` so lexical sort == chronological sort (enables `between` on `gsi1Sk`).

### Why these keys satisfy every access pattern
- **Whole course catalog** → Query `pk = CATALOG#COURSETYPE`.
- **Institute detail (everything about one institute)** → Query `pk = INSTITUTE#<instId>` returns its
  `META` + all offerings + all batches in one call (great for the detail page).
- **Browse all institutes** → Query `gsi1` `gsi1Pk = INSTITUTE` (sorted by state, name); filter
  q/state/city in memory.
- **Course-centric view ("course X across institutes")** → Query `gsi1` `gsi1Pk = COURSETYPE#<slug>`:
  `begins_with(gsi1Sk,"OFFERING#")` → institutes offering it; `begins_with(gsi1Sk,"BATCH#")` → its
  batches.
- **Search batches by course + date range** → Query `gsi1` `gsi1Pk = COURSETYPE#<slug>` with
  `gsi1Sk between "BATCH#<from>" and "BATCH#<to>~"`; filter open/seats-available in memory.
- **User's enrollments** → Query `pk = USER#<sub>` `begins_with(sk,"ENROLLMENT#")`.
- **Batch roster (admin approve queue for a batch)** → Query `gsi1` `gsi1Pk = BATCH#<batchId>`.

## 4. Entity fields

**CourseType** (canonical, admin-managed): `slug`, `name`, `category`
(`PRE_SEA | STCW_MODULAR | COMPETENCY | REFRESHER | TANKER | SIMULATOR | OTHER`), `description`,
`active`. Categories mirror the sheet's own grouping (§ Summary sheet notes).

**Institute** (from Excel): `name`, `dgsCode`, `approvalStatus` (`Approved|Suspended|Expired`),
`city`, `state`, `website`, `notes`, `active` (public-visible), `sourceRow` (S.No, provenance).

**Offering**: `instituteId`, `typeSlug`, optional institute-specific `displayName`, `fees`,
`durationText`, `active`.

**Batch**: `batchId`, `instituteId`, `typeSlug`, `startDate`, optional `endDate`, `totalSeats`,
`confirmedSeats` (derived from approvals), `status` (`OPEN | CLOSED | CANCELLED`), optional `fees`,
`mode` (`ONSITE|ONLINE`), `notes`. `availableSeats = totalSeats - confirmedSeats` (computed).

**Enrollment**: `sub`, `batchId`, denormalized snapshot (`instituteId`, `instituteName`, `typeSlug`,
`courseName`, `startDate`) for display without extra reads, `status`
(`PENDING | CONFIRMED | REJECTED | CANCELLED`), `createdAt`, `decidedAt`, `decidedBy`, `note`.

## 5. API contract

### 5.1 Public — discovery (`/api/public/**`, no auth)
| Method & path | Purpose |
|---------------|---------|
| `GET /api/public/courses/catalog` | All active course types, grouped by category. |
| `GET /api/public/institutes?q=&state=&city=` | Browse/search institutes (active only). |
| `GET /api/public/institutes/{instId}` | Institute detail + offerings + upcoming open batches. |
| `GET /api/public/courses/{typeSlug}` | Course-type detail + institutes offering it + upcoming batches. |
| `GET /api/public/batches/search?course=&from=&to=&state=&openOnly=true` | **Primary search**: batches by course + date range (+ optional state/open filters). |

### 5.2 Customer — enrollment (`/api/customer/**`, Cognito JWT; `sub` from token, never body)
| Method & path | Purpose |
|---------------|---------|
| `POST /api/customer/enrollments` `{batchId}` | Create a `PENDING` request. Validates: batch exists, `OPEN`, start date in the future, no existing active enrollment for that batch (conditional put on `sk`). |
| `GET /api/customer/enrollments` | The user's enrollments with status + snapshots. |
| `DELETE /api/customer/enrollments/{batchId}` | Cancel own enrollment; if it was `CONFIRMED`, transactionally free the seat (§6). |

### 5.3 Admin — management (`/api/admin/**`, `X-Admin-Password`)
| Area | Endpoints |
|------|-----------|
| Course catalog | `GET/POST/PUT/DELETE /api/admin/course-types[/{slug}]` (+ enable/disable). |
| Institutes | `GET/POST/PUT/DELETE /api/admin/institutes[/{instId}]` (+ enable/disable). |
| Offerings | `PUT/DELETE /api/admin/institutes/{instId}/offerings/{typeSlug}`. |
| Batches | `POST/PUT/DELETE /api/admin/institutes/{instId}/batches[/{batchId}]` (+ open/close). |
| Enrollment queue | `GET /api/admin/batches/{batchId}/enrollments`; `POST /api/admin/enrollments/{sub}/{batchId}/approve`; `.../reject`. |
| One-time import | `POST /api/admin/import/institutes` — idempotent upsert from checked-in seed JSON (§7). |

Unknown category/type/id → 400; validation errors reuse the existing `ApiError` shape.

### 5.4 Search notes
The requested searches ("search institute, search course, find batch, search by dates") map to:
institute search = 5.1 `/institutes`; course search = 5.1 `/courses/{slug}` or the catalog; batch +
date search = 5.1 `/batches/search` (course-first, backed by the `COURSETYPE#<slug>` GSI partition
with a `between` on the date-prefixed sort key). A pure date range with **no** course selected falls
back to a bounded scan (acceptable at this scale) or prompts the user to pick a course/category first.

## 6. Seat integrity (request → confirm)

> **As-built (2026-07-10):** implemented with an optimistic **`GetItem` + capacity-guarded conditional
> `PutItem`** instead of `TransactWriteItems`. The deployed backend IAM role grants single-item ops
> (`GetItem`/`PutItem`/`Query`/`Scan`/`UpdateItem`/`DeleteItem`) but **not** DynamoDB transactions, so
> `TransactWriteItems` failed with an `SdkException` at approval time. The optimistic approach uses the
> same operations the profile/certificate flows already run in production and stays overbooking-safe:
> the seat rewrite carries a `ConditionExpression confirmedSeats = <value-read>`, so a lost race fails
> the condition and the approval is retried/refused rather than overbooking. Enrollment status and seat
> writes are two separate PutItems; if the status write fails after a reserve, the seat is released
> (compensating write). Approval is single-admin and low-concurrency, so this is safe in practice.

Seats change at exactly one moment — **admin approval** — which is low-concurrency and server-side:

- **Request**: write `ENROLLMENT` `PENDING`. No seat change. Duplicate guard via
  `attribute_not_exists(pk)` on the enrollment `sk`.
- **Approve**: `TransactWriteItems` = (a) set enrollment `CONFIRMED` **and** (b) `SET confirmedSeats =
  confirmedSeats + 1` on the batch with `ConditionExpression: confirmedSeats < totalSeats`. If the
  condition fails → batch full → approval rejected with a clear error.
- **Reject** a pending: just flip status, no seat change.
- **Cancel/reject a confirmed**: transaction decrements `confirmedSeats`.

This is overbooking-safe without any optimistic-locking complexity on the public path, because the
public path never mutates seats.

## 7. One-time data load (D2)

Two-stage, **idempotent**, admin-triggered — never parse the xlsx in the running backend:

1. **Offline prep (checked into `data/`):**
   - Parse the xlsx → `data/institutes.json` (clean structured columns; 227 rows).
   - Build `data/course-types.json` — a curated canonical maritime taxonomy (GP Rating, GME, DNS,
     ETO, B.Tech Marine Eng., STCW modular set, competency/refresher, tanker, simulator …).
   - Run **MiniMax** over each institute's free-text "Courses Offered" to map it to canonical
     `typeSlug`s → `data/offerings.json`. **Human-reviewed** before commit (AI is a first pass, not
     the source of truth — the sheet's course text is inconsistent and partly historical).
   - `data/seed-batches.json` — a few demo batches per offering (dates `2026-08-01`/`2026-09-01`,
     seats 10/15/20, `OPEN`) so search/enroll are demoable immediately.
2. **Import endpoint** `POST /api/admin/import/institutes` upserts all four files idempotently
   (safe to re-run; keyed writes, no duplicates). After import, admins manage everything from the
   dashboard.

## 8. Backend shape (package-per-domain)

New `com.seamarg.backend.course` package, following the repo's conventions:
- Package-private `PublicCourseController` (`/api/public/**`), `EnrollmentController`
  (`/api/customer/**`), `CourseAdminController` (`/api/admin/**`).
- Package-private services + `CourseDataRepository` (Dynamo impl + in-memory fallback via
  `CourseInfrastructureConfig`, mirroring the certificate module).
- **Public `CourseAdminService` facade + public DTOs** for the admin dashboard (do not widen
  internals), consistent with `ProfileAdminService`/`CertificateAdminService`.
- `SecurityConfig`: `/api/public/courses/**`, `/api/public/institutes/**`, `/api/public/batches/**`
  are already covered by the open `/api/public/**` rule; enrollment sits under the existing
  `/api/customer/**` rule; admin under `/api/admin/**`. **No new CORS headers** (no custom request
  headers introduced; methods GET/POST/PUT/DELETE already allowed).

## 9. Frontend shape (`frontend/src/main.ts`, hash routing + delegated events)

New public/browse views + a customer view, extending `renderApp()` / `handleClick` / `handleSubmit`:
- `#/courses` — course catalog + **batch search** (course + date range + state/open filters).
- `#/institutes`, `#/institutes/:id` — institute browse + detail (offerings, upcoming batches).
- `#/courses/:slug` — course-type detail (institutes + batches offering it).
- Enroll button → if no session, route to sign-in then back; else `POST /api/customer/enrollments`.
- `#/my-enrollments` — the logged-in user's requests + statuses.
- **Admin console:** a new "Courses" area — CRUD for course types, institutes, offerings, batches;
  and a per-batch **enrollment approval queue** (approve/reject). Reuses the admin
  `X-Admin-Password` session + `ApiError` handling.
- Escape all interpolated strings with `escapeHtml()`.

## 10. Mobile parity (`mobile/`, per CLAUDE.md)

Customer-facing pieces are replicated in Expo:
- `src/features/courses/` + expo-router screens: browse institutes, course catalog + batch search,
  institute/course detail, enroll, and "my enrollments".
- `src/api/client.ts` gains the same public + `/api/customer/enrollments` calls (paths/shapes
  identical to web). Native requests send no `Origin`, so CORS is not involved.
- **Admin course management stays web-only** (intentional, like the rest of admin) — noted rather
  than skipped silently.

## 11. Build sequence (proposed)

1. **Backend catalog + data model** — `course` package, repos (Dynamo + in-memory), course-type and
   institute entities, public read endpoints (`/catalog`, `/institutes`, `/institutes/{id}`).
   Tests: auth-open, round-trip, key isolation.
2. **Offerings + batches + search** — offering/batch entities, `COURSETYPE#<slug>` GSI, the
   `/batches/search` course+date endpoint. Tests: date-range query, open/seats filter.
3. **Enrollment (request→confirm)** — customer create/list/cancel + admin roster/approve/reject with
   the seat-integrity transaction. Tests: duplicate guard, capacity condition, cross-user isolation.
4. **Admin console (frontend)** — CRUD for course types / institutes / offerings / batches +
   approval queue.
5. **Public browse + search + enroll (frontend)** — the discovery views and enrollment UX.
6. **One-time import** — offline `data/*.json` (incl. AI-normalized offerings, reviewed) + idempotent
   `POST /api/admin/import/institutes`; seed demo batches.
7. **Mobile parity** — customer browse/search/enroll + my-enrollments.

Each step: `npm run typecheck` (frontend + mobile) + `./gradlew :backend:test` + in-browser
verification, matching the profile/certificate build rhythm.

## 12. Open items to confirm at build (non-blocking)
- Final canonical course-type taxonomy (curated list) before running the AI normalization pass.
- Whether non-approved institutes are ever surfaced publicly (default: hidden until enabled).
- Enrollment notifications (email/push on approve/reject) — out of scope for v1; note as a follow-up.
- Whether public browse needs rate-limiting given it's unauthenticated (default: rely on CloudFront;
  revisit if abused).

---

## 13. As-built notes (2026-07-10)

Implemented end-to-end following the §11 sequence.

**Backend** — new `com.seamarg.backend.course` package on the existing single table (no
Terraform/schema change; reuses `gsi1`):
- `CourseCategory`, `EnrollmentStatus`, `CourseKeys` (key scheme), `CourseItem` (+ numeric seat
  attributes), `CourseRepository` (Dynamo + in-memory, wired by `CourseInfrastructureConfig` off
  `seamarg.app-data.table-name`, reusing the certificate module's `DynamoDbClient`/`ObjectMapper`).
- `CourseService` (catalog/institutes/offerings/batches + course+date search), `EnrollmentService`
  (request→confirm with the capacity-safe seat transaction — `TransactWriteItems` +
  `confirmedSeats < totalSeats` condition on Dynamo, synchronized on in-memory).
- Controllers: `PublicCourseController` (`/api/public/courses|institutes|batches`),
  `EnrollmentController` (`/api/customer/enrollments`), `CourseAdminController`
  (`/api/admin/courses/**`), `CourseImportService` (idempotent seed from
  `resources/seed/institutes.json` [227 rows, from the xlsx] + `resources/seed/course-types.json`
  [28 curated canonical types with keyword lists]; keyword-maps free-text → offerings; seeds demo
  batches `2026-08-01`/`2026-09-01`, seats 15/20).
- `SecurityConfig`: added **`DELETE`** to the CORS allowed methods (was GET/POST/PUT/OPTIONS) for
  enrollment cancel + admin deletes. No new headers.
- Tests: `CourseServiceTests`, `EnrollmentServiceTests` (duplicate guard, capacity, seat release),
  `CourseImportServiceTests` (idempotent), plus `EndpointSecurityTests` cases (public open, customer
  JWT-gated, admin password-gated). `./gradlew :backend:test` green. Live-verified via curl: import →
  28 types / 227 institutes / 174 active / 592 offerings / 1062 batches; catalog, institute list,
  course+date search all correct.

**Web** (`frontend/src/main.ts`) — Courses surfaced inside the private `/courses` portal step
(sub-pages **Find a course**, **Browse institutes**, **My enrollments**) since the web app is a
logged-in portal; the same catalog is public for mobile/marketing. Admin console gained a **Users /
Courses** tab switch with import, institute/offering/batch CRUD, and a per-batch enrollment approval
queue. Verified in-browser against the live backend (admin path).

**Mobile** (`mobile/`) — `src/api/courses.ts` twin + a rewritten `app/(app)/courses.tsx` (Find /
Institutes / My enrollments, request→cancel). Admin stays web-only per CLAUDE.md. `typecheck` green.

**Contract refinement vs. §5.2:** `POST /api/customer/enrollments` takes
`{instituteId, typeSlug, batchId}` (full batch coordinates), not just `{batchId}` — a batch lives in
its institute partition, so carrying coordinates avoids a global batch-id lookup. Public search
results and detail views already return these fields.
