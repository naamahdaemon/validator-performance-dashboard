# Mina Validator Performance

Static Mina validator-performance website backed by a periodic snapshot from a Mina archive PostgreSQL database.

## Architecture

```text
Mina Archive PostgreSQL
        |
        | exporter/query.sql
        v
exporter/export_validators.py
        |
        v
docs/data/validators.json
        |
        | git commit + push (only when validator data changes)
        v
GitHub repository
        |
        v
GitHub Pages
        |
        v
docs/index.html + docs/app.js + docs/style.css
```

The public site never connects to PostgreSQL. Only the generated JSON snapshot is published.

## Included query

- `exporter/query.grafana.sql` is the Grafana query used as the source.
- `exporter/query.sql` is the same query for the standalone exporter.
- The only functional difference is that the Grafana `${producer_wallet:raw}` variable is replaced with `NULL`, so the exporter returns every producer.

The snapshot includes the existing all-epoch metrics, current stake/delegators, the validator-name mapping from `public.validator_names`, last-block metadata, and `blocks_since_last_produced`.

## Web UI

The static interface includes:

- selectable pagination: **20, 30, 50, 100, 200 or 500 validators per page**, remembered locally
- persistent checkbox menu to show/hide columns (at least one stays visible)
- persistent filter to hide validators whose name is missing or blank
- totals across all filtered validators, not just the displayed page
- naamahdaemon copyright footer and a locally generated Naamah Stake delegation-address QR code
- dark/light mode, initially following the system preference and remembered locally
- all filters, sort column/direction and current page restored after refresh;
  Reset filters also clears saved filters (theme, page size and sort are kept)

- current epoch stake as a percentage of the full staking ledger and of active stake
- previous/current epoch block counts and their signed difference
- clickable MinaScan wallet links
- sorting on every displayed column
- validator/wallet search
- Mesa / pre-Mesa filtering
- last-block epoch filtering
- last-block date after/before
- minimum/maximum current stake
- minimum/maximum delegator count
- minimum/maximum blocks since last produced
- Grafana-like data bars
- current snapshot timestamp and archive height

Totals sum stakes, stake shares, delegators, canonical block counts and block
deltas. Stake variation percentages are recalculated from aggregated amounts,
not added together; absolute MINA deltas remain available in tooltips. Dates,
epochs and blocks-since-last are not summed. Missing values show a dash rather
than a partial total; inactive validators contribute zero to the active share.
Column visibility does not change the population used for totals or filtering,
and Reset filters preserves the selected columns.

### Stake shares and epoch production

The `Δ N→Live` column compares live stake directly with current ledger stake,
even when N+1 is unavailable. Its total is calculated from aggregate stakes.

### Local delegation simulation

The current-epoch pair **Sim. gross/net N (partial)** uses
`blocks_current_epoch_inclusive * 360 * added stake / (stake_current_epoch + added stake)`.
Its production count includes confirmed canonical blocks plus pending ancestors
of the archive-selected tip within the frontier. The new **Blocks N + frontier**
column appears next to the existing canonical-only current-epoch column and is
summed in filtered totals. The same stake input, local commissions, reset,
visibility preferences and theme highlights apply to both simulation pairs.
Current results are not extrapolated to a full epoch and may change with reorgs.
No value is shown until the updated SQL has produced a snapshot with the new
count. This is an inferred archive branch, not a daemon best-chain verification.

Enter additional MINA in **Stake to simulate** to compare alternative validators.
The input is capped at 200,000 MINA, including pasted and previously saved values.
This is a UI/model limit, not a statistical threshold for winning another block;
even below the cap the calculation keeps observed production fixed. The calculation
module also rejects amounts exceeding this cap.
Gross reward uses `canonical blocks N-1 * 360 * added stake / (stake N-1 + added stake)`;
net reward applies the editable commission. No additional blocks are assumed.
This is a hypothetical share of historical rewards, not an entitlement or forecast.
Only previous Mesa epochs are supported; pre-Mesa transition epochs show dashes.
Zero/missing validator stake, missing block counts or an empty input also show dashes.
Unknown commission leaves gross available but net unavailable. Simulations and
commissions are not summed, because each row places the same stake elsewhere.

`public.validator_names.commission_pct` is the source of commission percentages.
The SQL export reads it via `to_jsonb(vn)` so snapshots still work before the
column is installed (rates will be unknown). `exporter/import_commissions.py`
adds the column and imports 311 rates from the user-supplied MinaScan export
in `exporter/validator-commissions.json`. It preserves existing names, inserts
missing validators and updates supplied rates in one transaction. Re-running
reapplies those rates; rows absent from the file are untouched. This is not an
automatic MinaScan feed or a historical commission record.
Browser edits override the published database rate, are stored only in
`validator-commissions-v1` localStorage and never sent to the exporter. Clear a
commission to restore its source. **Reset filters** restores all database rates
from the loaded snapshot and empties the persisted simulation stake.

`docs/data/simulation-sources.json` contains Mesa 3 staking balances from repository snapshot
`0b67823`. The exporter carries labelled N-1 stake across subsequent epoch
rollovers using the previous published snapshot. If epochs are skipped or a
validator is absent from history, the browser uses current stake and prefixes
the result with **≈**. Tooltips identify the stake basis and epoch; commissions
remain current/source or local, never presumed historical. Results have two
decimal places and distinct theme-aware backgrounds (gross blue, net green).

After deploying the files, run this once on the server using a database role
allowed to alter/update `public.validator_names`. It reads the same PostgreSQL
settings as the exporter; no password is printed:

```bash
sudo bash -c 'set -a; source /etc/mina-validator-performance.env; set +a; exec /opt/validator-performance-dashboard/.venv/bin/python /opt/validator-performance-dashboard/exporter/import_commissions.py'
sudo systemctl start mina-validator-performance.service
```

The database migration/import has to be executed explicitly; the periodic export
does not mutate reference data. If the configured PGUSER lacks DDL privileges,
run the import with the table owner's database credentials instead.

### Network summary and production estimates

The snapshot summary shows the network epoch, the latest archived block's
zero-based slot within that epoch, current-epoch confirmed plus provisional blocks,
and slot fill rate (`100 * blocks / (slot + 1)`). The denominator includes the
tip slot; it is not the full epoch length or a live wall-clock slot. These metrics
are calculated across the archive independently of dashboard filters.
Provisional blocks are pending ancestors on the archive-selected tip branch
within the configured frontier depth. This is an archive inference, not a daemon
best-chain confirmation; forks may revise it. Hover over the block count for the
confirmed/provisional breakdown. Table production metrics remain canonical-only.
New summary values require a regenerated snapshot; older snapshots show dashes.

The browser also calculates two sortable, hideable full-Mesa-epoch estimates:
`expected_blocks_epoch = 7140 * 0.75 * stake_current_epoch / total_stake_current_epoch`
and `expected_coinbase_epoch = expected_blocks_epoch * 360` MINA. These use the
whole current staking ledger, never the filtered table or the active-stake share.
Filtered totals sum unrounded estimates. Missing stakes or an invalid denominator
display a dash. N+1 availability does not affect these estimates.

This is a proportional approximation of canonical production using the theoretical
75% slot fill rate, not the exact VRF slot-winning probability. Offline stake,
missed slots and competing blocks affect actual production. Estimates cover a full
epoch and must not be treated as a performance score against partial Blocks N.
Coinbase is gross, excluding transaction fees, costs and delegation payouts.
References: [MinaExplorer production methodology](https://docs.minaexplorer.com/staking-pool/performance-history)
and [Mesa slot/coinbase change](https://forums.minaprotocol.com/t/reduce-slot-time-to-90s/6865).

`stake_current_pct` divides the validator's stake in the current staking ledger N
by the total MINA stake in that same ledger (including recipients outside the
displayed producer list). It replaces the former live/archive-based Stake % column.
The original `delegated_stake_pct` remains available in the JSON.

`stake_active_pct` uses the same numerator but only includes validators that
produced at least one canonical block in the previous or current epoch in its
denominator. Inactive validators display a dash. This is an observed activity
definition, not a protocol guarantee of online status. Both denominators are
computed on the full export, independently of browser filters and pagination;
their amounts are published in `ledger_meta`.

The two epoch counters and the all-time Blocks column include only blocks with
`chain_status = 'canonical'`. Pending blocks (including those on the selected tip
branch) and orphaned blocks are excluded. The all-time column uses the existing
`canonical_blocks_all_epochs` field; `total_blocks_all_epochs` remains the raw
all-status archive count in JSON for compatibility. Epochs are derived from the archive tip and the existing pre-Mesa /
Mesa slot constants, not from each validator's most recent block. The previous
window handles the Mesa transition. The signed delta is current-epoch production
so far minus the complete previous epoch, not a normalized performance forecast.
Snapshots declare `ledger_meta.block_count_basis = "canonical"`; until a new
export is available, the UI hides old all-status epoch counts and active shares.

After deploying the sources, run `sudo systemctl start mina-validator-performance.service`
to regenerate the snapshot. Missing metrics in older snapshots display a dash.
No new environment variables or dependencies are required for these UI and metric additions.

The next-epoch ledger is optional during export. If its command fails, times out,
or returns invalid JSON (including during transition-frontier recovery), the
snapshot still updates current stake, live stake and block metrics. N+1 stake,
N+1 delegators and both dependent stake deltas are `null`, displayed as a dash;
old ledger values are never reused. `ledger_meta.next_ledger_available` records
availability, and a warning with diagnostic details is written to the service
logs. The next scheduled run retries automatically. Failures fetching the current
staking ledger or querying the archive still stop publication.

## 1. Create the GitHub repository

Create a repository, for example:

```text
mina-validator-performance
```

Clone it on the archive node:

```bash
sudo mkdir -p /opt/mina-validator-performance
sudo chown "$USER":"$USER" /opt/mina-validator-performance

git clone git@github.com:YOUR_GITHUB_USER/mina-validator-performance.git \
  /opt/mina-validator-performance
```

Copy the content of this package into that clone, then:

```bash
cd /opt/mina-validator-performance
git add .
git commit -m "Initial validator performance site"
git push
```

## 2. GitHub authentication from the archive node

A repository-scoped writable Deploy Key is recommended.

Generate it on the archive node:

```bash
ssh-keygen -t ed25519 \
  -f ~/.ssh/mina-validator-pages \
  -C "mina-validator-performance"
```

In GitHub:

```text
Repository
→ Settings
→ Deploy keys
→ Add deploy key
→ Allow write access
```

Add the generated `.pub` file.

Test:

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/mina-validator-pages -o IdentitiesOnly=yes' \
git -C /opt/mina-validator-performance pull
```

## 3. Python environment

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y python3 python3-venv git

cd /opt/mina-validator-performance

python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r exporter/requirements.txt
```

## 4. PostgreSQL configuration

Create:

```text
/etc/mina-validator-performance.env
```

from:

```text
systemd/mina-validator-performance.env.example
```

Example:

```ini
PGHOST=127.0.0.1
PGPORT=26432
PGDATABASE=archive
PGUSER=archive
PGPASSWORD=YOUR_ARCHIVE_PASSWORD
PGSTATEMENT_TIMEOUT=8min
PGCONNECT_TIMEOUT=10
REPO_DIR=/opt/mina-validator-performance
GIT_SSH_COMMAND=ssh -i /home/YOUR_USER/.ssh/mina-validator-pages -o IdentitiesOnly=yes
```

Protect it:

```bash
sudo chown root:root /etc/mina-validator-performance.env
sudo chmod 600 /etc/mina-validator-performance.env
```

## 5. Test the exporter manually

```bash
cd /opt/mina-validator-performance

set -a
source /etc/mina-validator-performance.env
set +a

.venv/bin/python exporter/export_validators.py \
  --query exporter/query.sql \
  --output docs/data/validators.json
```

Inspect:

```bash
jq '.generated_at, .validator_count, .archive_height, .validators[0]' \
  docs/data/validators.json
```

## 6. Test publication

```bash
cd /opt/mina-validator-performance

set -a
source /etc/mina-validator-performance.env
set +a

./scripts/publish.sh
```

The publisher:

1. takes a lock to prevent overlapping executions;
2. runs `git pull --rebase`;
3. executes the archive query;
4. writes the JSON atomically;
5. does nothing when validator data did not change;
6. otherwise commits only `docs/data/validators.json`;
7. pushes to GitHub.

## 7. Install systemd timer

Edit the service and replace:

```text
REPLACE_WITH_LINUX_USER
```

with the Linux account owning the repository and SSH deploy key.

Then:

```bash
sudo cp systemd/mina-validator-performance.service /etc/systemd/system/
sudo cp systemd/mina-validator-performance.timer /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now mina-validator-performance.timer
```

Check:

```bash
systemctl status mina-validator-performance.timer
systemctl list-timers mina-validator-performance.timer
```

Run immediately:

```bash
sudo systemctl start mina-validator-performance.service
```

Logs:

```bash
journalctl -u mina-validator-performance.service -n 100 --no-pager
```

Follow logs:

```bash
journalctl -fu mina-validator-performance.service
```

The supplied timer runs every **10 minutes**.

To change it, edit:

```ini
OnUnitActiveSec=10min
```

then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart mina-validator-performance.timer
```

## 8. Enable GitHub Pages

The simplest configuration is:

```text
Repository
→ Settings
→ Pages
→ Build and deployment
→ Source: Deploy from a branch
→ Branch: main
→ Folder: /docs
```

The site will then be available at a URL similar to:

```text
https://YOUR_GITHUB_USER.github.io/mina-validator-performance/
```

## Security model

Public:

- HTML / JavaScript / CSS
- `validators.json`
- validator statistics already selected by the query

Private on the archive node:

- PostgreSQL
- PostgreSQL password
- SSH private deploy key

Never commit `/etc/mina-validator-performance.env` or the SSH private key.

## Performance

The SQL intentionally stays close to the existing Grafana all-epochs query. That means it may be relatively expensive because it classifies historical blocks and computes current delegated stake.

The service therefore defaults to a 10-minute refresh and sets an 8-minute PostgreSQL statement timeout.

If execution becomes too expensive as the archive grows, the next optimization step should be database-side pre-aggregation/materialized views rather than increasing website complexity.
