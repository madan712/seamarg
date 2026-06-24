#!/usr/bin/env bash
set -euo pipefail

ssh_host="${1:?Usage: deploy-backend-ec2.sh <ssh-host> <ssh-key> [remote-root]}"
ssh_key="${2:?Usage: deploy-backend-ec2.sh <ssh-host> <ssh-key> [remote-root]}"
remote_root="${3:-/opt/seamarg}"

image_name="${BACKEND_IMAGE_NAME:-seamarg-backend:latest}"
container_name="${BACKEND_CONTAINER_NAME:-seamarg-backend}"
host_port="${BACKEND_HOST_PORT:-80}"

archive="$(mktemp -t seamarg-backend-source.XXXXXX.tgz)"
cleanup() {
  rm -f "$archive"
}
trap cleanup EXIT

COPYFILE_DISABLE=1 tar -czf "$archive" \
  gradlew \
  gradle \
  settings.gradle \
  build.gradle \
  gradle.properties \
  backend/Dockerfile \
  backend/build.gradle \
  backend/settings.gradle \
  backend/src

ssh_opts=(
  -i "$ssh_key"
  -o StrictHostKeyChecking=accept-new
)

ssh "${ssh_opts[@]}" "$ssh_host" "sudo mkdir -p '$remote_root/source' && sudo chown -R ec2-user:ec2-user '$remote_root/source'"
scp "${ssh_opts[@]}" "$archive" "$ssh_host:/tmp/seamarg-backend-source.tgz"

ssh "${ssh_opts[@]}" "$ssh_host" bash -s -- "$remote_root" "$image_name" "$container_name" "$host_port" <<'REMOTE_SCRIPT'
set -euo pipefail

remote_root="$1"
image_name="$2"
container_name="$3"
host_port="$4"
env_file="$remote_root/backend.env"

if [[ ! -f "$env_file" ]]; then
  echo "Missing backend environment file: $env_file" >&2
  echo "Create it on the server with SEAMARG_ADMIN_PASSWORD and COGNITO_ISSUER_URI before deploying." >&2
  exit 1
fi

sudo rm -rf "$remote_root/source"
sudo mkdir -p "$remote_root/source"
sudo chown -R "$(id -un):$(id -gn)" "$remote_root/source"
tar -xzf /tmp/seamarg-backend-source.tgz -C "$remote_root/source"

cd "$remote_root/source"
sudo docker build -f backend/Dockerfile -t "$image_name" .
sudo docker rm -f "$container_name" >/dev/null 2>&1 || true
sudo docker run -d \
  --name "$container_name" \
  --restart unless-stopped \
  --env-file "$env_file" \
  -p "$host_port:8080" \
  "$image_name"

sudo docker ps --filter "name=$container_name" --format "{{.Names}} {{.Image}} {{.Status}} {{.Ports}}"
REMOTE_SCRIPT
