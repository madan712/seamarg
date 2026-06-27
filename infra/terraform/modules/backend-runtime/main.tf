locals {
  name                  = "${var.project_name}-${var.environment}"
  role_name             = coalesce(var.backend_ec2_role_name, "${local.name}-backend-ec2")
  instance_profile_name = coalesce(var.backend_ec2_instance_profile_name, "${local.name}-backend-ec2")

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      CostCenter  = var.project_name
      ManagedBy   = "terraform"
      Component   = "backend-runtime"
    },
    var.tags
  )
}

data "aws_iam_policy_document" "backend_ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    effect  = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backend_ec2" {
  name               = local.role_name
  assume_role_policy = data.aws_iam_policy_document.backend_ec2_assume_role.json
  description        = "Runtime role for ${local.name} backend EC2 access to application data"
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "backend_runtime_data" {
  role       = aws_iam_role.backend_ec2.name
  policy_arn = var.backend_runtime_data_policy_arn
}

resource "aws_iam_instance_profile" "backend_ec2" {
  name = local.instance_profile_name
  role = aws_iam_role.backend_ec2.name
  tags = local.common_tags
}
