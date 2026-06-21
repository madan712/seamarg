module "backend" {
  source = "../../modules/backend"

  project_name                = var.project_name
  environment                 = var.environment
  aws_region                  = var.aws_region
  github_repository_full_name = var.github_repository_full_name
  github_oidc_subjects        = var.github_oidc_subjects
  create_github_oidc_provider = var.create_github_oidc_provider
  github_oidc_provider_arn    = var.github_oidc_provider_arn
}

module "frontend" {
  source      = "../../modules/frontend"
  environment = var.environment
}

module "lambda" {
  source      = "../../modules/lambda"
  environment = var.environment
}
