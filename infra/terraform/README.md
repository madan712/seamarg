# Terraform

Terraform code is organized by environment and reusable module:

- `environments/dev`
- `modules/auth`
- `modules/frontend`
- `modules/github-actions`
- `modules/lambda`

The dev stack creates frontend hosting, customer auth, the deployment IAM role used by GitHub Actions, and placeholder Lambda infrastructure. EKS, ECR, and Kubernetes backend config are no longer managed here; the backend is moving to a single EC2 Docker host.
