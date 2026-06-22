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

## Admin endpoint credentials

Admin endpoints use a static password header for now. The username and role are internal Spring Security values used as the authenticated principal and authority after the password is accepted.

Defaults:

- Username: `admin`
- Role: `ADMIN`, which becomes Spring authority `ROLE_ADMIN`
- Header: `X-Admin-Password`

### Server setup on EKS

Create or rotate the admin password:

```bash
export ADMIN_PASSWORD="$(openssl rand -base64 36)"
echo "$ADMIN_PASSWORD"

kubectl -n seamarg create secret generic seamarg-backend-secrets \
  --from-literal=admin-password="$ADMIN_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -
```

Create the admin username and role if the config map does not exist yet:

```bash
export ADMIN_USERNAME="admin"
export ADMIN_ROLE="ADMIN"

kubectl -n seamarg create configmap seamarg-backend-config \
  --from-literal=admin-username="$ADMIN_USERNAME" \
  --from-literal=admin-role="$ADMIN_ROLE"
```

If `seamarg-backend-config` already exists, patch it so existing keys such as `cognito-issuer-uri` are preserved:

```bash
kubectl -n seamarg patch configmap seamarg-backend-config --type merge \
  -p "{\"data\":{\"admin-username\":\"${ADMIN_USERNAME}\",\"admin-role\":\"${ADMIN_ROLE}\"}}"
```

Restart the backend after any username, password, or role change:

```bash
kubectl -n seamarg rollout restart deployment/seamarg-backend
kubectl -n seamarg rollout status deployment/seamarg-backend
```

Test the server endpoint:

```bash
export BACKEND_URL="http://$(kubectl -n seamarg get service seamarg-backend -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')"

curl -i "$BACKEND_URL/api/public/hello"
curl -i "$BACKEND_URL/api/admin/hello"
curl -i -H "X-Admin-Password: $ADMIN_PASSWORD" "$BACKEND_URL/api/admin/hello"
```

The unauthenticated admin request should return `401`. The request with the correct password should return the configured admin username as `principal`.

### Local admin testing

Run the backend locally with admin credentials:

```bash
export SEAMARG_ADMIN_USERNAME="local-admin"
export SEAMARG_ADMIN_PASSWORD="local-admin-password"
export SEAMARG_ADMIN_ROLE="ADMIN"

./gradlew :backend:bootRun
```

From another terminal:

```bash
curl -i http://localhost:8080/api/public/hello
curl -i http://localhost:8080/api/admin/hello
curl -i -H "X-Admin-Password: $SEAMARG_ADMIN_PASSWORD" http://localhost:8080/api/admin/hello
```

To rotate locally, stop the app, change any `SEAMARG_ADMIN_*` value, and start `./gradlew :backend:bootRun` again.

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
