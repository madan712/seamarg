#!/usr/bin/env bash
set -euo pipefail

ssh_host="${1:?Usage: deploy-backend-ec2.sh <ssh-host> <ssh-key> [remote-root]}"
ssh_key="${2:?Usage: deploy-backend-ec2.sh <ssh-host> <ssh-key> [remote-root]}"
remote_root="${3:-/opt/seamarg}"

image_name="${BACKEND_IMAGE_NAME:-seamarg-backend:latest}"
container_name="${BACKEND_CONTAINER_NAME:-seamarg-backend}"
host_port="${BACKEND_HOST_PORT:-80}"
backend_jar="${BACKEND_JAR:-backend/build/libs/seamarg-backend.jar}"

archive_dir="$(mktemp -d -t seamarg-backend-release.XXXXXX)"
archive="$(mktemp -t seamarg-backend-release.XXXXXX.tgz)"
cleanup() {
  rm -rf "$archive_dir"
  rm -f "$archive"
}
trap cleanup EXIT

if [[ ! -f "$backend_jar" ]]; then
  ./gradlew :backend:bootJar --no-daemon
fi

cp "$backend_jar" "$archive_dir/app.jar"
cat > "$archive_dir/Dockerfile" <<'DOCKERFILE'
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

RUN addgroup -S seamarg && adduser -S seamarg -G seamarg

COPY app.jar app.jar

USER seamarg
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
DOCKERFILE

if command -v xattr >/dev/null 2>&1; then
  xattr -c "$archive_dir/Dockerfile" "$archive_dir/app.jar" 2>/dev/null || true
fi

COPYFILE_DISABLE=1 tar -czf "$archive" -C "$archive_dir" Dockerfile app.jar

ssh_opts=(
  -i "$ssh_key"
  -o BatchMode=yes
  -o ConnectTimeout=30
  -o ConnectionAttempts=3
  -o StrictHostKeyChecking=accept-new
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=20
  -o TCPKeepAlive=yes
)

scp "${ssh_opts[@]}" "$archive" "$ssh_host:/tmp/seamarg-backend-release.tgz"

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

sudo rm -rf "$remote_root/release"
sudo mkdir -p "$remote_root/release"
sudo chown -R "$(id -un):$(id -gn)" "$remote_root/release"
tar -xzf /tmp/seamarg-backend-release.tgz -C "$remote_root/release"
rm -f /tmp/seamarg-backend-release.tgz

cd "$remote_root/release"
sudo docker build -t "$image_name" .
sudo docker rm -f "$container_name" >/dev/null 2>&1 || true
sudo docker run -d \
  --name "$container_name" \
  --restart unless-stopped \
  --env-file "$env_file" \
  -p "$host_port:8080" \
  "$image_name"

sudo docker ps --filter "name=$container_name" --format "{{.Names}} {{.Image}} {{.Status}} {{.Ports}}"
REMOTE_SCRIPT
