data "aws_eks_cluster" "backend" {
  name = module.backend.eks_cluster_name

  depends_on = [
    module.backend
  ]
}

data "aws_eks_cluster_auth" "backend" {
  name = module.backend.eks_cluster_name

  depends_on = [
    module.backend
  ]
}

provider "kubernetes" {
  host                   = data.aws_eks_cluster.backend.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.backend.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.backend.token
}
