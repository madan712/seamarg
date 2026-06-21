variable "project_name" {
  description = "Project name used for frontend AWS resource names."
  type        = string
  default     = "seamarg"
}

variable "environment" {
  description = "Environment name for frontend resources."
  type        = string
}

variable "force_destroy_bucket" {
  description = "Allow Terraform to delete the frontend bucket even when it contains objects."
  type        = bool
  default     = false
}

variable "cloudfront_price_class" {
  description = "CloudFront price class for the frontend distribution."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.cloudfront_price_class)
    error_message = "cloudfront_price_class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

variable "tags" {
  description = "Additional tags for frontend resources."
  type        = map(string)
  default     = {}
}
