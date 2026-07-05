# Project Context

This file preserves the current state of the `seamarg` project for future contributors and Codex chats. It intentionally avoids passwords, AWS access keys, kubeconfigs, and Terraform state.

At the end of long Codex sessions, use `docs/session-close-prompt.md` to update this file with any new durable project context.

## Context Maintenance

`AGENTS.md` directs future contributors and Codex chats to read this file before making infrastructure, security, or pipeline changes. Use `docs/session-close-prompt.md` before closing long sessions so new architecture decisions, AWS resource names, deployment lessons, and known risks are preserved here.

`docs/frontend-prd.md` is the living frontend product record. Whenever a frontend feature is implemented, compare the change against the PRD before closing the session. If the feature is missing, add it to the relevant requirements, acceptance criteria, release phase, and implementation tracker so future chats can see what is done, what remains, and what is deferred.

The redesigned private portal (built 2026-07-05) has its own detailed specs: `docs/private-portal-prd.md` (functional spec + build tracker for the 3-step portal), `docs/profile-data-design.md` (Cognito + DynamoDB two-channel design and the profile API), and `docs/certificates-design.md` (certificate data model, MiniMax extraction, and locked decisions D1–D4). Read these before touching the profile or certificate features.

Do not commit or push during a context-save pass unless the user explicitly asks for it.

## Current Architecture

`seamarg` is a monorepo intended to be imported into IntelliJ from the repository root.

- `backend/`: Spring Boot Java backend built with Gradle and Java 21.
- `frontend/`: TypeScript/Vite app deployed as static files.
- `lambda/`: TypeScript Lambda workspace placeholder for future functions.
- `infra/terraform/`: Terraform for the active dev AWS infrastructure.
- `.github/workflows/deploy.yml`: manually triggered GitHub Actions deployment workflow.

## AWS And Deployment Model

The active AWS region is `ap-south-1`. The known dev AWS account is `695663959248`. The Terraform state bucket used so far is `seamarg-terraform-state-695663959248-ap-south-1`, with state key `seamarg/dev/terraform.tfstate`.

Infrastructure is now managed only through the dev Terraform stack under `infra/terraform/environments/dev` and reusable modules under `infra/terraform/modules`. The unused staging and prod Terraform stacks were removed; CI and deploy workflows now expose only `dev` as an environment choice.

Treat Terraform as the source of truth for infrastructure. Do not make AWS infrastructure changes manually unless an urgent production unblock requires it; if a manual change is made, codify it in Terraform and import/adopt it into state in the same session before closing.

Backend EKS deployment was retired on June 24, 2026 because infrastructure cost was too high for the expected initial traffic. The replacement is one Dockerized backend instance on a manually provided EC2 host. Terraform no longer contains EKS, ECR, or Kubernetes backend config modules.

GitHub Actions deploys through OIDC using IAM role `arn:aws:iam::695663959248:role/seamarg-dev-github-actions`. Terraform manages that role through `infra/terraform/modules/github-actions`; permissions are scoped to S3, DynamoDB, IAM, Cognito, CloudFront, EC2 security-group ingress for backend SSH deploys, and `sts:GetCallerIdentity` for the current dev infrastructure. The workflow is manually unlocked with:

- `environment`: usually `dev`
- `target`: `backend`, `frontend`, `lambda`, `infra`, or `all`
- `unlock_deploy`: must be checked
- `terraform_apply`: checked only when infrastructure should be applied

Use `target: infra` with `terraform_apply` checked only for Terraform changes. Use `target: backend` with `terraform_apply` unchecked for normal backend-only EC2 Docker deploys.

When `terraform_apply` is checked, the deploy workflow first applies `module.github_actions`, waits briefly for IAM propagation, refreshes the OIDC role session, then runs the full Terraform plan/apply. This avoids a failure mode where the role updates its own policy, such as adding DynamoDB permissions, and then immediately tries to use those new permissions in the same STS session.

The dev Terraform variable `github_repository_full_name` defaults to `madan712/seamarg` so local Terraform plans do not treat the GitHub Actions OIDC role as disabled. GitHub Actions still passes the repository explicitly as `TF_VAR_github_repository_full_name`.

## Backend Status

The backend has three endpoint categories:

- Public: `/api/public/**`, available to anyone.
- Customer: `/api/customer/**`, protected by AWS Cognito JWTs.
- Admin: `/api/admin/**`, protected by static password header `X-Admin-Password`.

As of June 26, 2026, the backend also exposes authenticated customer certificate APIs:

- `GET /api/customer/certificates`: list the signed-in user's uploaded certificate records.
- `POST /api/customer/certificates`: upload a certificate/document file, store the file in S3, extract metadata with OpenAI when `OPENAI_API_KEY` is configured, fall back to local merchant-navy document/rank pattern extraction, and save metadata to DynamoDB.
- `GET /api/customer/certificates/{certificateId}/download-url`: return a short-lived private S3 presigned URL for view/download.

As of July 5, 2026, the backend also serves the redesigned private portal (see `docs/private-portal-prd.md`, `docs/profile-data-design.md`, `docs/certificates-design.md`). All are under `/api/customer/**` (Cognito JWT; `sub` always taken from the token, never the body):

- Seafarer profile (one DynamoDB item per section):
  - `GET /api/customer/profile`: returns all saved `PROFILE#*` sections keyed by section slug.
  - `PUT /api/customer/profile/{section}`: upsert one section; `{section}` ∈ `main|contact|passport|address|languages|skills|visas|relatives|misc`. `main` requires `firstName`/`lastName`/`dateOfBirth`; `contact` requires `email`/`mobilePhone1`; unknown section → 400.
- Certificate "Main documents" checklist: `GET`/`PUT /api/customer/certificates/main-documents` (held/not-held map stored as a single JSON item).
- Detailed certificate entries (one item per catalog type):
  - `GET /api/customer/certificates/entries`: saved entries grouped by category slug then type slug.
  - `PUT /api/customer/certificates/{category}/{type}`: upsert one entry; `{category}` ∈ `general|ncoc|medical|tanker-passenger|offshore|flag-state`. Requires `issuedDate`/`issuePlace`/`issuingAuthority` (+ `cocGrade` for `ncoc`); rejects past `expiryDate`; unknown category → 400.
  - `POST /api/customer/certificates/{category}/{type}/file` (multipart): store one scan in S3, read metadata with MiniMax, return `{extraction, file}` suggestions (does not itself persist the entry; the subsequent PUT persists fields + the nested `file` object). Returns 503 when the document bucket is unset.
  - `GET /api/customer/certificates/{category}/{type}/download-url`: presigned URL for the entry's attached file (400 if none attached).

The new certificate code reuses the S3 `DocumentStorage` and adds a generic `CertificateDataRepository` (JSON blob per `(user, sk)`, Dynamo + in-memory). The POC upload-first endpoints (`GET`/`POST /api/customer/certificates`, `.../download-url`) still exist and were left untouched. AI extraction for the new entry flow uses a self-contained `MiniMaxCertificateExtractor` + `CertificateEntryExtraction`; the POC `OpenAiCertificateExtractor`/`CertificateExtraction` were not modified.

Admin credentials are configured through environment variables:

- `SEAMARG_ADMIN_USERNAME`, default `admin`
- `SEAMARG_ADMIN_PASSWORD`, no default password
- `SEAMARG_ADMIN_ROLE`, default `ADMIN`, mapped to Spring authority `ROLE_ADMIN`

Certificate/storage environment variables:

- `SEAMARG_AWS_REGION`, default `ap-south-1`
- `SEAMARG_DOCUMENT_BUCKET`, required for real certificate uploads
- `SEAMARG_APP_DATA_TABLE`, required for persistent certificate metadata
- `SEAMARG_CERTIFICATE_MAX_UPLOAD_BYTES`, default `10485760`
- `SEAMARG_CERTIFICATE_DOWNLOAD_URL_TTL_SECONDS`, default `300`
- `OPENAI_API_KEY`, optional; only used by the legacy POC certificate upload path
- `SEAMARG_OPENAI_MODEL`, default `gpt-5.5` (legacy POC path only)
- `SEAMARG_MINIMAX_API_KEY` (falls back to `MINIMAX_API_KEY`), optional; primary extractor for the new certificate-entry file flow. When absent (or on any failure/non-image), extraction returns empty suggestions and the user fills the form manually — nothing breaks.
- `SEAMARG_MINIMAX_BASE_URL`, default `https://api.minimax.io/v1` (the extractor POSTs `{base}/chat/completions`)
- `SEAMARG_MINIMAX_MODEL`, default `MiniMax-VL-01`; **must be a vision-capable model** to read image scans
- `SEAMARG_CORS_ALLOWED_ORIGINS`, comma-separated browser origins allowed to call `/api/**`

On EC2, provide these environment variables to the backend Docker container directly or through a host-local secret file that is not committed. `COGNITO_ISSUER_URI` should continue to come from the Terraform-created Cognito user pool. Attach the Terraform output `backend_runtime_data_policy_arn` to the backend runtime role or EC2 instance profile before relying on S3/DynamoDB access; do not commit or place long-lived AWS access keys in `/opt/seamarg/backend.env`.

The current dev backend EC2 host is `ec2-65-1-132-40.ap-south-1.compute.amazonaws.com`, with public IPv4 `65.1.132.40`, connecting as `ec2-user` with the local key at `/Users/madan.chaudhary/Downloads/Keys/MyWindowsKey.pem`. It runs Amazon Linux 2023 with Docker enabled. The instance ID is `i-04e02dc88bcc372b3`. The backend container is named `seamarg-backend`, uses image `seamarg-backend:latest`, maps host port `80` to container port `8080`, and uses restart policy `unless-stopped`. Runtime environment variables live on the server at `/opt/seamarg/backend.env` with `600` permissions and must not be committed or printed. As of June 27, 2026, the file includes `SEAMARG_AWS_REGION=ap-south-1`, `AWS_REGION=ap-south-1`, `SEAMARG_DOCUMENT_BUCKET=seamarg-dev-certificates-695663959248`, and `SEAMARG_APP_DATA_TABLE=seamarg-dev-app-data`.

The dev backend EC2 instance profile is `arn:aws:iam::695663959248:instance-profile/seamarg-dev-backend-ec2`, with role `arn:aws:iam::695663959248:role/seamarg-dev-backend-ec2`. Terraform now manages this role/profile through `infra/terraform/modules/backend-runtime` and imports the manually created dev resources through `infra/terraform/environments/dev/imports.tf`. The role has the Terraform-created policy `arn:aws:iam::695663959248:policy/seamarg-dev-backend-runtime-data` attached, allowing the backend to access the private certificate bucket and generic DynamoDB table. If the backend EC2 instance is replaced manually, attach instance profile `seamarg-dev-backend-ec2` to the new instance.

GitHub Actions backend deployment requires the `BACKEND_EC2_SSH_PRIVATE_KEY` GitHub Environment secret. Optional variables are `BACKEND_EC2_HOST`, `BACKEND_EC2_USER`, `BACKEND_EC2_REMOTE_ROOT`, and `BACKEND_EC2_SECURITY_GROUP_ID`; defaults match the current dev host and security group.

The backend EC2 security group is `sg-0edcb8bd177aa82d4`. SSH is not permanently open to GitHub because GitHub-hosted runner IPs change. The backend deploy workflow uses AWS OIDC credentials to temporarily authorize the runner's current `/32` IP on port `22`, deploys over SSH, and revokes that rule in an `always()` cleanup step.

Backend deployment now uses `scripts/deploy-backend-ec2.sh`. The GitHub workflow builds `backend/build/libs/seamarg-backend.jar` before opening SSH. The script uploads the jar plus a small runtime Dockerfile to EC2, builds the runtime image on the server, removes/recreates the `seamarg-backend` container, waits for the local public endpoint to become ready, and reuses the existing `/opt/seamarg/backend.env`. It deliberately changes ownership only under `/opt/seamarg/release` so the secret env file can stay protected.

The known dev Cognito issuer is `https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_7B41ZYOET`. Confirm it from Terraform before relying on it:

```bash
terraform -chdir=infra/terraform/environments/dev output -raw cognito_issuer_uri
```

Useful certificate storage output checks after Terraform apply:

```bash
terraform -chdir=infra/terraform/environments/dev output -raw documents_bucket_name
terraform -chdir=infra/terraform/environments/dev output -raw app_data_table_name
terraform -chdir=infra/terraform/environments/dev output -raw backend_runtime_data_policy_arn
terraform -chdir=infra/terraform/environments/dev output -raw backend_ec2_instance_profile_name
```

Useful backend checks:

```bash
./gradlew :backend:test :backend:bootJar
scripts/deploy-backend-ec2.sh ec2-user@ec2-65-1-132-40.ap-south-1.compute.amazonaws.com /Users/madan.chaudhary/Downloads/Keys/MyWindowsKey.pem
curl -i http://ec2-65-1-132-40.ap-south-1.compute.amazonaws.com/api/public/hello
ssh -i /Users/madan.chaudhary/Downloads/Keys/MyWindowsKey.pem ec2-user@ec2-65-1-132-40.ap-south-1.compute.amazonaws.com 'sudo docker ps --filter name=seamarg-backend'
```

The old dev EKS cluster was named `seamarg-dev-eks`, with backend namespace `seamarg`, service `seamarg-backend`, ECR repo `seamarg-dev-backend`, VPC `vpc-0a104403d9d102d07`, and classic ELB `a7967211d441d405abd01f15c17995ff`. These resources were deleted on June 24, 2026. A post-cleanup Terraform plan reported no changes, and Terraform state no longer contains backend/EKS/ECR/VPC/Kubernetes resources.

## Data Storage Status

Terraform now includes `infra/terraform/modules/data` for backend application data. In dev it creates:

- Private S3 documents bucket named like `seamarg-dev-certificates-<account-id>` with public access blocked, bucket-owner-enforced ownership, AES256 encryption, versioning, incomplete multipart cleanup, and `prevent_destroy`.
- Generic DynamoDB table named `seamarg-dev-app-data` using `pk` and `sk` plus `gsi1Pk`/`gsi1Sk` for a reusable single-table pattern. All rows are keyed `pk=USER#<cognito-sub>`. Sort keys in use: legacy POC uploads `sk=CERTIFICATE#<certificate-id>`; profile sections `sk=PROFILE#<SECTION>` (MAIN/CONTACT/PASSPORT/ADDRESS/LANGUAGES/SKILLS/VISAS/RELATIVES/MISC); certificate main-documents checklist `sk=CERT#MAINDOCS`; detailed certificate entries `sk=CERT#<CATEGORY>#<TYPE_SLUG>` (category enum name, e.g. `CERT#GENERAL#stcw-basic-safety-training`). Profile/certificate items store the fields as a JSON `payload` attribute plus `updatedAt`.
- IAM policy output `backend_runtime_data_policy_arn` granting the backend S3 object access and DynamoDB item access for this storage.

The AWS provider currently validates this table with a deprecation warning for `hash_key`/`range_key`, but the installed provider version rejects the suggested `key_schema` block syntax. Keep the valid syntax until the provider docs and installed version align.

## Frontend Status

The frontend is deployed by the pipeline by building `frontend/dist`, syncing static files to a private S3 bucket, and invalidating CloudFront.

CloudFront proxies `/api/*` to the dev backend EC2 origin `ec2-65-1-132-40.ap-south-1.compute.amazonaws.com` over HTTP. The browser calls the same HTTPS CloudFront origin, which avoids mixed-content failures from the HTTPS frontend trying to call the raw HTTP EC2 host. The deployed frontend build uses Terraform output `frontend_api_base_url` for `VITE_API_BASE_URL`; local development can continue using `http://localhost:8080`.

As of June 26, 2026, the frontend is a vanilla TypeScript/Vite SPA with hash routing. It includes public Home, About, Help/FAQ, Contact, and Support pages; embedded Cognito User Pool forms for sign in, sign up, email verification, resend code, forgot password, and reset password; protected Dashboard, Profile, Certificates, Ask SeaMarg AI, Career Path, and Account routes; and a blank Dashboard shell as the post-login landing page.

As of July 5, 2026, the entire post-login private area was **replaced** by a new three-step seafarer portal (functional spec in `docs/private-portal-prd.md`). The old Dashboard / Ask SeaMarg AI / Career Path routes and the certificate POC UI were removed. The portal has a top stepper — **1. Your profile, 2. Certificates, 3. Sea service records** — with a left submenu per step, a dismissible welcome banner, and an account/log-out menu. Post-login now lands on **Step 1 → Guide to filling your profile** (not a dashboard). Signup collects First/Last name, Email, Mobile phone (E.164), Birth date, Password and writes the basics to Cognito standard attributes; profile field values persist to DynamoDB via the profile API (no submit step — everything is editable).

- **Step 1 (Your profile) — complete**: Guide plus nine save-per-section forms (Main information, Contact details, Passport & Seaman book, Address & Airport, Languages, Professional skills, Visas, Relatives & next of kin, Notes & miscellaneous), each `GET`-prefilled and `PUT`-saved, prefilling from Cognito claims where relevant. Dummy option lists are used pending real reference data.
- **Step 2 (Certificates) — complete**: Guide; a Main documents checkbox grid; and six detailed categories (General, NCOC, Medical, Tanker/Passenger, Offshore, Flag State) as accordions with an Expand-all⇄Collapse-all toggle + Expand-filled. Each entry has Number, Issued Date*, Expiry Date, Issue Place*, Issuing Authority* (NCOC adds required COC grade; Medical adds Clinic Name), required + past-expiry validation, and a themed drag-and-drop file dropzone that uploads a scan, reads it with MiniMax, prefills the form for review, and offers a "View file" presigned link. Catalogs are 6-item dummy lists for the POC — swapping the real (much longer) catalogs later is a pure data edit to the `*_CERTIFICATES` arrays, no code change.
- **Step 3 (Sea service records)** — not built yet (only the Guide sub-page slug exists).

The certificate area load is loop-safe (same guard pattern as the profile loader that fixed the earlier infinite-request bug): data loads once per Cognito subject, errors surface with an explicit Retry, and state resets on sign-out.

Terraform creates:

- A private frontend S3 bucket.
- S3 public access block and bucket policy.
- CloudFront distribution.
- CloudFront `/api/*` behavior forwarding API requests and auth headers to the backend EC2 origin.
- CloudFront Origin Access Control so only CloudFront can read S3 objects.
- A private certificate/document S3 bucket.
- A generic backend DynamoDB table.
- A backend runtime IAM policy for the document bucket and app data table.
- A backend EC2 runtime role and instance profile that attach the backend runtime data policy.

The frontend S3 bucket uses Terraform `prevent_destroy`. If a plan wants to delete or replace the bucket, stop and inspect the environment, region, and dependency graph before applying.

Route 53/domain setup is intentionally deferred. For now, access the frontend using the CloudFront domain output from Terraform.

## Cognito Status

Terraform creates the customer Cognito user pool, frontend app client, and hosted UI domain. The current frontend uses embedded Cognito User Pool forms through the app client rather than redirecting to the hosted UI. Customer backend endpoints are designed to validate JWT tokens using `COGNITO_ISSUER_URI`.

Native Cognito email sign-up is the current baseline. Google/Gmail social login is future work and will require adding a Google identity provider, client ID/secret handling, and supported identity providers in Terraform.

## July 5, 2026 Session Notes

This session redesigned and built the private portal (Steps 1–2). All work is committed to `main` (`78ab4db For profile and general certificate`, `c09d750 file uploading`); the working tree is clean at save time.

What was built:

- **Step 1 profile**: nine section forms + Guide, all wired to `GET/PUT /api/customer/profile`. Backend `com.seamarg.backend.profile` (`ProfileController`/`ProfileService`/repositories) with per-section required-field validation. Signup now writes given_name/family_name/phone_number/birthdate to Cognito.
- **Step 2 certificates**: Main documents (`CERT#MAINDOCS`), six accordion categories (`CERT#<CATEGORY>#<TYPE_SLUG>`), and upload-first file/AI flow. New backend classes: `MainDocuments*`, `CertificateCategory`, `CertificateEntry*`, `CertificateFileService`, `CertificateDataRepository` (+ Dynamo/in-memory), `MiniMaxCertificateExtractor`, `CertificateEntryExtraction`; `DocumentStorage` gained a `(bucket, key, filename)` presign overload.
- **MiniMax extraction (D4)**: chosen over OpenAI for the new flow. The user set `SEAMARG_MINIMAX_API_KEY`, `SEAMARG_MINIMAX_BASE_URL=https://api.minimax.io/v1`, `SEAMARG_MINIMAX_MODEL=MiniMax-M3` in `/opt/seamarg/backend.env` (secret key value not recorded here) and in the local IntelliJ run config.

Open risks / things to verify when the MiniMax key is live (backend + frontend must be deployed first — the step-2 code was not deployed during this session, only committed):

- **Vision model**: certificate reading sends the scan image to the model. `MiniMax-M3` may be text-only; if so, extraction returns empty (graceful) and the user types manually. Use a vision model (e.g. `MiniMax-VL-01`) if M3 can't read images — env-only change.
- **Endpoint/shape**: the extractor assumes MiniMax's OpenAI-compatible `{base}/chat/completions` with `image_url` content parts and `response_format: json_object`. MiniMax's native API may instead be `/v1/text/chatcompletion_v2` with a different multimodal shape — that would be a small code change. On failure the extractor logs `status`, `model`, `url`, and a truncated response body (no key) to aid diagnosis; only images are sent (PDFs are skipped with a note for now).

Lightweight checks that worked this session:

```bash
cd frontend && npx tsc --noEmit
JAVA_HOME="/Users/madan.chaudhary/Library/Java/JavaVirtualMachines/ms-21.0.10/Contents/Home" ./gradlew :backend:test
```

- Local Java is not on PATH; the asdf-managed Microsoft JDK 21 at the `JAVA_HOME` above builds/tests successfully.
- Frontend verification was done in the Claude preview against a stubbed `fetch`/session (synthetic `.click()` does not reach delegated handlers — dispatch `new MouseEvent('click',{bubbles:true})`, and set file inputs via a `DataTransfer` to trigger upload).

Current next steps:

- Deploy `target: frontend` and `target: backend`, set the MiniMax env vars on EC2, then upload an image on a certificate and confirm extraction (or read the diagnostic log line if it returns empty).
- Build **Step 3 — Sea service records** (add/edit/list of multiple records; different shape from the fixed certificate catalog). A short mini-spec first is recommended.
- Load the real (full) certificate catalogs into the `*_CERTIFICATES` frontend constants when the authoritative lists are provided.

## June 27, 2026 Session Notes

Certificate upload/list/view now works locally and from the deployed CloudFront frontend. Durable operational lessons from this session:

- Browser console error `Mixed Content: ... requested an insecure resource http://ec2-.../api/customer/certificates` was caused by the HTTPS CloudFront frontend calling the HTTP EC2 backend directly. The deployed frontend now calls same-origin `https://<cloudfront>/api/*`, and CloudFront forwards `/api/*` to the HTTP EC2 backend origin.
- Terraform initially failed to update CloudFront with `NoSuchCachePolicy` when the API behavior referenced AWS managed cache policy ID `4135ea2d-6df8-44a3-9df8-4b5a84be39ad`. The fix was to create a stack-owned `aws_cloudfront_cache_policy.backend_api` with zero TTL and use it on `/api/*`.
- After mixed-content was fixed, the server showed no certificate rows because the EC2 backend container lacked `SEAMARG_DOCUMENT_BUCKET` and `SEAMARG_APP_DATA_TABLE`; the backend fell back to in-memory certificate metadata. `/opt/seamarg/backend.env` was updated on EC2 with the non-secret storage env keys, the Docker container was recreated, and the server then read the same DynamoDB rows as local.
- The EC2 instance originally had no IAM instance profile. A backend runtime role/profile named `seamarg-dev-backend-ec2` was created, attached to the Terraform-created policy `seamarg-dev-backend-runtime-data`, associated to instance `i-04e02dc88bcc372b3`, then codified and imported into Terraform through `infra/terraform/modules/backend-runtime` and `infra/terraform/environments/dev/imports.tf`.
- `terraform apply` adopted the manual backend runtime IAM resources with `3 imported, 0 added, 2 changed, 0 destroyed`; a follow-up `terraform plan` reported `No changes`.

Lightweight checks that worked:

```bash
AWS_PROFILE=personal AWS_REGION=ap-south-1 terraform -chdir=infra/terraform/environments/dev validate
AWS_PROFILE=personal AWS_REGION=ap-south-1 terraform -chdir=infra/terraform/environments/dev plan -input=false -no-color
AWS_PROFILE=personal AWS_REGION=ap-south-1 terraform -chdir=infra/terraform/environments/dev apply -input=false -auto-approve -no-color
curl -fsS http://ec2-65-1-132-40.ap-south-1.compute.amazonaws.com/api/public/hello
AWS_PROFILE=personal AWS_REGION=ap-south-1 aws ec2 describe-instances --instance-ids i-04e02dc88bcc372b3 --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' --output text
AWS_PROFILE=personal AWS_REGION=ap-south-1 aws iam list-attached-role-policies --role-name seamarg-dev-backend-ec2 --query 'AttachedPolicies[].PolicyArn' --output text
```

## June 24, 2026 Session Notes

AWS cleanup was run in `ap-south-1` against account `695663959248` using the local `personal` AWS CLI profile. Useful verification commands from the cleanup:

```bash
AWS_PROFILE=personal aws sts get-caller-identity
AWS_PROFILE=personal aws eks list-clusters --region ap-south-1
AWS_PROFILE=personal aws ecr describe-repositories --region ap-south-1
terraform -chdir=infra/terraform/environments/dev plan -detailed-exitcode
terraform -chdir=infra/terraform/environments/dev state list | rg 'backend|eks|ecr|vpc|kubernetes'
```

Lightweight verification that worked after the repo changes:

```bash
bash -n scripts/deploy-backend-ec2.sh
ruby -e 'require "yaml"; %w[.github/workflows/deploy.yml .github/workflows/ci.yml].each { |f| YAML.load_file(f); puts "#{f} ok" }'
terraform -chdir=infra/terraform/environments/dev validate
./gradlew :backend:test
```

Operational issues encountered and fixed:

- EC2 launch initially showed no VPCs in `ap-south-1`; a public EC2 backend needs a VPC, public subnet, route to an Internet Gateway, and security-group rules for SSH/HTTP. An Internet Gateway has no separate hourly cost, but NAT Gateways, EC2, EBS, and unused Elastic IPs can cost money.
- The Kubernetes `LoadBalancer` service had to be deleted and its classic ELB had to disappear before old EKS networking could be fully removed.
- Local `actionlint` was not installed, so workflow verification used YAML parsing rather than a GitHub Actions semantic lint.
- A backend CI deploy reached EC2 but failed with `client_loop: send disconnect: Broken pipe` while Docker was running a full Gradle build on the EC2 host. The fix was to move `./gradlew :backend:bootJar` into GitHub Actions and make the EC2 script upload the prebuilt jar, then build only a small runtime image remotely.
- The old remote Gradle/Docker build left the `t3.micro` backend instance unresponsive to SSH and HTTP. A normal reboot did not recover it, but `stop-instances --force` followed by start recovered the instance and changed its public DNS from `ec2-13-127-32-60.ap-south-1.compute.amazonaws.com` to `ec2-13-233-83-132.ap-south-1.compute.amazonaws.com`, and the latest restart changed it again to `ec2-35-154-109-175.ap-south-1.compute.amazonaws.com`. A later restart changed it again to `ec2-65-1-132-40.ap-south-1.compute.amazonaws.com` (public IPv4 `65.1.132.40`), which is the current host.
- After the stop/start recovery, the jar-only `scripts/deploy-backend-ec2.sh` path was verified manually against the new host and `/api/public/hello` returned successfully.
- The GitHub backend smoke test once failed immediately after deploy with `curl: (7) Failed to connect ... port 80`; the container was healthy shortly afterward. The deploy script and workflow smoke test now wait/retry for backend readiness.

Current next steps and risks:

- As of the end-of-session save on June 24, 2026, the EC2 jar-only backend deploy and readiness retries were already present in `main` at commit `71f1966`. If a GitHub Actions run still behaves like the old workflow, confirm it is running this commit or newer.
- Before relying on CI/CD, add `BACKEND_EC2_SSH_PRIVATE_KEY` as a GitHub Environment secret for `dev`. Optional environment variables are `BACKEND_EC2_HOST`, `BACKEND_EC2_USER`, `BACKEND_EC2_REMOTE_ROOT`, and `BACKEND_EC2_SECURITY_GROUP_ID`; if `BACKEND_EC2_HOST` is set, keep it pointed at the current EC2 DNS rather than the old `ec2-13-127-32-60.ap-south-1.compute.amazonaws.com` host.
- For backend-only CI/CD, run the `Deploy` workflow with `target: backend`, `environment: dev`, `unlock_deploy` checked, and `terraform_apply` unchecked.
- The backend host is manually provisioned and single-instance. There is no high availability, TLS/domain setup, automated host replacement, monitoring, or backup plan yet.
- If GitHub Actions SSH fails with `connect to host ... port 22: Connection timed out`, check that the deployment role has EC2 security-group ingress permissions and that the temporary runner `/32` rule was added to `sg-0edcb8bd177aa82d4`.

## Lessons Already Learned

- A `403` reading Terraform state usually means the GitHub Actions role lacks S3 permissions on the state bucket or object key.
- Creating frontend S3 and CloudFront required adding S3 and CloudFront permissions to the GitHub Actions role.
- Creating Cognito required adding `cognito-idp:*` permissions to the GitHub Actions role.
- A broad Terraform `depends_on` between modules caused Terraform to think the frontend bucket needed replacement. Avoid broad module-level dependencies unless truly required.
- The retired EKS path had a failure mode where the backend pod used an empty `COGNITO_ISSUER_URI` when `seamarg-backend-config` was missing. On EC2, make the issuer an explicit container environment variable.

- Local Terraform validation may fail with `ExpiredToken` if the AWS CLI session has expired. Refresh AWS credentials, verify with `aws sts get-caller-identity`, then rerun `terraform init`/`validate`.
- An EC2 backend can upload to S3 but still show empty certificate lists if DynamoDB persistence is not configured; verify `SEAMARG_APP_DATA_TABLE`, `SEAMARG_DOCUMENT_BUCKET`, and the EC2 instance profile before debugging frontend state.
- Never store admin passwords, AWS access keys, kubeconfigs, or Terraform state in the repository.
