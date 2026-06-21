# Deployment Notes

GitHub Actions deploys components through `.github/workflows/deploy.yml`.

Manual inputs:

- `unlock_deploy`: must be checked before any deploy job runs.
- `target`: choose `backend`, `frontend`, `lambda`, or `all`.
- `environment`: choose the GitHub Environment name.
- `terraform_apply`: optionally apply Terraform before deploying.

Use GitHub Environment protection rules for approvals before production deployments.

Backend deployment to AWS EKS is documented in `docs/aws-eks-backend-deployment.md`.
