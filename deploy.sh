#!/bin/bash
set -e
set -o pipefail

REMOTE_USER="marty"
REMOTE_HOST="almanac.home"
REMOTE_DIR="/volume1/docker/kittybank"
IMAGE="kitty-bank"
TARBALL="${IMAGE}-amd64.tar.gz"

echo ""
echo "🏗️  Building image for AMD64..."
docker build --platform linux/amd64 -t "${IMAGE}:amd64" -t "${IMAGE}:latest" .

echo ""
echo "💾 Saving image..."
docker save "${IMAGE}:latest" | gzip > "$TARBALL"

echo ""
echo "📤 Transferring to NAS..."
rsync -av docker-compose.yml "$TARBALL" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo ""
echo "🚀 Deploying on NAS..."
ssh -t "${REMOTE_USER}@${REMOTE_HOST}" "cd ${REMOTE_DIR} && \
  sudo /usr/local/bin/docker-compose down && \
  gunzip -c $TARBALL | sudo /usr/local/bin/docker load && \
  sudo /usr/local/bin/docker-compose up -d && \
  sudo /usr/local/bin/docker-compose logs --tail=50"

echo "✅ Deployment complete!"