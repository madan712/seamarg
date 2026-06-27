output "role_name" {
  description = "Backend EC2 runtime IAM role name."
  value       = aws_iam_role.backend_ec2.name
}

output "role_arn" {
  description = "Backend EC2 runtime IAM role ARN."
  value       = aws_iam_role.backend_ec2.arn
}

output "instance_profile_name" {
  description = "Backend EC2 runtime instance profile name."
  value       = aws_iam_instance_profile.backend_ec2.name
}

output "instance_profile_arn" {
  description = "Backend EC2 runtime instance profile ARN."
  value       = aws_iam_instance_profile.backend_ec2.arn
}
