locals {
  namespace_labels = {
    "app.kubernetes.io/name"       = var.namespace
    "app.kubernetes.io/part-of"    = var.project_name
    "app.kubernetes.io/managed-by" = "terraform"
    "seamarg.io/environment"       = var.environment
    "seamarg.io/cost-center"       = var.project_name
  }

  backend_labels = {
    "app.kubernetes.io/name"       = "seamarg-backend"
    "app.kubernetes.io/part-of"    = var.project_name
    "app.kubernetes.io/managed-by" = "terraform"
    "seamarg.io/environment"       = var.environment
    "seamarg.io/cost-center"       = var.project_name
  }
}

resource "kubernetes_namespace_v1" "backend" {
  metadata {
    name   = var.namespace
    labels = local.namespace_labels
  }
}

resource "kubernetes_config_map_v1" "backend_config" {
  metadata {
    name      = var.config_map_name
    namespace = kubernetes_namespace_v1.backend.metadata[0].name
    labels    = local.backend_labels
  }

  data = {
    admin-username     = var.admin_username
    admin-role         = var.admin_role
    cognito-issuer-uri = var.cognito_issuer_uri
  }
}
