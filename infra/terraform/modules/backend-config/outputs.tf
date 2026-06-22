output "namespace" {
  description = "Kubernetes namespace managed for the backend."
  value       = kubernetes_namespace_v1.backend.metadata[0].name
}

output "config_map_name" {
  description = "Backend runtime ConfigMap name."
  value       = kubernetes_config_map_v1.backend_config.metadata[0].name
}
