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
  description = "Allow Terraform to empty the frontend bucket during deletion. The bucket resource still has prevent_destroy enabled."
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

variable "backend_api_origin_domain_name" {
  description = "Optional backend API origin domain name for CloudFront /api/* proxying. Use the domain only, without http:// or a path."
  type        = string
  default     = null

  validation {
    condition = var.backend_api_origin_domain_name == null ? true : (
      trimspace(var.backend_api_origin_domain_name) == "" ||
      can(regex("^[^/:]+$", trimspace(var.backend_api_origin_domain_name)))
    )
    error_message = "backend_api_origin_domain_name must be a domain name only, for example ec2-13-233-83-132.ap-south-1.compute.amazonaws.com."
  }
}

variable "tags" {
  description = "Additional tags for frontend resources."
  type        = map(string)
  default     = {}
}
