#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
cd /opt/setimoelemento-api
git pull --ff-only
NODE_OPTIONS=--max-old-space-size=256 npm ci
NODE_OPTIONS=--max-old-space-size=256 npm run build
npm prune --omit=dev --omit=optional --ignore-scripts
install -o root -g root -m 644 deploy/setimoelemento-api.service /etc/systemd/system/setimoelemento-api.service
systemctl daemon-reload
systemctl restart setimoelemento-api
for attempt in $(seq 1 20); do
    if curl --fail --silent --max-time 10 http://127.0.0.1:3335/api/health; then
        printf '\nAPI e banco funcionando.\n'
        exit 0
    fi
    sleep 1
done
printf '\nFalha no teste de saude. Consulte journalctl -u setimoelemento-api.\n' >&2
exit 1
