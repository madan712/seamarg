locals {
  name                  = "${var.project_name}-${var.environment}"
  documents_bucket_name = lower("${local.name}-certificates-${data.aws_caller_identity.current.account_id}")
  data_table_name       = "${local.name}-app-data"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      CostCenter  = var.project_name
      ManagedBy   = "terraform"
      Component   = "data"
    },
    var.tags
  )
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "documents" {
  bucket        = local.documents_bucket_name
  force_destroy = var.force_destroy_documents_bucket

  lifecycle {
    prevent_destroy = true
  }

  tags = merge(local.common_tags, {
    Name = local.documents_bucket_name
  })
}

resource "aws_s3_bucket_ownership_controls" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_dynamodb_table" "app_data" {
  name         = local.data_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "gsi1Pk"
    type = "S"
  }

  attribute {
    name = "gsi1Sk"
    type = "S"
  }

  global_secondary_index {
    name            = "gsi1"
    hash_key        = "gsi1Pk"
    range_key       = "gsi1Sk"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery_enabled
  }

  server_side_encryption {
    enabled = true
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = merge(local.common_tags, {
    Name = local.data_table_name
  })
}

data "aws_iam_policy_document" "backend_runtime" {
  statement {
    sid    = "AllowCertificateBucketAccess"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject"
    ]

    resources = [
      "${aws_s3_bucket.documents.arn}/*"
    ]
  }

  statement {
    sid    = "AllowCertificateBucketList"
    effect = "Allow"

    actions = [
      "s3:ListBucket"
    ]

    resources = [
      aws_s3_bucket.documents.arn
    ]
  }

  statement {
    sid    = "AllowAppDataTableAccess"
    effect = "Allow"

    actions = [
      "dynamodb:DeleteItem",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:UpdateItem"
    ]

    resources = [
      aws_dynamodb_table.app_data.arn,
      "${aws_dynamodb_table.app_data.arn}/index/*"
    ]
  }
}

resource "aws_iam_policy" "backend_runtime" {
  name        = "${local.name}-backend-runtime-data"
  description = "Allow the SeaMarg backend to read/write certificate documents and app data."
  policy      = data.aws_iam_policy_document.backend_runtime.json

  tags = local.common_tags
}
