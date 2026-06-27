locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      CostCenter  = var.project_name
      ManagedBy   = "terraform"
      Component   = "deployment"
    },
    var.tags
  )

  create_github_actions_role = var.github_repository_full_name != null || length(var.github_oidc_subjects) > 0
  existing_github_oidc_provider_arn = coalesce(
    var.github_oidc_provider_arn,
    "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
  )
  github_oidc_provider_arn   = var.create_github_oidc_provider ? try(aws_iam_openid_connect_provider.github_actions[0].arn, null) : local.existing_github_oidc_provider_arn
  github_repository_subjects = var.github_repository_full_name == null ? [] : ["repo:${var.github_repository_full_name}:environment:${var.environment}"]
  github_oidc_subjects       = length(var.github_oidc_subjects) > 0 ? var.github_oidc_subjects : local.github_repository_subjects
}

data "aws_caller_identity" "current" {}

data "tls_certificate" "github_actions" {
  count = local.create_github_actions_role && var.create_github_oidc_provider ? 1 : 0

  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  count = local.create_github_actions_role && var.create_github_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions[0].certificates[0].sha1_fingerprint]

  tags = merge(local.common_tags, {
    Name = "${local.name}-github-actions-oidc"
  })
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  count = local.create_github_actions_role ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_oidc_subjects
    }
  }
}

resource "aws_iam_role" "github_actions" {
  count = local.create_github_actions_role ? 1 : 0

  name               = "${local.name}-github-actions"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role[0].json
  tags               = local.common_tags
}

data "aws_iam_policy_document" "github_actions_permissions" {
  count = local.create_github_actions_role ? 1 : 0

  statement {
    effect = "Allow"
    actions = [
      "cloudfront:*",
      "cognito-idp:*",
      "dynamodb:*",
      "ec2:AuthorizeSecurityGroupIngress",
      "ec2:DescribeSecurityGroups",
      "ec2:RevokeSecurityGroupIngress",
      "iam:*",
      "s3:*",
      "sts:GetCallerIdentity"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_actions" {
  count = local.create_github_actions_role ? 1 : 0

  name   = "${local.name}-github-actions"
  role   = aws_iam_role.github_actions[0].id
  policy = data.aws_iam_policy_document.github_actions_permissions[0].json
}
