# Terraform

Terraform code is organized by environment and reusable module:

- `environments/dev`
- `environments/staging`
- `environments/prod`
- `modules/backend`
- `modules/frontend`
- `modules/lambda`

The backend module contains the starter ECR and EKS infrastructure. The frontend module creates a private S3 bucket, CloudFront distribution, Origin Access Control, and the bucket policy that allows only that CloudFront distribution to read static files. The Lambda module remains a placeholder until runtime choices are finalized.

See `docs/aws-eks-backend-deployment.md` from the repository root for the bootstrap and deployment flow.
