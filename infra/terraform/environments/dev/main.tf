module "frontend" {
  source = "../../modules/frontend"

  project_name                   = var.project_name
  environment                    = var.environment
  backend_api_origin_domain_name = var.backend_api_origin_domain_name
}

module "github_actions" {
  source = "../../modules/github-actions"

  project_name                = var.project_name
  environment                 = var.environment
  github_repository_full_name = var.github_repository_full_name
  github_oidc_subjects        = var.github_oidc_subjects
  create_github_oidc_provider = var.create_github_oidc_provider
  github_oidc_provider_arn    = var.github_oidc_provider_arn
}

module "auth" {
  source = "../../modules/auth"

  project_name                    = var.project_name
  environment                     = var.environment
  aws_region                      = var.aws_region
  frontend_cloudfront_domain_name = module.frontend.cloudfront_domain_name
  include_localhost_callback_urls = true
}

module "data" {
  source = "../../modules/data"

  project_name = var.project_name
  environment  = var.environment
}

module "lambda" {
  source      = "../../modules/lambda"
  environment = var.environment
}
