# Project Context

This file preserves the current state of the `seamarg` project for future contributors and Codex chats. It intentionally avoids passwords, AWS access keys, kubeconfigs, and Terraform state.

At the end of long Codex sessions, use `docs/session-close-prompt.md` to update this file with any new durable project context.

## Context Maintenance

`AGENTS.md` directs future contributors and Codex chats to read this file before making infrastructure, security, or pipeline changes. Use `docs/session-close-prompt.md` before closing long sessions so new architecture decisions, AWS resource names, deployment lessons, and known risks are preserved here.

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

Backend EKS deployment was retired on June 24, 2026 because infrastructure cost was too high for the expected initial traffic. The replacement is one Dockerized backend instance on a manually provided EC2 host. Terraform no longer contains EKS, ECR, or Kubernetes backend config modules.

GitHub Actions deploys through OIDC using IAM role `arn:aws:iam::695663959248:role/seamarg-dev-github-actions`. Terraform manages that role through `infra/terraform/modules/github-actions`; permissions are scoped to S3, IAM, Cognito, CloudFront, EC2 security-group ingress for backend SSH deploys, and `sts:GetCallerIdentity` for the current dev infrastructure. The workflow is manually unlocked with:

- `environment`: usually `dev`
- `target`: `backend`, `frontend`, `lambda`, `infra`, or `all`
- `unlock_deploy`: must be checked
- `terraform_apply`: checked only when infrastructure should be applied

Use `target: infra` with `terraform_apply` checked only for Terraform changes. Use `target: backend` with `terraform_apply` unchecked for normal backend-only EC2 Docker deploys.

## Backend Status

The backend has three endpoint categories:

- Public: `/api/public/**`, available to anyone.
- Customer: `/api/customer/**`, protected by AWS Cognito JWTs.
- Admin: `/api/admin/**`, protected by static password header `X-Admin-Password`.

Admin credentials are configured through environment variables:

- `SEAMARG_ADMIN_USERNAME`, default `admin`
- `SEAMARG_ADMIN_PASSWORD`, no default password
- `SEAMARG_ADMIN_ROLE`, default `ADMIN`, mapped to Spring authority `ROLE_ADMIN`

On EC2, provide these environment variables to the backend Docker container directly or through a host-local secret file that is not committed. `COGNITO_ISSUER_URI` should continue to come from the Terraform-created Cognito user pool.

The current dev backend EC2 host is `ec2-13-233-83-132.ap-south-1.compute.amazonaws.com`, connecting as `ec2-user` with the local key at `/Users/madan.chaudhary/Downloads/Keys/MyWindowsKey.pem`. It runs Amazon Linux 2023 with Docker enabled. The instance ID is `i-04e02dc88bcc372b3`. The backend container is named `seamarg-backend`, uses image `seamarg-backend:latest`, maps host port `80` to container port `8080`, and uses restart policy `unless-stopped`. Runtime environment variables live on the server at `/opt/seamarg/backend.env` with `600` permissions and must not be committed or printed.

GitHub Actions backend deployment requires the `BACKEND_EC2_SSH_PRIVATE_KEY` GitHub Environment secret. Optional variables are `BACKEND_EC2_HOST`, `BACKEND_EC2_USER`, `BACKEND_EC2_REMOTE_ROOT`, and `BACKEND_EC2_SECURITY_GROUP_ID`; defaults match the current dev host and security group.

The backend EC2 security group is `sg-0edcb8bd177aa82d4`. SSH is not permanently open to GitHub because GitHub-hosted runner IPs change. The backend deploy workflow uses AWS OIDC credentials to temporarily authorize the runner's current `/32` IP on port `22`, deploys over SSH, and revokes that rule in an `always()` cleanup step.

Backend deployment now uses `scripts/deploy-backend-ec2.sh`. The GitHub workflow builds `backend/build/libs/seamarg-backend.jar` before opening SSH. The script uploads the jar plus a small runtime Dockerfile to EC2, builds the runtime image on the server, removes/recreates the `seamarg-backend` container, waits for the local public endpoint to become ready, and reuses the existing `/opt/seamarg/backend.env`. It deliberately changes ownership only under `/opt/seamarg/release` so the secret env file can stay protected.

The known dev Cognito issuer is `https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_7B41ZYOET`. Confirm it from Terraform before relying on it:

```bash
terraform -chdir=infra/terraform/environments/dev output -raw cognito_issuer_uri
```

Useful backend checks:

```bash
./gradlew :backend:test :backend:bootJar
scripts/deploy-backend-ec2.sh ec2-user@ec2-13-233-83-132.ap-south-1.compute.amazonaws.com /Users/madan.chaudhary/Downloads/Keys/MyWindowsKey.pem
curl -i http://ec2-13-233-83-132.ap-south-1.compute.amazonaws.com/api/public/hello
ssh -i /Users/madan.chaudhary/Downloads/Keys/MyWindowsKey.pem ec2-user@ec2-13-233-83-132.ap-south-1.compute.amazonaws.com 'sudo docker ps --filter name=seamarg-backend'
```

The old dev EKS cluster was named `seamarg-dev-eks`, with backend namespace `seamarg`, service `seamarg-backend`, ECR repo `seamarg-dev-backend`, VPC `vpc-0a104403d9d102d07`, and classic ELB `a7967211d441d405abd01f15c17995ff`. These resources were deleted on June 24, 2026. A post-cleanup Terraform plan reported no changes, and Terraform state no longer contains backend/EKS/ECR/VPC/Kubernetes resources.

## Frontend Status

The frontend is deployed by the pipeline by building `frontend/dist`, syncing static files to a private S3 bucket, and invalidating CloudFront.

Terraform creates:

- A private frontend S3 bucket.
- S3 public access block and bucket policy.
- CloudFront distribution.
- CloudFront Origin Access Control so only CloudFront can read S3 objects.

The frontend S3 bucket uses Terraform `prevent_destroy`. If a plan wants to delete or replace the bucket, stop and inspect the environment, region, and dependency graph before applying.

Route 53/domain setup is intentionally deferred. For now, access the frontend using the CloudFront domain output from Terraform.

## Cognito Status

Terraform creates the customer Cognito user pool, frontend app client, and hosted UI domain. Customer endpoints are designed to validate JWT tokens using `COGNITO_ISSUER_URI`.

Native Cognito email sign-up is the current baseline. Google/Gmail social login is future work and will require adding a Google identity provider, client ID/secret handling, and supported identity providers in Terraform.

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
- The old remote Gradle/Docker build left the `t3.micro` backend instance unresponsive to SSH and HTTP. A normal reboot did not recover it, but `stop-instances --force` followed by start recovered the instance and changed its public DNS from `ec2-13-127-32-60.ap-south-1.compute.amazonaws.com` to `ec2-13-233-83-132.ap-south-1.compute.amazonaws.com`.
- After the stop/start recovery, the jar-only `scripts/deploy-backend-ec2.sh` path was verified manually against the new host and `/api/public/hello` returned successfully.
- The GitHub backend smoke test once failed immediately after deploy with `curl: (7) Failed to connect ... port 80`; the container was healthy shortly afterward. The deploy script and workflow smoke test now wait/retry for backend readiness.

Current next steps and risks:

- Before relying on CI/CD, commit and push the current repo changes, then add `BACKEND_EC2_SSH_PRIVATE_KEY` as a GitHub Environment secret for `dev`. Optional environment variables are `BACKEND_EC2_HOST`, `BACKEND_EC2_USER`, `BACKEND_EC2_REMOTE_ROOT`, and `BACKEND_EC2_SECURITY_GROUP_ID`.
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
- Never store admin passwords, AWS access keys, kubeconfigs, or Terraform state in the repository.
