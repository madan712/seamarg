# Deployment Notes

GitHub Actions deploys components through `.github/workflows/deploy.yml`.

Manual inputs:

- `unlock_deploy`: must be checked before any deploy job runs.
- `target`: choose `backend`, `frontend`, `lambda`, `infra`, or `all`.
- `environment`: choose `dev`.
- `terraform_apply`: optionally apply Terraform before deploying.

Backend deployment runs on a single EC2 Docker host.

## Frontend Deployment

The frontend is hosted as static files in a private S3 bucket. CloudFront uses Origin Access Control to read from the bucket, and direct public S3 access is blocked.

For the first frontend deployment in an environment:

1. Open GitHub Actions.
2. Run the `Deploy` workflow.
3. Select `environment`, such as `dev`.
4. Select `target` as `frontend` or `all`.
5. Check `unlock_deploy`.
6. Check `terraform_apply`.

Terraform creates the frontend bucket and CloudFront distribution, then the pipeline builds `frontend/dist`, syncs it to S3, and creates a CloudFront invalidation. Later frontend-only deploys can leave `terraform_apply` unchecked unless infrastructure changed.

The frontend S3 bucket has Terraform `prevent_destroy` enabled because it stores deployed static files. If a Terraform plan wants to delete or replace this bucket, stop and check that the selected GitHub Environment and `AWS_REGION` match the environment where the bucket was originally created.

Required GitHub Environment or repository variables:

- `AWS_REGION`, for example `ap-south-1`.
- `TF_STATE_BUCKET`, for example `seamarg-terraform-state-695663959248-ap-south-1`.
- `AWS_ROLE_TO_ASSUME`, the GitHub Actions IAM role ARN from Terraform output.

## Cognito Auth Infrastructure

Terraform creates a Cognito user pool for customer authentication, a browser-safe frontend app client, and a hosted UI domain. The frontend CloudFront URL is registered as a callback and logout URL. The dev stack also registers `http://localhost:5173` for local frontend development.

To create or update only infrastructure, run the `Deploy` workflow with:

- `target`: `infra`
- `unlock_deploy`: checked
- `terraform_apply`: checked

After Terraform completes, read the backend issuer value:

```bash
terraform -chdir=infra/terraform/environments/dev output -raw cognito_issuer_uri
```

Set that value as the backend container's `COGNITO_ISSUER_URI` environment variable on the EC2 host.

## Backend EC2 Deployment

The dev backend host is:

```text
ec2-13-127-32-60.ap-south-1.compute.amazonaws.com
```

The server keeps backend runtime variables in `/opt/seamarg/backend.env`. Do not commit or print that file because it contains `SEAMARG_ADMIN_PASSWORD`.

Required GitHub Environment secret for backend CI/CD:

- `BACKEND_EC2_SSH_PRIVATE_KEY`: private SSH key that can connect to the backend EC2 host.

Optional GitHub Environment variables:

- `BACKEND_EC2_HOST`, defaults to `ec2-13-127-32-60.ap-south-1.compute.amazonaws.com`.
- `BACKEND_EC2_USER`, defaults to `ec2-user`.
- `BACKEND_EC2_REMOTE_ROOT`, defaults to `/opt/seamarg`.
- `BACKEND_EC2_SECURITY_GROUP_ID`, defaults to `sg-0edcb8bd177aa82d4`.

The backend job temporarily authorizes the GitHub Actions runner's public `/32` IP for SSH on the backend EC2 security group, deploys over SSH, and then revokes that rule. The GitHub Actions AWS role therefore needs `ec2:AuthorizeSecurityGroupIngress`, `ec2:DescribeSecurityGroups`, and `ec2:RevokeSecurityGroupIngress`.

To deploy from GitHub Actions, run the `Deploy` workflow with:

- `target`: `backend`
- `environment`: `dev`
- `unlock_deploy`: checked
- `terraform_apply`: unchecked unless infrastructure changed

To rebuild and restart the backend container manually:

```bash
scripts/deploy-backend-ec2.sh \
  ec2-user@ec2-13-127-32-60.ap-south-1.compute.amazonaws.com \
  /Users/madan.chaudhary/Downloads/Keys/MyWindowsKey.pem
```
