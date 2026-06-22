# Deployment Notes

GitHub Actions deploys components through `.github/workflows/deploy.yml`.

Manual inputs:

- `unlock_deploy`: must be checked before any deploy job runs.
- `target`: choose `backend`, `frontend`, `lambda`, `infra`, or `all`.
- `environment`: choose the GitHub Environment name.
- `terraform_apply`: optionally apply Terraform before deploying.

Use GitHub Environment protection rules for approvals before production deployments.

Backend deployment to AWS EKS is documented in `docs/aws-eks-backend-deployment.md`.

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

Required GitHub Environment or repository variables:

- `AWS_REGION`, for example `ap-south-1`.
- `TF_STATE_BUCKET`, for example `seamarg-terraform-state-695663959248-ap-south-1`.
- `AWS_ROLE_TO_ASSUME`, the GitHub Actions IAM role ARN from Terraform output.

## Cognito Auth Infrastructure

Terraform creates a Cognito user pool for customer authentication, a browser-safe frontend app client, and a hosted UI domain. The frontend CloudFront URL is registered as a callback and logout URL. Non-prod environments also register `http://localhost:5173` for local frontend development.

To create or update only infrastructure, run the `Deploy` workflow with:

- `target`: `infra`
- `unlock_deploy`: checked
- `terraform_apply`: checked

After Terraform completes, read the backend issuer value:

```bash
terraform -chdir=infra/terraform/environments/dev output -raw cognito_issuer_uri
```

Set that value in the backend Kubernetes ConfigMap as `COGNITO_ISSUER_URI`.
