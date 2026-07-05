# Profile Data & Auth Design — SeaMarg Private Portal

Status: Approved design (2026-07-04) — implementation pending
Related: `docs/private-portal-prd.md`, `docs/project-context.md`, `infra/terraform/modules/auth/main.tf`

## Decisions locked (2026-07-04)
1. **Login model:** keep **password-based Cognito** (SRP + email verification). Add First name,
   Last name, Mobile phone, and Birth date to the existing signup form. (The Alpha Crew screenshot
   is passwordless; we are not adopting that.)
2. **Signup basics storage:** store the 5 basics as **Cognito standard attributes** *and* seed them
   into the **DynamoDB** profile. DynamoDB is authoritative once the user edits.
3. **DynamoDB layout:** **one item per profile section** (`sk=PROFILE#MAIN`, `PROFILE#CONTACT`, …).

## The two-channel model

Identity and profile data travel two different paths. The backend derives **who the user is**
(`sub`) from the validated access token — never from the request body. Field *values* ride in the
JSON body.

```
CHANNEL 1 — Identity (Cognito)
  Signup form (name, email, phone, DOB, password)
    → Cognito user pool (stored as standard attributes)
    → on login issues JWTs: ID token (identity claims) + access token (proof of sub)

CHANNEL 2 — Profile data (our API → DynamoDB)
  Profile section forms
    → PUT /api/customer/profile/{section}
        Header: Authorization: Bearer <access token>
        Body:   { the section's field values }
    → Spring Boot validates JWT, extracts sub
    → DynamoDB item: pk = USER#<sub>, sk = PROFILE#<SECTION>
```

## Channel 1 — Cognito

### Attribute mapping (signup form → Cognito standard attributes)
| Form field   | Cognito attribute | Format / notes                    |
|--------------|-------------------|-----------------------------------|
| First name   | `given_name`      |                                   |
| Last name    | `family_name`     |                                   |
| Email        | `email`           | already the username/alias        |
| Mobile phone | `phone_number`    | E.164, e.g. `+919892558621`       |
| Birth date   | `birthdate`       | `YYYY-MM-DD`                      |

### Terraform change (`modules/auth/main.tf`, app client `frontend`)
Standard attributes already exist in the pool schema — only the client's read/write lists must be
widened (no pool recreation):
```hcl
read_attributes  = ["email","email_verified","name","given_name","family_name","phone_number","birthdate"]
write_attributes = ["email","name","given_name","family_name","phone_number","birthdate"]
```
Notes:
- `phone_number` is stored **unverified** (no SMS/phone-verification flow added now).
- These attributes appear in the **ID token** on login, enabling free client-side prefill of
  Main Information + Contact details.

### Signup flow (frontend)
- Replace the single "Full name" field with **First name** and **Last name**, and add **Mobile
  phone** and **Birth date** fields (plus existing email + password).
- Pass them to Cognito `signUp` as `given_name`, `family_name`, `phone_number`, `birthdate`
  attributes (in addition to `email`). Keep sending `name` = "First Last" for backward compatibility.
- Keep the existing email verification-code step.

## Channel 2 — DynamoDB profile

Reuse the existing single table `seamarg-dev-app-data` (same one certificates use). No new table.

### Key design (one item per section)
| Item                | pk            | sk                 |
|---------------------|---------------|--------------------|
| Main information    | `USER#<sub>`  | `PROFILE#MAIN`     |
| Contact details     | `USER#<sub>`  | `PROFILE#CONTACT`  |
| Passport & seaman   | `USER#<sub>`  | `PROFILE#PASSPORT` |
| Address & airport   | `USER#<sub>`  | `PROFILE#ADDRESS`  |
| Languages           | `USER#<sub>`  | `PROFILE#LANGUAGES`|
| Professional skills | `USER#<sub>`  | `PROFILE#SKILLS`   |
| Visas               | `USER#<sub>`  | `PROFILE#VISAS`    |
| Relatives/next of kin | `USER#<sub>`| `PROFILE#RELATIVES`|
| Notes & misc        | `USER#<sub>`  | `PROFILE#MISC`     |
| Sea service (many)  | `USER#<sub>`  | `SEASERVICE#<id>`  |
| Certificates (exist)| `USER#<sub>`  | `CERTIFICATE#<id>` |

Each item stores the section's fields plus `updatedAt` (ISO-8601). No new IAM — the backend runtime
role already has item access to this table.

### Backend API (Spring Boot, `/api/customer/**`, JWT-protected)
- `GET /api/customer/profile` → returns all `PROFILE#*` sections for the signed-in user (map keyed
  by section).
- `PUT /api/customer/profile/{section}` → upsert one section; `{section}` ∈
  `main | contact | passport | address | languages | skills | visas | relatives | misc`.
- `sub` comes from the validated JWT principal (Spring Security), never the body.
- Server-side validation mirrors the required fields (e.g. Main: firstName, lastName, dateOfBirth).
- Shape a small `ProfileController` + `ProfileRepository` modeled on the existing certificate
  controller/repository.

## Frontend integration
- `apiRequest()` already attaches `Authorization: Bearer <access token>` — reuse it.
- Main Information (and later sections): **load** via `GET /api/customer/profile`, **save** via
  `PUT /api/customer/profile/main`. Remove the interim `localStorage` draft persistence.
- **Prefill on first use:** if a section has no server record yet, prefill from the ID token claims
  (`given_name`, `family_name`, `email`, `phone_number`, `birthdate`).
- Keep an honest loading/error/saved state per section.

## Build sequence
1. ✅ **Terraform (code done, 2026-07-04 — needs apply):** widened the `frontend` app-client
   `read_attributes`/`write_attributes` to include `given_name`, `family_name`, `phone_number`,
   `birthdate` in `infra/terraform/modules/auth/main.tf`. `terraform fmt` clean. **Deploy:** run the
   pipeline with `target: infra`, `terraform_apply` checked. (Registry access is blocked in the local
   sandbox, so `terraform validate`/`plan` must run in the pipeline.)
2. ✅ **Backend (done, 2026-07-04 — needs deploy):** new `com.seamarg.backend.profile` package:
   `ProfileController` (`GET /api/customer/profile`, `PUT /api/customer/profile/{section}`),
   `ProfileService` (validation + JSON payloads), `ProfileRepository` with DynamoDB + in-memory
   impls against the existing `seamarg-dev-app-data` table (`sk=PROFILE#<SECTION>`). Added
   `seamarg.app-data.table-name` property and **PUT** to the CORS allowed methods. `./gradlew
   :backend:test` passes (added `ProfileServiceTests` + profile cases in `EndpointSecurityTests`).
   **Deploy:** pipeline `target: backend`.
3. ✅ **Frontend signup (done, 2026-07-05 — needs frontend deploy):** signup form now collects
   First name, Last name, Email, Mobile phone (E.164, client-validated), Birth date, Password.
   `signUpWithCognito` sets `given_name`, `family_name`, `name`, `phone_number`, `birthdate`.
4. ✅ **Frontend Main Information (done, 2026-07-05 — needs frontend deploy):** replaced localStorage
   with `GET /api/customer/profile` (load/prefill) and `PUT /api/customer/profile/main` (save), via
   the existing bearer-token `apiRequest`. Prefills from the loaded section, falling back to ID-token
   claims (`given_name`/`family_name`/`birthdate`). Loading + load-error + saved states handled;
   required-field validation still blocks the API call. Verified in-browser against a stubbed API.
5. ✅ **Frontend Contact details (done, 2026-07-05 — needs frontend deploy):** `GET
   /api/customer/profile` (load) + `PUT /api/customer/profile/contact` (save) via the bearer-token
   `apiRequest`. Fields: Email Address*, Mobile Phone Number 1–4, Home Telephone Number. Prefills
   email from the `email` claim and Mobile Phone 1 from `phone_number`. Backend now enforces CONTACT
   required fields (email, mobilePhone1). Verified in-browser against a stubbed API (single GET on
   load, PUT on save, required-field validation blocks empty submit).
6. ✅ **Frontend Passport and Seaman book (done, 2026-07-05):** `PUT /api/customer/profile/passport`.
   Fields all optional (passport number + issue/expiry dates, seaman book number + issue/expiry
   dates, individual tax number). No claim prefill. Verified in-browser (single GET on load prefills
   the saved section, PUT on save).
7. ✅ **Frontend Address and Airport (done, 2026-07-05):** `PUT /api/customer/profile/address`. Two
   grouped sections (address fields + airport fields, travel times as number inputs), all optional.
   Introduced a `.portal-form-section` brass heading style for grouped forms. Verified in-browser.
8. ✅ **Frontend Languages (done, 2026-07-05):** `PUT /api/customer/profile/languages`. Fixed
   language list, each a proficiency dropdown; stored as `{ languageSlug: level }`. Verified
   in-browser.
9. ✅ **Frontend Professional skills (done, 2026-07-05):** `PUT /api/customer/profile/skills`.
   Yes/no checkbox list stored as `{ skillSlug: boolean }`. Verified in-browser.
10. ✅ **Frontend Visas (done, 2026-07-05):** `PUT /api/customer/profile/visas`. Per-visa held flag +
    expiry date stored flat (`{slug}Held`/`{slug}Expiry`) plus `otherVisas` free text. Verified
    in-browser.
11. ✅ **Frontend Relatives and next of kin (done, 2026-07-05):** `PUT
    /api/customer/profile/relatives`. Two grouped sections (relatives + next of kin), Marital Status
    as a dropdown, rest text/number/date/tel, all optional. Verified in-browser.
12. ✅ **Frontend Notes and miscellaneous (done, 2026-07-05):** `PUT /api/customer/profile/misc`
    (route `#/profile/notes`). Text/number fields, four dropdowns (religion/hair/eye/blood), and a
    Notes textarea, all optional. Added `portalTextareaControl`. Verified in-browser. **All Step-1
    profile sections are now built.**
13. Next: certificates + sea service (Steps 2–3).

### Endpoint contract (as built)
- `GET /api/customer/profile` → `{ "<section-slug>": { …fields }, … }` (only saved sections).
- `PUT /api/customer/profile/{section}` — body is the section's JSON object; returns the saved
  fields. `{section}` ∈ `main|contact|passport|address|languages|skills|visas|relatives|misc`.
  Unknown section or a missing required field (Main: firstName/lastName/dateOfBirth) → `400`.
  Identity (`sub`) always comes from the JWT, never the body.

## Open considerations (not blocking)
- Whether editing name/phone in the profile should also update the Cognito attributes (kept out of
  scope for now — DynamoDB is authoritative post-signup).
- Phone verification (SMS) — deferred.
- GDPR delete: a future endpoint to purge `USER#<sub>` items + Cognito user.
- Local dev needs the backend running (`http://localhost:8080`) and valid Cognito env values to
  exercise the real API; otherwise the profile API calls will fail with a clear error state.
