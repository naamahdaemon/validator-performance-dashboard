#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${1:-/opt/mina-validator-performance}"
RUN_USER="${2:-$USER}"

cd "$REPO_DIR"

python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r exporter/requirements.txt

sudo cp systemd/mina-validator-performance.service /etc/systemd/system/mina-validator-performance.service
sudo cp systemd/mina-validator-performance.timer /etc/systemd/system/mina-validator-performance.timer
sudo sed -i "s/^User=REPLACE_WITH_LINUX_USER$/User=${RUN_USER}/" \
  /etc/systemd/system/mina-validator-performance.service

if [[ ! -f /etc/mina-validator-performance.env ]]; then
  sudo cp systemd/mina-validator-performance.env.example /etc/mina-validator-performance.env
  sudo chmod 600 /etc/mina-validator-performance.env
  echo
  echo "Created /etc/mina-validator-performance.env"
  echo "Edit it before enabling the timer."
fi

sudo systemctl daemon-reload

echo
echo "Installation prepared."
echo "Next:"
echo "  sudoedit /etc/mina-validator-performance.env"
echo "  sudo systemctl enable --now mina-validator-performance.timer"
