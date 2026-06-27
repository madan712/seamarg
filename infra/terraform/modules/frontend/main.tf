locals {
  name                   = "${var.project_name}-${var.environment}"
  bucket_name            = lower("${local.name}-frontend-${data.aws_caller_identity.current.account_id}")
  s3_origin_id           = "${local.name}-frontend-s3"
  api_origin_domain_name = trimspace(coalesce(var.backend_api_origin_domain_name, ""))
  api_origin_enabled     = local.api_origin_domain_name != ""
  api_origin_id          = "${local.name}-backend-api"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      CostCenter  = var.project_name
      ManagedBy   = "terraform"
      Component   = "frontend"
    },
    var.tags
  )

  # AWS managed cache policy: Managed-CachingOptimized.
  cloudfront_cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  # AWS managed cache policy: Managed-CachingDisabled.
  cloudfront_api_cache_policy_id = "4135ea2d-6df8-44a3-9df8-4b5a84be39ad"
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "frontend" {
  bucket        = local.bucket_name
  force_destroy = var.force_destroy_bucket

  lifecycle {
    prevent_destroy = true
  }

  tags = merge(local.common_tags, {
    Name = local.bucket_name
  })
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name}-frontend-oac"
  description                       = "Origin access control for ${local.name} frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_request_policy" "backend_api" {
  count = local.api_origin_enabled ? 1 : 0

  name    = "${local.name}-backend-api-origin-request"
  comment = "Forward viewer request details to the ${local.name} backend API"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "allViewer"
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.name} frontend"
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  wait_for_deployment = true

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
    origin_id                = local.s3_origin_id
  }

  dynamic "origin" {
    for_each = local.api_origin_enabled ? [local.api_origin_domain_name] : []

    content {
      domain_name = origin.value
      origin_id   = local.api_origin_id

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "http-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.cloudfront_cache_policy_id
    compress               = true
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
  }

  dynamic "ordered_cache_behavior" {
    for_each = local.api_origin_enabled ? [1] : []

    content {
      allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods           = ["GET", "HEAD", "OPTIONS"]
      cache_policy_id          = local.cloudfront_api_cache_policy_id
      compress                 = true
      origin_request_policy_id = aws_cloudfront_origin_request_policy.backend_api[0].id
      path_pattern             = "/api/*"
      target_origin_id         = local.api_origin_id
      viewer_protocol_policy   = "redirect-to-https"
    }
  }

  custom_error_response {
    error_caching_min_ttl = 0
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
  }

  custom_error_response {
    error_caching_min_ttl = 0
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-frontend"
  })

  depends_on = [
    aws_s3_bucket_ownership_controls.frontend,
    aws_s3_bucket_public_access_block.frontend,
    aws_s3_bucket_server_side_encryption_configuration.frontend
  ]
}

data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    sid    = "AllowCloudFrontReadOnly"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions = ["s3:GetObject"]

    resources = [
      "${aws_s3_bucket.frontend.arn}/*"
    ]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket.json
}
