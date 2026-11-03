#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
cd /opt/setimoelemento-api
test -f dist/server.js
id setimo-api >/dev/null 2>&1 || useradd --system --user-group --no-create-home --shell /usr/sbin/nologin setimo-api
if [ ! -f .env ]; then
    test -f /root/setimoelemento-api.env
    node --input-type=module <<'NODE'
import fs from 'node:fs'
import crypto from 'node:crypto'
let text = fs.readFileSync('/root/setimoelemento-api.env', 'utf8')
const production = {
  NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3335',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'),
}
for (const [key, value] of Object.entries(production)) {
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  text = pattern.test(text) ? text.replace(pattern, `${key}=${value}`) : `${text}\n${key}=${value}\n`
}
fs.writeFileSync('.env', text, { mode: 0o640, flag: 'wx' })
NODE
fi
chown root:setimo-api .env
chmod 640 .env
install -o root -g root -m 644 deploy/setimoelemento-api.service /etc/systemd/system/setimoelemento-api.service
install -o root -g root -m 644 deploy/nginx.conf /etc/nginx/sites-available/setimoelemento-api
ln -sfn /etc/nginx/sites-available/setimoelemento-api /etc/nginx/sites-enabled/setimoelemento-api
nginx -t
systemctl daemon-reload
systemctl enable setimoelemento-api nginx
systemctl restart setimoelemento-api
systemctl reload nginx
for attempt in $(seq 1 20); do
    if curl --fail --silent http://127.0.0.1:3335/api; then
        printf '\nAPI iniciada.\n'
        exit 0
    fi
    sleep 1
done
journalctl -u setimoelemento-api -n 30 --no-pager
exit 1
