output "documents_bucket_name" {
  description = "Private S3 bucket for uploaded certificate and document files."
  value       = aws_s3_bucket.documents.bucket
}

output "documents_bucket_arn" {
  description = "ARN of the private documents bucket."
  value       = aws_s3_bucket.documents.arn
}

output "app_data_table_name" {
  description = "Generic DynamoDB table name for backend application records."
  value       = aws_dynamodb_table.app_data.name
}

output "app_data_table_arn" {
  description = "ARN of the generic backend application data table."
  value       = aws_dynamodb_table.app_data.arn
}

output "backend_runtime_policy_arn" {
  description = "IAM policy ARN to attach to the backend runtime role or EC2 instance profile."
  value       = aws_iam_policy.backend_runtime.arn
}
