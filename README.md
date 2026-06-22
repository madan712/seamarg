# seamarg

`seamarg` is the root project for a deployable monorepo:

- `backend` is a Spring Boot Java service managed by Gradle.
- `frontend` is a TypeScript/Vite web app.
- `lambda` is a TypeScript AWS Lambda placeholder for future functions.
- `infra/terraform` contains infrastructure-as-code for EKS, ECR, S3, CloudFront, Cognito, and future Lambda infrastructure.
- `.github/workflows` contains CI and manually unlocked deployment workflows.

## Local development

Toolchain baseline:

- Java 21 LTS
- Node.js 24 or newer

Import this root directory into IntelliJ as a Gradle project:

```bash
./gradlew projects
```

Backend:

```bash
./gradlew :backend:bootRun
./gradlew :backend:test
```

Frontend:

```bash
npm install
npm run dev -w frontend
npm run build -w frontend
```

Lambda:

```bash
npm run build -w lambda
```

Terraform:

```bash
terraform fmt -recursive infra/terraform
terraform -chdir=infra/terraform/environments/dev init -backend=false
terraform -chdir=infra/terraform/environments/dev validate
```

## Deployment workflow

Deployments are started manually from GitHub Actions using the `Deploy` workflow.

The workflow has an `unlock_deploy` checkbox and a `target` selector:

- `backend`
- `frontend`
- `lambda`
- `infra`
- `all`

The `infra` target runs Terraform only when `terraform_apply` is checked. Other targets build each selected component separately and then call the matching script in `scripts/`.

Backend deployment builds a Docker image, pushes it to ECR, and rolls it out to EKS. Frontend deployment builds the Vite static files, uploads them to a private S3 bucket, and invalidates the CloudFront distribution that is allowed to read that bucket.

Backend deployment to AWS EKS is documented in `docs/aws-eks-backend-deployment.md`.
