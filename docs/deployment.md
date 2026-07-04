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

The deployed frontend uses the same CloudFront origin for backend calls. CloudFront forwards `/api/*` to the dev backend EC2 origin, and the frontend build receives `VITE_API_BASE_URL` from Terraform output `frontend_api_base_url`. Do not point deployed browser builds directly at the raw HTTP EC2 URL, because HTTPS pages will block those requests as mixed content.

The frontend S3 bucket has Terraform `prevent_destroy` enabled because it stores deployed static files. If a Terraform plan wants to delete or replace this bucket, stop and check that the selected GitHub Environment and `AWS_REGION` match the environment where the bucket was originally created.

Required GitHub Environment or repository variables:

- `AWS_REGION`, for example `ap-south-1`.
- `TF_STATE_BUCKET`, for example `seamarg-terraform-state-695663959248-ap-south-1`.
- `AWS_ROLE_TO_ASSUME`, the GitHub Actions IAM role ARN from Terraform output.

## Cognito Auth Infrastructure

Terraform creates a Cognito user pool for customer authentication, a browser-safe frontend app client, and a hosted UI domain. The frontend CloudFront URL is registered as a callback and logout URL. The dev stack also registers `http://localhost:5173` for local frontend development.

The web frontend uses the browser-safe Cognito app client directly for sign-in, sign-up, email verification, and forgot-password flows. The client has no secret and is created by Terraform as the auth module's frontend app client. The frontend deployment workflow reads these Terraform outputs and injects them into the Vite build:

- `VITE_COGNITO_USER_POOL_ID` from `cognito_user_pool_id`
- `VITE_COGNITO_CLIENT_ID` from `cognito_app_client_id`
- `VITE_API_BASE_URL` from `frontend_api_base_url`

For local frontend development, create `frontend/.env.local` from `frontend/.env.example`; fill the Cognito values from Terraform and set `VITE_API_BASE_URL=http://localhost:8080` when running the backend locally:

```bash
terraform -chdir=infra/terraform/environments/dev output -raw cognito_user_pool_id
terraform -chdir=infra/terraform/environments/dev output -raw cognito_app_client_id
```

To create or update only infrastructure, run the `Deploy` workflow with:

- `target`: `infra`
- `unlock_deploy`: checked
- `terraform_apply`: checked

After Terraform completes, read the backend issuer, certificate storage names, and backend instance profile name:

```bash
terraform -chdir=infra/terraform/environments/dev output -raw cognito_issuer_uri
terraform -chdir=infra/terraform/environments/dev output -raw documents_bucket_name
terraform -chdir=infra/terraform/environments/dev output -raw app_data_table_name
terraform -chdir=infra/terraform/environments/dev output -raw backend_ec2_instance_profile_name
```

Set those values in the backend container env file on the EC2 host as `COGNITO_ISSUER_URI`, `SEAMARG_DOCUMENT_BUCKET`, and `SEAMARG_APP_DATA_TABLE`.

## Backend EC2 Deployment

The dev backend host is:

```text
ec2-65-1-132-40.ap-south-1.compute.amazonaws.com
```

The current public IPv4 address is `65.1.132.40`.

The server keeps backend runtime variables in `/opt/seamarg/backend.env`. Do not commit or print that file because it contains `SEAMARG_ADMIN_PASSWORD`.

The backend EC2 instance should have instance profile `seamarg-dev-backend-ec2`. Terraform manages that profile and role through `infra/terraform/modules/backend-runtime`, attaching the certificate S3/DynamoDB runtime policy. If the EC2 instance is replaced, attach this profile to the replacement instance rather than adding AWS access keys to the env file.

Required GitHub Environment secret for backend CI/CD:

- `BACKEND_EC2_SSH_PRIVATE_KEY`: private SSH key that can connect to the backend EC2 host.

Optional GitHub Environment variables:

- `BACKEND_EC2_HOST`, defaults to `ec2-65-1-132-40.ap-south-1.compute.amazonaws.com`.
- `BACKEND_EC2_USER`, defaults to `ec2-user`.
- `BACKEND_EC2_REMOTE_ROOT`, defaults to `/opt/seamarg`.
- `BACKEND_EC2_SECURITY_GROUP_ID`, defaults to `sg-0edcb8bd177aa82d4`.

The backend job temporarily authorizes the GitHub Actions runner's public `/32` IP for SSH on the backend EC2 security group, deploys over SSH, and then revokes that rule. The GitHub Actions AWS role therefore needs `ec2:AuthorizeSecurityGroupIngress`, `ec2:DescribeSecurityGroups`, and `ec2:RevokeSecurityGroupIngress`.

The job builds `backend/build/libs/seamarg-backend.jar` on the GitHub runner before opening SSH. `scripts/deploy-backend-ec2.sh` uploads that jar to EC2, builds a small runtime image there, restarts the container using the existing `/opt/seamarg/backend.env`, and waits for the local public endpoint to become ready before returning. The workflow public smoke test also retries briefly after deploy.

To deploy from GitHub Actions, run the `Deploy` workflow with:

- `target`: `backend`
- `environment`: `dev`
- `unlock_deploy`: checked
- `terraform_apply`: unchecked unless infrastructure changed

To rebuild and restart the backend container manually:

```bash
scripts/deploy-backend-ec2.sh \
  ec2-user@ec2-65-1-132-40.ap-south-1.compute.amazonaws.com \
  /Users/madan.chaudhary/Downloads/Keys/MyWindowsKey.pem
```
