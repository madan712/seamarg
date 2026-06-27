# SeaMarg Frontend PRD

Status: Living draft for product review and implementation tracking
Owner: Product/Engineering  
Last updated: 2026-06-27
Primary sources: `SEA MARG.doc`, `SEA MARG DEV.doc`, `SEA MARG.doc.pptx`

## 1. Product Summary

SeaMarg is an AI-powered career, compliance, and opportunity platform for seafarers. The client positioning is:

> SeaMarg - Navigate Your Maritime Career

SeaMarg should help seafarers move from confusion to clarity by giving practical guidance on certificates, DG Shipping and STCW compliance, career progression, verified opportunities, and scam risk. It is not a manning agent, not a certification authority, and not a replacement for DG Shipping, flag-state, company, or MMD decisions.

This PRD defines the first professional web frontend for the existing repository. The web MVP should present SeaMarg credibly, allow users to log in using Cognito, provide public trust and support pages, and introduce a protected seafarer portal experience that can grow into the larger AI guidance platform described in the client documents.

## 2. Source Material Summary

The client documents describe SeaMarg as:

- An AI-powered advisory platform for seafarers.
- India-first, with DG Shipping awareness, but designed for global expansion.
- A practical maritime guide delivered through app, web, and WhatsApp.
- A trust-first platform that helps users avoid fake jobs, unofficial agent advice, and compliance mistakes.
- A free safety and compliance guidance product with paid personalization for deeper career planning.

Major client-specified capabilities:

- Seafarer profiles with rank, vessel experience, certificates, sea time, nationality, trading area, and career goals.
- Certificate and compliance tracking for CoC, STCW, CDC, passport, medical, DP, flag endorsements, and expiry dates.
- AI maritime assistant trained or prompted around STCW, IMO, DG Shipping India, offshore/merchant operations, career progression, and industry best practices.
- Rule confidence scoring for AI answers.
- DG Shipping-safe advisory model with disclaimers, human rule review, audit logs, and prompt governance.
- Career roadmap and course recommendations.
- Verified companies, agents, institutes, and future job matching.
- Scam and agent risk alerts.
- WhatsApp-first access for India users.
- Free vs paid product model, where safety and compliance are never paywalled.

## 3. Problem Statement

Seafarers face a serious information gap.

Key pain points from the client documents:

- Maritime rules are complex across DG Shipping, STCW, flag states, company policies, and MMD practices.
- Rules and circulars change, but information is scattered across government portals and informal channels.
- Government websites are not user-friendly for practical decision-making.
- WhatsApp groups and unofficial agent advice spread inconsistent or risky guidance.
- Generic AI tools are not maritime-aware and can give unsafe or overconfident answers.
- Seafarers lose contracts due to simple compliance mistakes, expiring certificates, or last-minute sign-on rejection.
- Indian seafarers especially face confusion around DG Shipping revalidation, refresher rules, MMD processes, INDoS, CDC, and company vs flag-state requirements.
- Fake job offers and agents asking for money create financial and career risk.

## 4. Product Goals

- Establish SeaMarg as a trusted digital maritime guide for seafarers.
- Explain SeaMarg's advisory-only role clearly and safely.
- Provide a professional public website that earns trust with seafarers, companies, institutes, and advisors.
- Allow users to sign in/sign up using Cognito in the current web MVP.
- Provide a protected seafarer dashboard shell that can evolve into profile, certificate, AI guidance, and career modules.
- Provide Contact, Support, About, and Help/FAQ pages as first-class pages, not placeholders.
- Make compliance, safety, and scam awareness visible in the product experience.
- Prepare the frontend architecture for later backend APIs, AI workflows, n8n, WhatsApp, and paid plans.

## 5. Non-Goals for the First Frontend Release

- Do not build a custom username/password or mobile OTP auth system in the first web release unless Cognito scope changes.
- Do not build a full manning/recruitment marketplace yet.
- Do not claim that SeaMarg provides official DG Shipping rulings, job placements, or certificate approvals.
- Do not build admin DG rule management in the public frontend.
- Do not build WhatsApp integration in the frontend MVP.
- Do not accept payments until subscription requirements and payment provider are approved.
- Do not store or display sensitive tokens, admin passwords, or raw private documents in the browser.

## 6. Target Users

### Seafarers

Primary users. Includes officers, engineers, ratings, freshers, experienced crew, maritime students, returning/rejoining seafarers, and Indian seafarers dealing with DG Shipping requirements.

Primary needs:

- Understand whether they are ready to join a vessel.
- Track certificate and document expiry.
- Get clear next steps for compliance.
- Plan promotion and training.
- Avoid fake agents and job scams.
- Save or revisit advice.

### Shipping Companies and Manning Agents

Future B2B users. Includes crew managers, HR teams, licensed manning agents, ship owners, managers, and operators.

Primary needs:

- Post verified jobs.
- Find compliant candidates.
- Reduce manual screening.
- Avoid document and compliance risk.

### Training Institutes and Medical Centres

Future ecosystem users.

Primary needs:

- List approved courses or services.
- Receive qualified leads from seafarers who need training, refresher courses, or medicals.

### Admin and Compliance Reviewers

Internal future users.

Primary needs:

- Verify companies/institutes.
- Moderate reports and reviews.
- Review AI guidance quality.
- Maintain DG Shipping rule prompt metadata and audit logs.

## 7. MVP Scope for This Repository

The current repo contains:

- Static Vite/TypeScript frontend.
- Spring Boot backend with public, customer, and admin test endpoints.
- Terraform-managed Cognito User Pool and frontend app client for customer authentication.
- S3/CloudFront frontend hosting.

The first frontend implementation should focus on a web MVP:

- Public SeaMarg marketing and trust pages.
- Embedded Cognito login/logout, sign-up, email verification, and password reset.
- Protected seafarer dashboard shell.
- Static or API-ready UI for profile, certificate, AI guidance, and support.
- Clear empty states where product APIs are not yet built.

The client documents discuss mobile apps, OTP login, n8n, WhatsApp, PostgreSQL, AI workflows, and multiple backend APIs. Those are product direction and should be captured as future phases unless the backend scope is expanded.

### 7.1 Implementation Tracker

This PRD should be kept current as features are implemented. When a new feature is built and it is not already captured here, update the relevant requirements, acceptance criteria, release phase, and this tracker before closing the session.

Last implementation update: 2026-06-27

Implemented in the current frontend:

- Public routes: Home, About, Help/FAQ, Contact, and Support.
- Professional public layout, navigation, responsive styling, and footer.
- Embedded Cognito User Pool forms for sign in, account creation, email verification code entry, resend verification code, forgot password, and reset password.
- Protected routes for Dashboard, Profile, Certificates, Ask SeaMarg AI, Career Path, and Account.
- Successful login redirects to Dashboard.
- Dashboard and Profile are intentionally blank/private shells for now.
- Certificates route has an authenticated upload form, API-backed certificate table, expiry/status indicators, and protected view/download flow through backend-generated short-lived document URLs.
- Local frontend environment template and dev environment support for Cognito user pool ID, app client ID, and API base URL.
- Dev deployment workflow injects Cognito frontend values and the CloudFront same-origin API base URL from Terraform outputs during the frontend build.
- Deployed certificate API calls use the frontend CloudFront `/api/*` proxy, avoiding HTTPS-to-HTTP mixed-content blocking in the browser.

Remaining or deferred:

- Real dashboard content and backend-driven profile completion.
- Profile, AI guidance, career path, advice history, support, and contact backend APIs.
- Certificate missing-document checklist, reminders/notifications, retention controls, and malware scanning.
- Real support/contact submission channel.
- Direct backend HTTPS/custom-domain API endpoint and production CORS strategy; current dev deployment uses CloudFront same-origin `/api/*` proxying.
- WhatsApp, mobile OTP, n8n workflows, payments, company/institute portals, and admin governance tools.

## 8. Branding and Messaging

Use the spelling `SeaMarg` in product copy unless product owner directs otherwise.

Brand meaning:

- Sea: maritime and seafarers.
- Marg: path, guidance, direction.
- SeaMarg: the path for seafarers.

Recommended tagline:

- Navigate Your Maritime Career

Positioning statement:

- SeaMarg is an AI-powered career, compliance, and opportunity platform for seafarers.

Approved positioning boundaries:

- SeaMarg is a digital maritime guide.
- SeaMarg is not a manning agent.
- SeaMarg is not a certification authority.
- SeaMarg does not guarantee job placement, sign-on approval, DG Shipping decisions, company acceptance, or flag-state acceptance.
- SeaMarg provides advisory guidance only.

## 9. Information Architecture

### Public Navigation

- Home
- About
- Help/FAQ
- Contact
- Support
- Sign in

Optional later public nav:

- Features
- Pricing
- For Companies
- For Institutes

### Authenticated Seafarer Navigation

- Dashboard
- Profile
- Certificates
- Ask SeaMarg AI
- Career Path
- Advice History
- Support
- Account
- Sign out

For the first implementation, some authenticated sections may be disabled, static, or marked as coming soon if backend APIs do not exist.

### Future Role-Based Navigation

- Company dashboard.
- Institute dashboard.
- Admin dashboard.
- DG rule governance console.

## 10. Public Page Requirements

### 10.1 Home

Purpose: Establish SeaMarg as a trusted seafarer guidance platform and route users to sign in, learn, or ask for help.

Required content:

- Brand hero with `SeaMarg` and `Navigate Your Maritime Career`.
- Clear value proposition: AI-powered maritime career and compliance guidance for seafarers.
- Problem section: scattered rules, DG Shipping/STCW complexity, fake jobs, certificate expiry risk, last-minute rejection.
- Solution section: AI maritime guide, profile-aware answers, compliance checks, confidence scoring, career roadmap, scam alerts.
- Free vs paid ethics message: safety and basic compliance guidance should not be paywalled.
- Trust disclaimer: advisory only, not a manning agent, not a certification authority.
- Primary CTA: Sign in / Get started.
- Secondary CTA: Explore FAQ or Contact us.

Acceptance criteria:

- Page communicates SeaMarg's actual client-defined purpose within the first viewport.
- No fake metrics, fake clients, unsupported certifications, or invented partnerships.
- CTA starts Cognito login or routes to a sign-in page that starts Cognito.
- Works on mobile and desktop.

### 10.2 About Us

Purpose: Explain SeaMarg's mission and trust model.

Required content:

- Mission: help seafarers move from confusion to clarity, dependency to confidence, and risk to readiness.
- India-first and global-ready positioning.
- Explanation of the Sea + Marg brand meaning.
- Core pillars: Guidance, Compliance, Opportunities, Trust.
- Statement that SeaMarg is not a manning agent and does not charge for jobs.
- Contact/support CTA.

Acceptance criteria:

- Tone is professional and maritime-aware.
- Claims remain advisory and defensible.

### 10.3 Help/FAQ

Purpose: Give practical answers before users need support.

Required FAQ categories:

- Account and login.
- SeaMarg AI.
- DG Shipping and compliance guidance.
- Certificates and document expiry.
- Jobs, agents, and scam safety.
- Free vs paid features.
- Privacy and data.

Example FAQ topics:

- What is SeaMarg?
- Is SeaMarg a manning agent?
- Can SeaMarg guarantee that I can join a vessel?
- Can SeaMarg replace DG Shipping or MMD advice?
- What is rule confidence scoring?
- What information do I need to get personalized guidance?
- Does SeaMarg charge for jobs?
- Can I use SeaMarg on WhatsApp?
- What should I do if an agent asks for money?

Acceptance criteria:

- FAQs are searchable or filterable in the frontend.
- Anonymous users can access FAQs.
- FAQ copy includes disclaimers without sounding defensive.

### 10.4 Contact

Purpose: General business and partnership contact.

Required fields:

- Name.
- Email.
- Role: Seafarer, Company, Institute, Advisor, Other.
- Topic.
- Message.

Required states:

- Client-side validation.
- Loading state.
- Success/confirmation state.
- Error state.

Acceptance criteria:

- If no backend endpoint exists, the form must not pretend to submit permanently.
- Product must decide between frontend-only placeholder, `mailto:`, backend endpoint, Lambda endpoint, or third-party form service.

### 10.5 Support

Purpose: Let seafarers ask for help with account, compliance, safety, or product issues.

Required fields:

- Name.
- Email or mobile.
- User role.
- Support category: Account, Certificate/Compliance, AI answer concern, Scam/Agent report, Job/Company concern, Other.
- Priority.
- Subject.
- Description.
- Optional upload placeholder for future evidence/certificates, disabled until backend storage is approved.

Acceptance criteria:

- Anonymous users can open support.
- Signed-in users should have known profile details prefilled when available.
- Scam/agent report path must be visible and trust-focused.
- If there is no support API, submission behavior must be explicit and product-approved.

## 11. Authenticated Seafarer Portal Requirements

### 11.1 Cognito Authentication

User request for this repo: use Cognito for frontend login.

Required behavior:

- Sign in through the embedded Cognito User Pool form.
- Create a new account through the embedded Cognito sign-up form.
- Send Cognito email verification for new users.
- Allow users to enter the verification code and confirm their email.
- Allow users to request and enter a password reset code.
- Use the Cognito frontend app client with SRP-based username/password authentication.
- Store session safely for SPA constraints.
- Redirect successful sign-in to Dashboard.
- Support logout by clearing the local SPA session.
- Redirect unauthenticated users away from protected pages.
- Handle missing config, failed sign-in, unverified email, expired/incorrect codes, and failed reset flows.

Required configuration:

- `VITE_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_CLIENT_ID`
- `VITE_API_BASE_URL`; for dev deployment this is injected from Terraform output `frontend_api_base_url`, and for local development it should point at `http://localhost:8080`.

Product note:

- Client docs mention mobile OTP and WhatsApp onboarding. That should be treated as a future auth/onboarding track unless the product owner decides to replace or extend the current Cognito form flow.

### 11.2 Dashboard

Purpose: First protected landing page after login.

Required content for MVP:

- Current agreed MVP behavior: keep the post-login Dashboard blank for now.
- Dashboard is the landing page after successful login.
- Dashboard must remain protected by the auth guard.
- Future content should be added only when product direction and backend APIs are approved.

Future content:

- Welcome message using Cognito profile/email where available.
- SeaMarg advisory disclaimer.
- Profile completion card.
- Certificate readiness card.
- Ask SeaMarg AI card.
- Career path card.
- Support/scam report CTA.
- API connectivity check to `/api/customer/hello` while product APIs are pending.
- Profile strength score.
- Expiring document alerts.
- Recent AI advice.
- Rule confidence summary.
- Subscription status.
- Job eligibility alerts.

Acceptance criteria:

- Protected by auth guard.
- Shows useful empty states when backend data does not exist.
- Does not display access tokens or sensitive auth internals.

### 11.3 Profile

Purpose: Capture the seafarer context needed for AI guidance.

Client-specified profile fields:

- Rank.
- Department: deck, engine, rating.
- Nationality.
- Date of birth.
- Passport number.
- CDC number.
- INDoS number.
- Total sea time in months.
- Primary vessel type.
- Secondary vessel types.
- Current location.
- Trading area experience.
- Career goal.
- Availability date.
- Expected salary range.

MVP behavior:

- If backend profile APIs are not available, provide an API-ready static form or disabled preview.
- Avoid saving data locally unless explicitly approved.

### 11.4 Certificates

Purpose: Help users track compliance readiness.

Client-specified certificate/document types:

- CoC.
- STCW.
- DP.
- Flag endorsements.
- Passport.
- CDC.
- Medical.
- Other documents.

Required UI concepts:

- Certificate list.
- Expiry status: valid, expiring, expired.
- 90/60/30 day reminder concept.
- Missing document warning.
- Upload area for certificate/document files.
- AI extraction results for document name, rank, expiry date, issuer, certificate number, and review confidence when available.
- Protected view/download action for uploaded documents.

Acceptance criteria:

- Certificates page loads records from protected customer APIs and shows an honest empty or error state.
- Uploads are sent to the backend only after Cognito login.
- Uploaded files are stored privately in S3 and metadata is stored in the generic backend DynamoDB table.
- The frontend never stores raw documents locally and opens documents only through backend-generated short-lived URLs.
- Malware scanning, retention policy, and reminder delivery remain deferred production hardening items.

### 11.5 Ask SeaMarg AI

Purpose: Provide a web entry point for profile-aware maritime guidance.

Required AI response format from client docs:

- Direct Answer.
- Reason / Regulation.
- Recommended Next Steps.
- Important Notes.
- Rule Confidence score where applicable.
- Advisory disclaimer when needed.

Required user question categories:

- Certificate validity and expiry.
- Job eligibility.
- Career and promotion path.
- Training/course recommendations.
- DG Shipping/STCW explanation.
- DP/offshore guidance.
- Interview preparation.
- Salary benchmark as indicative range.
- Scam/agent risk check.

MVP behavior:

- If `/api/v1/ai/query` does not exist, page should be a product preview or disabled state, not fake AI.
- When implemented, API response should include answer, confidence score, confidence level, next steps, and disclaimer.

### 11.6 Career Path

Purpose: Show the paid/premium direction for personalized career planning.

Required concepts:

- Current rank assessment.
- Next logical rank.
- Required sea time.
- Mandatory courses and exams.
- Estimated timeline.
- Practical next steps.

MVP behavior:

- Coming-soon or preview state is acceptable until backend AI workflow exists.
- Copy should identify this as a future premium/personalized feature.

### 11.7 Advice History

Purpose: Let users revisit AI guidance and compliance checks.

Required concepts:

- Previous questions.
- Confidence score.
- Created date.
- Channel: web, app, WhatsApp.

MVP behavior:

- Empty state until `GET /api/v1/ai/history` exists.

### 11.8 Account

Purpose: Show basic signed-in state and session actions.

Required content:

- Email.
- Cognito subject/user ID.
- Sign-in status.
- Sign out.
- Link to support.

Acceptance criteria:

- Do not display tokens.
- Do not allow profile edits here unless profile APIs exist.

## 12. Future Company, Institute, and Admin Portals

These are not required for the first public frontend, but the architecture and PRD should anticipate them.

### Company Portal

Future capabilities:

- Company registration.
- Admin verification.
- Job posting.
- AI candidate matching.
- Candidate comparison.
- Application status.
- Contact through portal or WhatsApp.

### Institute Portal

Future capabilities:

- Institute profile.
- Course listings.
- DG-approved status.
- Course calendars.
- Leads from seafarer course recommendations.

### Admin Portal

Future capabilities:

- User approvals.
- Company and institute verification.
- Scam/fraud report moderation.
- AI answer review.
- DG rule metadata and prompt governance.
- Audit logs.
- Rule confidence tuning.

Admin portal must be separately scoped because current `/api/admin/**` uses a static password header and is not appropriate for a broad browser admin experience without further security design.

## 13. AI and Rule Confidence Requirements

Client documents define rule confidence as a core differentiator.

Confidence scale:

- 90-100: High Confidence - clear DG Shipping practice or stable rule.
- 70-89: Medium Confidence - rule exists but company/flag may vary.
- 50-69: Low Confidence - depends on circulars or MMD discretion.
- Below 50: Advisory Only - verification strongly recommended.

Scoring inputs:

- Rule stability.
- Company or flag variance.
- User data completeness.
- Circular change risk.

Frontend requirements:

- Display confidence score and label where AI response includes it.
- Use calm status colors and readable labels.
- Pair low confidence with a clear verification recommendation.
- Never use confidence score to imply official approval.

## 14. DG Shipping Safety Requirements

For India users or DG-related questions, AI and UI copy must:

- Prioritize DG Shipping context when nationality is Indian or INDoS is present.
- Avoid quoting circular numbers unless source certainty exists.
- Explain that rules may change via circulars.
- Distinguish DG Shipping requirements from company and flag-state requirements.
- Recommend MMD/company verification when the answer may vary.
- Include advisory disclaimers when needed.

Standard disclaimer:

SeaMarg provides advisory guidance only. Final acceptance depends on DG Shipping, MMD, company policy, and flag-state requirements.

## 15. Free vs Paid Product Model

Client direction:

- Free: safety and compliance guidance, scam warnings, basic eligibility checks.
- Paid: personalized career roadmap, promotion timelines, document readiness planning, deeper risk analysis, AI-generated CV/interview preparation.
- Safety should never be paywalled.
- Avoid charging freshers heavily at the start.
- Do not charge upfront fees for jobs.

Frontend MVP:

- Communicate ethical free vs paid positioning.
- Avoid showing live pricing until product owner approves pricing.
- Career Path page can indicate premium direction without payment flow.

## 16. Technical/API Dependencies

The DEV document proposes these future API groups:

- `POST /api/v1/auth/send-otp`
- `POST /api/v1/auth/verify-otp`
- `POST /api/v1/user/profile`
- `GET /api/v1/user/profile`
- `POST /api/v1/ai/query`
- `GET /api/v1/ai/history`
- `GET /api/v1/subscription/status`
- `POST /api/v1/subscription/upgrade`
- `POST /api/v1/admin/dg-rules`
- `POST /api/v1/whatsapp/incoming`

Current repo reality:

- Cognito is already set up for customer auth.
- Backend has test/demo public and customer APIs plus authenticated certificate upload/list/download-url APIs.
- Dev frontend API calls are routed through the same CloudFront origin at `/api/*`, which forwards to the current HTTP EC2 backend origin.
- Contact/support, profile, AI query, subscriptions, jobs, and WhatsApp APIs are not implemented.

Frontend implication:

- Build API clients around stable abstractions.
- Use real Cognito auth now.
- Use empty states or disabled states for product APIs until backend endpoints are implemented.
- Do not invent fake persistence.

## 17. Production Infrastructure Risks

The current frontend is hosted via HTTPS CloudFront. The current backend context describes an HTTP EC2 endpoint. Browser calls from HTTPS frontend to the raw HTTP backend are blocked as mixed content, so deployed API calls go through the CloudFront `/api/*` behavior until the backend has HTTPS directly.

Before production API features are considered complete:

- Backend API needs HTTPS.
- Backend CORS must allow localhost development origins; deployed same-origin CloudFront API calls do not rely on browser CORS.
- `VITE_API_BASE_URL` must be environment-specific when bypassing the same-origin CloudFront API proxy.
- Contact/support data submission path must be approved.
- Certificate upload storage now uses a private Terraform-managed S3 bucket, a generic DynamoDB table, and a Terraform-managed backend EC2 runtime role/profile in dev; production hardening still needs malware scanning, retention rules, and operational backup/restore review.

## 18. UX and Visual Direction

Tone:

- Professional.
- Maritime-aware.
- Trustworthy.
- Calm and practical.
- Clear enough for users who may not be highly technical.

Visual direction:

- First screen should signal maritime career guidance immediately.
- Use strong navigation and clear page hierarchy.
- Use clean, modern forms.
- Use confidence/status indicators for compliance concepts.
- Use dashboard surfaces for authenticated workflows.
- Avoid fake dashboards with invented personal data.
- Avoid unsupported claims such as official DG approval, guaranteed jobs, or guaranteed compliance.

Accessibility:

- Mobile-first responsive layout.
- Keyboard-friendly navigation and forms.
- Clear focus states.
- Readable contrast.
- No overlapping text or controls at common mobile and desktop widths.

## 19. Release Phasing

### Phase 1: Professional Web MVP

- Home, About, Help/FAQ, Contact, Support.
- Embedded Cognito sign in, sign up, email verification, password reset, and logout.
- Protected route guard.
- Blank seafarer dashboard shell as the post-login landing page.
- Account page.
- Certificates upload/list/view experience.
- Profile, Ask SeaMarg AI, Career Path, and Advice History as API-ready pages or coming-soon/empty states.
- Clear advisory, non-manning-agent, and trust copy.
- Build and typecheck passing.

### Phase 2: Real Seafarer Data

- Backend profile APIs.
- Certificate missing-document checklist and reminder delivery.
- Notification preferences.
- Real support/contact submission.
- HTTPS/CORS production API readiness.

### Phase 3: AI Guidance

- `/api/v1/ai/query`.
- AI history.
- Rule confidence display.
- DG Shipping prompt layer.
- AI safety/error/fallback states.
- Human review escalation for low-confidence or high-risk answers.

### Phase 4: WhatsApp and Automation

- WhatsApp Business API integration.
- n8n workflows.
- Shared AI logic for app/web/WhatsApp.
- Certificate expiry reminders.
- Scam report workflow.

### Phase 5: Marketplace and Monetization

- Verified company/institute portals.
- Job postings.
- AI job matching.
- Paid career roadmap.
- Subscription and payment flow.
- Admin verification and moderation.

## 20. Acceptance Criteria for Phase 1

- `npm run typecheck -w frontend` passes.
- `npm run build -w frontend` passes.
- Public pages reflect client-provided SeaMarg positioning and problem/solution.
- Home page clearly communicates AI-powered maritime career and compliance guidance.
- About page includes brand meaning, mission, and advisory boundaries.
- FAQ page includes DG Shipping, AI, scam safety, compliance, and account topics.
- Contact and Support forms validate inputs and show honest submission behavior.
- Sign-in uses the embedded Cognito User Pool form.
- Sign-up sends Cognito email verification.
- Users can verify email with a Cognito code.
- Users can request and complete forgot-password reset.
- Successful login redirects to Dashboard.
- Protected dashboard requires authentication.
- Dashboard remains a blank/private shell until product content and APIs are approved.
- Certificates page can upload, list, and open private documents through authenticated backend APIs.
- Deployed certificate API calls do not trigger browser mixed-content errors.
- Sign out clears local session and returns user to public state.
- No admin password, token, or secret is exposed in frontend code.
- No unsupported claim says SeaMarg is official, licensed as a manning agent, or able to guarantee sign-on/job outcomes.

## 21. Open Product Questions

- Should the web MVP use only Cognito, or should mobile OTP be added sooner to match client docs?
- Should the first implementation include a public Pricing/Plans page, or only mention free vs paid positioning?
- What contact/support submission method is approved for launch?
- Which support email, phone, or WhatsApp number can be displayed?
- Which exact legal disclaimer wording should product approve?
- Are Privacy Policy, Terms, Cookie Notice, and Data Processing pages required before launch?
- Should the dashboard show disabled product modules, static previews, or only modules backed by real APIs?
- When should WhatsApp-first access become part of the product scope?
- Who will own DG Shipping rule review and AI response governance?
- What backend API phase should follow immediately after frontend MVP?

## 22. Implementation Notes for Frontend Build

Recommended frontend approach:

- Current implementation uses a vanilla TypeScript/Vite SPA with hash routing.
- Consider React or another component framework later only if the product surface becomes complex enough to justify migration.
- Use Cognito User Pool app-client authentication for the current embedded form flow.
- Keep product content in typed data structures where possible, especially FAQ and feature content.
- Create reusable layout, navigation, form, status, and protected-route components.
- Keep API calls isolated behind small service modules.
- Avoid committing `.env` files.

Suggested first implementation route:

1. Establish app framework, routing, layout, and design tokens.
2. Build public pages with real SeaMarg copy from this PRD.
3. Add Cognito auth.
4. Add protected dashboard/account.
5. Add API-ready profile/certificate/AI placeholder pages.
6. Verify with typecheck/build and responsive browser checks.
