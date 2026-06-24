output "role_arn" {
  description = "GitHub Actions deployment role ARN, if created."
  value       = try(aws_iam_role.github_actions[0].arn, null)
}
