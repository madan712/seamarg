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
- `infra/terraform/`: Terraform for AWS infrastructure.
- `k8s/backend/`: Kubernetes manifests for the backend deployment.
- `.github/workflows/deploy.yml`: manually triggered GitHub Actions deployment workflow.

## AWS And Deployment Model

The active AWS region is `ap-south-1`. The known dev AWS account is `695663959248`. The Terraform state bucket used so far is `seamarg-terraform-state-695663959248-ap-south-1`, with state key `seamarg/dev/terraform.tfstate`.

Infrastructure is managed through Terraform environment stacks under `infra/terraform/environments/{dev,staging,prod}` and reusable modules under `infra/terraform/modules`.

GitHub Actions deploys through OIDC using an IAM role similar to `arn:aws:iam::695663959248:role/seamarg-dev-github-actions`. The workflow is manually unlocked with:

- `environment`: usually `dev`
- `target`: `backend`, `frontend`, `lambda`, `infra`, or `all`
- `unlock_deploy`: must be checked
- `terraform_apply`: checked only when infrastructure should be applied

Use `target: backend` with `terraform_apply` unchecked for normal backend-only app deployments. Use `target: infra` with `terraform_apply` checked only for Terraform changes.

## Backend Status

The backend has three endpoint categories:

- Public: `/api/public/**`, available to anyone.
- Customer: `/api/customer/**`, protected by AWS Cognito JWTs.
- Admin: `/api/admin/**`, protected by static password header `X-Admin-Password`.

Admin credentials are configured through environment variables:

- `SEAMARG_ADMIN_USERNAME`, default `admin`
- `SEAMARG_ADMIN_PASSWORD`, no default password
- `SEAMARG_ADMIN_ROLE`, default `ADMIN`, mapped to Spring authority `ROLE_ADMIN`

On EKS, `SEAMARG_ADMIN_PASSWORD` comes from Kubernetes secret `seamarg-backend-secrets`, key `admin-password`. Username, role, and Cognito issuer URI come from config map `seamarg-backend-config`.

Useful backend checks:

```bash
./gradlew :backend:test :backend:bootJar
kubectl kustomize k8s/backend
kubectl -n seamarg rollout status deployment/seamarg-backend
```

The dev EKS cluster is named `seamarg-dev-eks`, and the backend Kubernetes namespace is `seamarg`. The service is `seamarg-backend` and has been exposed as an AWS LoadBalancer. To get the URL:

```bash
export BACKEND_URL="http://$(kubectl -n seamarg get service seamarg-backend -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')"
```

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

## Lessons Already Learned

- A `403` reading Terraform state usually means the GitHub Actions role lacks S3 permissions on the state bucket or object key.
- Creating frontend S3 and CloudFront required adding S3 and CloudFront permissions to the GitHub Actions role.
- Creating Cognito required adding `cognito-idp:*` permissions to the GitHub Actions role.
- A broad Terraform `depends_on` between modules caused Terraform to think the frontend bucket needed replacement. Avoid broad module-level dependencies unless truly required.
- Selecting `target: backend` while expecting Terraform infra changes will not apply infrastructure correctly. Use `target: infra` for Terraform.
- Never store admin passwords, AWS access keys, kubeconfigs, or Terraform state in the repository.
