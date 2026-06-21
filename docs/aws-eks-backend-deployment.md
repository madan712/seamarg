# AWS EKS Backend Deployment

This repo can deploy the Spring Boot backend to AWS EKS with Terraform-managed infrastructure and GitHub Actions.

The starter infrastructure creates:

- ECR repository for backend container images.
- VPC with public subnets for a low-friction starter EKS setup.
- EKS cluster with a managed node group.
- Kubernetes `Deployment` and `LoadBalancer` `Service` for the backend.
- Optional GitHub Actions OIDC deployment role for short-lived AWS credentials.

This setup creates paid AWS resources, including EKS, EC2 nodes, ECR storage, and a load balancer.

## 1. Create Terraform state storage

Create this once in your AWS account. Replace the bucket name with a globally unique value.

```bash
export AWS_REGION=eu-west-2
export TF_STATE_BUCKET=seamarg-terraform-state-<your-suffix>

aws s3api create-bucket \
  --bucket "$TF_STATE_BUCKET" \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

aws s3api put-bucket-versioning \
  --bucket "$TF_STATE_BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$TF_STATE_BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

## 2. Bootstrap GitHub OIDC

If your AWS account already has an IAM OIDC provider for `https://token.actions.githubusercontent.com`, skip this step.

```bash
terraform -chdir=infra/terraform/bootstrap/github-oidc init \
  -backend-config="bucket=$TF_STATE_BUCKET" \
  -backend-config="key=seamarg/bootstrap/github-oidc.tfstate" \
  -backend-config="region=$AWS_REGION"

terraform -chdir=infra/terraform/bootstrap/github-oidc apply
```

## 3. Create the dev backend infrastructure

Replace `OWNER/REPO` with your GitHub repository, for example `madanchaudhary/seamarg`.

```bash
terraform -chdir=infra/terraform/environments/dev init \
  -backend-config="bucket=$TF_STATE_BUCKET" \
  -backend-config="key=seamarg/dev/terraform.tfstate" \
  -backend-config="region=$AWS_REGION"

terraform -chdir=infra/terraform/environments/dev apply \
  -var="github_repository_full_name=OWNER/REPO"
```

Capture the role ARN for GitHub Actions:

```bash
terraform -chdir=infra/terraform/environments/dev output -raw github_actions_role_arn
```

## 4. Configure GitHub

In your GitHub repository, create an Environment named `dev`.

Add these GitHub Environment variables:

- `AWS_REGION`: `eu-west-2`
- `AWS_ROLE_TO_ASSUME`: output from `github_actions_role_arn`
- `TF_STATE_BUCKET`: your Terraform state bucket

Repeat with `staging` and `prod` when you create those environments.

## 5. Deploy from GitHub Actions

Run `.github/workflows/deploy.yml` manually:

- `unlock_deploy`: checked
- `target`: `backend`
- `environment`: `dev`
- `terraform_apply`: `false` for app-only deploys, `true` when infrastructure changed

The backend job builds the Spring Boot jar, builds a Docker image, pushes it to ECR, updates kubeconfig, applies `k8s/backend`, and waits for the rollout.

## 6. Check the endpoint

After deployment, get the load balancer hostname:

```bash
aws eks update-kubeconfig --region "$AWS_REGION" --name seamarg-dev-eks
kubectl -n seamarg get service seamarg-backend
```

Then call:

```bash
curl http://<load-balancer-hostname>/api/hello
```

Expected response:

```json
{"message":"Hello from seamarg backend"}
```

## Notes

The current EKS networking is intentionally simple and uses public subnets to avoid NAT gateway cost and complexity during early development. For production, move worker nodes to private subnets, add NAT or VPC endpoints, tighten cluster endpoint access, and consider an ingress controller plus TLS instead of exposing the service directly as a load balancer.
