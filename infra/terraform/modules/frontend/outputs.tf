output "name" {
  description = "Frontend module name."
  value       = "${var.project_name}-frontend-${var.environment}"
}

output "bucket_name" {
  description = "Private S3 bucket that stores built frontend assets."
  value       = aws_s3_bucket.frontend.bucket
}

output "bucket_arn" {
  description = "Frontend S3 bucket ARN."
  value       = aws_s3_bucket.frontend.arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for frontend hosting."
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN for frontend hosting."
  value       = aws_cloudfront_distribution.frontend.arn
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name for accessing the frontend."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "cloudfront_hosted_zone_id" {
  description = "CloudFront hosted zone ID for a future Route 53 alias record."
  value       = aws_cloudfront_distribution.frontend.hosted_zone_id
}
