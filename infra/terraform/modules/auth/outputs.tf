output "user_pool_id" {
  description = "Cognito user pool ID for customer authentication."
  value       = aws_cognito_user_pool.customers.id
}

output "user_pool_arn" {
  description = "Cognito user pool ARN for customer authentication."
  value       = aws_cognito_user_pool.customers.arn
}

output "app_client_id" {
  description = "Cognito app client ID for the frontend."
  value       = aws_cognito_user_pool_client.frontend.id
}

output "issuer_uri" {
  description = "Issuer URI to set as the backend COGNITO_ISSUER_URI value."
  value       = local.issuer_uri
}

output "jwks_uri" {
  description = "JWKS URI used by JWT validators."
  value       = "${local.issuer_uri}/.well-known/jwks.json"
}

output "domain_prefix" {
  description = "Cognito hosted UI domain prefix."
  value       = aws_cognito_user_pool_domain.customers.domain
}

output "hosted_ui_base_url" {
  description = "Cognito hosted UI base URL."
  value       = local.hosted_ui_base_url
}

output "callback_urls" {
  description = "Callback URLs registered with the Cognito frontend app client."
  value       = local.callback_urls
}

output "logout_urls" {
  description = "Logout URLs registered with the Cognito frontend app client."
  value       = local.logout_urls
}
