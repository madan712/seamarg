# Terraform

Terraform code is organized by environment and reusable module:

- `environments/dev`
- `environments/staging`
- `environments/prod`
- `modules/backend`
- `modules/frontend`
- `modules/lambda`

The backend module contains the starter ECR and EKS infrastructure. Frontend and Lambda modules remain placeholders until their hosting/runtime choices are finalized.

See `docs/aws-eks-backend-deployment.md` from the repository root for the bootstrap and deployment flow.
