#!/usr/bin/env bash
set -euo pipefail
# Executar como root em Debian 12 amd64, com curl, ca-certificates e xz-utils.
test "$(id -u)" = 0
test "$(uname -m)" = x86_64
version=v24.19.0
archive="node-${version}-linux-x64.tar.xz"
workdir=$(mktemp -d)
cd "$workdir"
curl --fail --silent --show-error --location "https://nodejs.org/dist/${version}/SHASUMS256.txt" -o SHASUMS256.txt
curl --fail --silent --show-error --location "https://nodejs.org/dist/${version}/${archive}" -o "$archive"
grep "  ${archive}$" SHASUMS256.txt | sha256sum --check -
tar -xJf "$archive" -C /opt
ln -sfn "/opt/node-${version}-linux-x64/bin/node" /usr/local/bin/node
ln -sfn "/opt/node-${version}-linux-x64/bin/npm" /usr/local/bin/npm
ln -sfn "/opt/node-${version}-linux-x64/bin/npx" /usr/local/bin/npx
node --version
npm --version
