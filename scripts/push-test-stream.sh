#!/usr/bin/env bash
# Push a synthetic video test pattern to MediaMTX.
#
# Usage:
#   ./scripts/push-test-stream.sh [cam_id] [mediamtx_host]
#
# Defaults:
#   cam_id        = cam01
#   mediamtx_host = localhost
#
# Requires: ffmpeg (available in the ingestion container or host)
#
# Once running, the ingestion service can consume the stream at:
#   rtsp://<mediamtx_host>:8554/<cam_id>
set -euo pipefail

CAM_ID="${1:-cam01}"
MEDIAMTX_HOST="${2:-localhost}"
RTSP_URL="rtsp://${MEDIAMTX_HOST}:8554/${CAM_ID}"

echo "Pushing test pattern to ${RTSP_URL}  (Ctrl-C to stop)"

exec ffmpeg \
  -re \
  -f lavfi -i "testsrc=size=1280x720:rate=25,drawtext=text='${CAM_ID} %{localtime}':fontsize=32:fontcolor=white:x=10:y=10" \
  -f lavfi -i "sine=frequency=440:sample_rate=44100" \
  -c:v libx264 -preset ultrafast -tune zerolatency -g 50 -b:v 1M \
  -c:a aac -b:a 64k \
  -f rtsp \
  -rtsp_transport tcp \
  "${RTSP_URL}"
