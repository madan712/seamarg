import {
  to = module.backend_runtime.aws_iam_role.backend_ec2
  id = "seamarg-dev-backend-ec2"
}

import {
  to = module.backend_runtime.aws_iam_role_policy_attachment.backend_runtime_data
  id = "seamarg-dev-backend-ec2/arn:aws:iam::695663959248:policy/seamarg-dev-backend-runtime-data"
}

import {
  to = module.backend_runtime.aws_iam_instance_profile.backend_ec2
  id = "seamarg-dev-backend-ec2"
}
