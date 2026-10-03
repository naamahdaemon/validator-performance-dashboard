# Upgrade: current / next / live stake

From `/opt/validator-performance-dashboard`, copy the update files over the repository.

Add to `/etc/mina-validator-performance.env`:

```ini
MINA_DAEMON_CONTAINER=mainnet-daemon
DOCKER_BIN=/usr/bin/docker
MINA_LEDGER_EXPORT_TIMEOUT=120
MINA_DEFAULT_TOKEN_ID=wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf
```

Test manually:

```bash
cd /opt/validator-performance-dashboard

set -a
source /etc/mina-validator-performance.env
set +a

.venv/bin/python exporter/export_validators.py \
  --query exporter/query.sql \
  --output docs/data/validators.json
```

Inspect:

```bash
jq '.ledger_meta,
    (.validators[0] | {
      validator_name,
      wallet_address,
      stake_current_epoch,
      stake_next_epoch,
      stake_live_estimate,
      stake_next_delta,
      stake_next_delta_pct,
      stake_live_delta,
      stake_live_delta_pct
    })' docs/data/validators.json
```

If correct:

```bash
git add exporter/export_validators.py docs/index.html docs/app.js docs/style.css
git commit -m "Add current, next and live stake estimates"
git push

sudo systemctl start mina-validator-performance.service
```
