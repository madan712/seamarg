locals {
  name                 = "${var.project_name}-${var.environment}"
  frontend_domain_name = try(trimspace(coalesce(var.frontend_cloudfront_domain_name, "")), "")
  frontend_urls        = local.frontend_domain_name == "" ? [] : ["https://${local.frontend_domain_name}"]
  localhost_urls       = var.include_localhost_callback_urls ? var.localhost_callback_urls : []
  callback_urls        = distinct(concat(local.localhost_urls, local.frontend_urls, var.callback_urls))
  logout_urls          = distinct(concat(local.localhost_urls, local.frontend_urls, var.logout_urls))
  domain_prefix        = substr(replace(lower("${var.project_name}-${var.environment}-${data.aws_caller_identity.current.account_id}"), "/[^a-z0-9-]/", "-"), 0, 63)
  issuer_uri           = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.customers.id}"
  hosted_ui_base_url   = "https://${aws_cognito_user_pool_domain.customers.domain}.auth.${var.aws_region}.amazoncognito.com"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Component   = "auth"
    },
    var.tags
  )
}

data "aws_caller_identity" "current" {}

resource "aws_cognito_user_pool" "customers" {
  name = "${local.name}-customers"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = var.deletion_protection
  mfa_configuration        = var.mfa_configuration

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = !var.enable_self_registration
  }

  password_policy {
    minimum_length                   = var.password_minimum_length
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  software_token_mfa_configuration {
    enabled = var.mfa_configuration != "OFF"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-customers"
  })
}

resource "aws_cognito_user_pool_client" "frontend" {
  name         = "${local.name}-frontend"
  user_pool_id = aws_cognito_user_pool.customers.id

  generate_secret                      = false
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  callback_urls                        = local.callback_urls
  logout_urls                          = local.logout_urls
  supported_identity_providers         = ["COGNITO"]

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  access_token_validity  = var.access_token_validity_hours
  id_token_validity      = var.id_token_validity_hours
  refresh_token_validity = var.refresh_token_validity_days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "customers" {
  domain       = local.domain_prefix
  user_pool_id = aws_cognito_user_pool.customers.id
}
