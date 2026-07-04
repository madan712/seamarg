# SeaMarg Private Portal Redesign — Functional PRD

Status: Draft for review (functional requirements only — technical implementation deferred)
Owner: Product/Engineering
Last updated: 2026-07-04
Primary source: "Alpha Crew" reference screenshots (24 screens) provided by product owner
Related docs: `docs/frontend-prd.md`, `docs/project-context.md`

### Product decisions locked (2026-07-04)
- **Replace completely**: this profile-builder replaces the entire current private area
  (blank Dashboard/Profile shells, Ask SeaMarg AI, Career Path, Advice History, and the
  certificate upload POC). None of those survive.
- **No "Send to crewing officer" step**: the 4th step and its confirmation screen are dropped.
  The private area becomes a **persistent, always-editable seafarer profile** (3 steps).
- **User can edit** any section at any time; there is no one-time lock/submit.
- **Source data lists**: use reasonable **dummy option lists** now; real reference data loads later.
- **File uploads**: certificate/document **file uploads are in scope** — **one file per entry**,
  either a **PDF or an image**; **AI extracts metadata** from the uploaded file (reusing the
  extraction concept from the old POC).
- **Post-login landing page**: land on **Step 1 → Guide / Main information**.
- **Log out**: exposed as a **menu item** (additional account links may be added later).

---

## 1. Purpose and Scope

This document defines the **functional requirements** for a full redesign of the SeaMarg
**private (post-login) area**. The current private area is a placeholder: blank Dashboard/Profile
shells plus a single **certificate upload POC** (S3 + DynamoDB proof-of-concept). The POC is
**explicitly out of scope** and will be replaced.

The redesign models the private area as a **persistent, editable seafarer digital profile builder**,
based on the Alpha Crew reference flow. The seafarer fills and maintains a structured profile
(personal data, certificates, sea service history) that can be edited at any time. There is no
one-time application submission step.

This PRD covers **what** each page must do and **which data** it captures. It does **not** cover
technical implementation (data model, APIs, framework, storage). Those will be decided later,
page by page.

### In scope
- The 3-step private-area flow (Your profile, Certificates, Sea service records) and every sub-page.
- All fields, controls, and page-level behaviors visible in the screenshots.
- Navigation model (top stepper + left submenu) and a persistent account/logout affordance.
- Cross-cutting UI patterns (save-per-section, accordions, banners, progress).
- Certificate/document **file upload** per entry.

### Out of scope (this document)
- The existing certificate upload POC — removed and replaced by the new Certificates step.
- The existing AI-guidance private concept (Dashboard, Ask SeaMarg AI, Career Path, Advice
  History) — **fully replaced** by this profile builder.
- The Alpha Crew **"Send to crewing officer"** step and its confirmation screen — **dropped**.
- Public marketing pages (Home, About, FAQ, Contact, Support) — unchanged.
- The pre-login `CreateProfile` basic-details form — treated as public onboarding; it only feeds
  prefilled values (name, email, phone, DOB) into the profile.
- Cognito authentication flow — unchanged; user is already logged in when this flow begins.
- Backend data model, API contracts, storage, AI extraction, notifications.

---

## 2. High-Level Structure

The private area is a **3-step layout** presented as a persistent horizontal progress bar
(chevron/stepper) across the top. The brand name links to the site at the very top, and a
persistent **account / log out** affordance is available (the Alpha Crew reference exposed logout
only on the dropped confirmation screen — SeaMarg needs it always reachable).

| # | Step (top nav) | Purpose |
|---|----------------|---------|
| 1 | **Your profile** | Personal, contact, document, and preference data |
| 2 | **Certificates** | All maritime certificates and documents held |
| 3 | **Sea service records** | Contract / sea-time history |

Each step has a **left vertical submenu** listing that step's sub-pages. Steps are navigable in any
order (the stepper is clickable); the profile is filled and edited section by section rather than
strictly linearly. All data persists per-section and remains editable — there is no final
submission step or terminal confirmation screen.

---

## 3. Cross-Cutting UI Requirements

These behaviors apply across the private area.

- **Top stepper**: Always visible; shows the 4 steps with the active step highlighted and an icon
  per step. Clicking a step navigates to it.
- **Left submenu**: Within a step, lists sub-pages; active sub-page highlighted. The first item in
  steps 1 and 2 is always a "Guide" (help/instructions) page.
- **Welcome banner (Step 1)**: A dismissible (×) informational banner greeting the user by first
  name, confirming a profile was created, and advising to keep data accurate/up to date.
- **Save per section**: Each editable sub-page has its own **Save** button; data is saved section
  by section, not as one giant form.
- **Required-field markers**: Required fields are marked with a red asterisk (`*`).
- **Accordion pattern (certificates)**: Certificate categories are long lists of collapsible
  entries with top-right **"Expand filled"** and **"Collapse all"** controls.
- **Empty / prefilled states**: Fields known from signup (name, email, phone, DOB) are prefilled.
- **Responsive**: Must work on mobile and desktop; forms remain legible and usable at both widths.
- **Guidance tone**: Professional, maritime-aware, calm. Guide pages end with "If you need
  assistance, please contact your assigned crewing officer."

---

## 4. Step 1 — Your Profile

Left submenu (10 items):

1. Guide to filling your profile
2. Main information
3. Contact details
4. Passport and Seaman book
5. Address and Airport
6. Languages
7. Professional skills
8. Visas
9. Relatives and next of kin
10. Notes and miscellaneous

### 4.1 Guide to filling your profile
Informational page only (no inputs). Explains that this section holds personal data used by the
crewing team for candidacy review, joining formalities, flight bookings, and contract prep.
Includes best-practice bullets (use passport-exact Latin names, fill every section, click Save per
section, keep validity dates current).

### 4.2 Main information
Fields:
- First name *
- Middle name
- Last name *
- Sex (male/female) — dropdown
- Position — dropdown
- Alternate Position 1 — dropdown
- Alternate Position 2 — dropdown
- Alternate Position 3 — dropdown
- Alternate Position 4 — dropdown
- I want to work in Offshore (Oil/Gas) Industry — checkbox
- Date of readiness — date
- Minimum salary you can agree on (USD) — number
- Citizenship — dropdown
- Place of Birth — text
- Date of Birth * — date
- Highest education — dropdown (education levels, e.g. High school / Diploma / Bachelor's / Master's)
- Year you have graduated — text/number
- Graduated from — text
- Educational level — text
- Save

Note: `Position` / `Alternate Position` / `Citizenship` require authoritative option lists
(see Open Questions §9).

### 4.3 Contact details
Fields:
- Email Address *
- Mobile Phone Number 1 *
- Mobile Phone Number 2
- Mobile Phone Number 3
- Mobile Phone Number 4
- Home Telephone Number
- Save

### 4.4 Passport and Seaman book
Fields:
- International Passport Number
- International Passport Issue Date — date
- Passport expiry date — date
- Seaman Book Number
- Seaman Book Issue Date — date
- Seaman Book Expiry Date — date
- Individual Tax Number
- Save

### 4.5 Address and Airport
Address:
- Country, Province, City, Post Code, Street, House Number, Apartment Number
Airport:
- Main Airport Name
- Travel time to main airport (hours)
- Alternative Airport Name
- Travel time to alternative airport (hours)
- Save

### 4.6 Languages
A fixed list of languages, each with a proficiency **"Select Level"** dropdown:
- English, German, Spanish, Dutch (reference set — final language list TBD)
- Save

### 4.7 Professional skills
Checkbox list (yes/no per skill):
- AH experience
- ROV experience
- RIG-move experience
- Azimuth ASD experience
- Towing experience
- Boat handling experience
- Save

### 4.8 Visas
Per visa: a checkbox (held?) plus an **Expiry date** field:
- Brazil visa, Schengen visa, USA visa, Canadian visa, KSA visa, UAE visa, UK visa
- Other visas — free text ("List other visas you have")
- Save

### 4.9 Relatives and next of kin
Relatives:
- Marital Status
- Date of marriage — date
- Number of children
- Number of sons
- Number of daughters
- Father's FULL NAME
- Mother's FULL NAME
Next of Kin:
- Next of Kin First Name
- Next of Kin Middle Name
- Next of Kin Surname
- Next of Kin Address
- Next of Kin Relation Degree
- Next of kin contact phone
- Emergency Contact Name
- Save

### 4.10 Notes and miscellaneous
Fields:
- Working Coverall Size
- Body Weight (kg)
- Body Height (cm)
- Working Shoe Size
- Religion — dropdown
- Hair color — dropdown
- Eye color — dropdown
- Blood type — dropdown
- Notes — textarea ("Any information you want to indicate")
- Save

---

## 5. Step 2 — Certificates

Left submenu (8 items):

1. Guide to entering certificates
2. Main documents
3. General certificates
4. National Certificates Of Competency
5. Medical Certificates
6. Tanker/Passenger certificates
7. Offshore certificates
8. Flag State Documents

### 5.1 Guide to entering certificates
Informational page. Explains that more valid certificates = stronger profile, lists all categories,
and describes two entry patterns: (a) the Main Documents checkbox list, and (b) the detailed
certificate accordions. Notes: expired certificates are rejected; Expand filled / Expand all
controls help manage visibility.

### 5.2 Main documents
A **checkbox grid** of predefined "main documents" (held / not held). Reference items include:
COVID-19 fully vaccinated, ARAMCO approval, BOSIET (NOGEPA), BOSIET (OPITO), DP Advanced Course,
DP Induction Course, DP Limited Course, DP Maintenance Course, DP Unlimited Course, FOET,
High voltage, HUET (NOGEPA), HUET (OPITO), Sparrow Stage 1 Certificate, Sparrow Stage 2 Certificate,
Sparrow Stage 3 Certificate, TBOSIET.
- Save

### 5.3–5.8 Detailed certificate categories
General certificates, National Certificates Of Competency, Medical Certificates,
Tanker/Passenger certificates, Offshore certificates, and Flag State Documents share the **same
pattern**:

- Each category is a **catalog of predefined certificate types**, rendered as an accordion list.
- Each entry expands to a detail form and has its own **Save**.
- Common entry fields:
  - Number — certificate number (optional; not all documents have one)
  - Issued Date *
  - Expiry Date (optional; some certificates are permanent; expired dates rejected)
  - Issue Place *
  - Issuing Authority *
- **Category-specific extra fields:**
  - National Certificates Of Competency: **COC grade *** (dropdown)
  - Medical Certificates: **Clinic Name** (per the guide, for medical/drug/alcohol certificates)
- **File upload**: each certificate entry supports attaching **one** scanned document file
  (**PDF or image**). **AI extracts metadata** from the file to help populate the entry fields.
  (Extends the Alpha Crew reference, which captured metadata only.)
- Top-right controls: **Expand filled**, **Collapse all**.

Note: The **full authoritative catalogs** of certificate types per category use **dummy
placeholder lists** for now; real reference data loads later. The Main Documents checklist
(§5.2) also uses dummy items initially.

---

## 6. Step 3 — Sea Service Records

Left area contains:
- Checkbox: **"I have no sea service records (experience)"** with helper text (check if no experience).
- Button: **"+ Add sea service record"**.
- Submenu: **"Guide to filling out sea service"** (info page), followed by each saved record
  (e.g., "New sea service record").

### 6.1 Guide to filling out sea service
Informational page. Key rules: entries must reflect actual documented experience (Seaman's Book,
Sea Service Book, IMCA Logbook); **at least the last 7 years** required; records can be added in any
order and are **auto-sorted chronologically** after saving.

### 6.2 Sea service record form
Multiple records supported; each record has four sections:

1. **Contract Information**
   - Vessel Name *
   - Rank * (dropdown)
   - Vessel Type * (dropdown)
   - IMO Number
   - Sign On Date *
   - Sign Off Date *
   - Tentative Sign Off
   - Salary (USD/day)
2. **Vessel & Operation Details**
   - GRT, BHP, Engine Type, Engine Model, Vessel Construction, DP Class (0/1/2/3), ROV Model,
     Flag, Operation, Area of Operation
3. **Employer and Contact Details**
   - Company Name, Contact Person, Contact Phone, Contact Email
4. **Additional Information**
   - Any remarks or relevant info (optional)
- Save (per record)

Records must be individually editable and (implied) removable. `Rank` and `Vessel Type` require
authoritative option lists.

---

## 7. Validation & Behavior Notes (functional)

- Required fields (`*`) block section save when empty; show inline errors.
- Date fields: expiry dates in the past should be rejected for certificates.
- Email/phone fields validated for format.
- Each Save gives clear success/error feedback and persists that section independently.
- **All sections remain editable at any time** — the profile is never locked; there is no
  submission step.
- "I have no sea service records" and having records are mutually exclusive.
- Certificate file uploads: accepted file types/size limits TBD at build time; each entry may hold
  one or more attached files that can be viewed/replaced/removed.

---

## 8. Open Questions (remaining)

Resolved on 2026-07-04: replace-completely; no submit step; editable profile; dummy option lists;
file uploads in scope (one PDF/image per entry, AI metadata extraction); post-login landing on
Step 1 Guide/Main information; log out as a menu item; **consent/T&C dropped entirely** (it only
lived on the dropped "Send to crewing officer" page); **"Highest education" is a dropdown**.

Still open (non-blocking, finalize at build time):

1. **Certificate upload limits**: max file size, and any accepted-format nuance beyond "PDF or
   image".
2. **Branding**: Confirm logo/brand treatment ("SeaMarg") and whether the green welcome banner
   copy should be adapted from the Alpha Crew wording.

---

## 9. Suggested Build Order (for later discussion)

A pragmatic page-by-page sequence once the PRD is approved:

1. ✅ **Shell (done, 2026-07-04)**: top stepper (3 steps) + left submenu navigation + dismissible
   welcome banner + account/log-out menu. Post-login lands on `/profile/guide`. The old private
   area (Dashboard/AI/Career) and the certificate POC were removed. All sub-pages currently render
   a "coming soon" placeholder. Build + typecheck pass.
2. Step 1 sub-pages (Main information → … → Notes and miscellaneous).
   - ✅ **Main information (done, 2026-07-04; API-wired 2026-07-05)**: full form per §4.2 with dummy
     dropdowns (sex, position/alternate positions, citizenship, highest education), required-field
     validation (First name, Last name, Date of Birth), and save-per-section. Now persists to
     **DynamoDB via the backend profile API** (`GET`/`PUT /api/customer/profile`), prefilling from
     the saved section or Cognito ID-token claims (`given_name`/`family_name`/`birthdate`). Signup
     now captures first/last name, mobile phone, and birth date into Cognito. **"Highest education"
     is a dropdown**. See `docs/profile-data-design.md`.
3. Step 2 Main documents, then the detailed certificate accordions (with file upload).
4. Step 3 Sea service records (add/edit/list).

Each page will get its own mini technical spec (fields → data model → API) at build time.

### Shell implementation notes
- Single-file vanilla TS SPA (`frontend/src/main.ts`) with hash routing; portal IA lives in the
  `privateSteps` structure. Sub-page slugs: e.g. `#/profile/main-information`,
  `#/certificates/general`, `#/sea-service/guide`. A bare step path redirects to its first sub-page.
- Styling appended to `frontend/src/styles.css` (dark navy + brass theme — Alpha Crew's *structure*,
  not its colors).
- `frontend/vite.config.ts` now honors the `PORT` env var (falls back to 5173) so preview/dev
  tooling can bind an assigned port.
