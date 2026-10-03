#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras


DEFAULT_MINA_TOKEN_ID = os.environ.get(
    "MINA_DEFAULT_TOKEN_ID",
    "wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf",
)


def json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: json_value(value) for key, value in row.items()}


def load_previous(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(tmp, path)


def archive_height_from_rows(rows: list[dict[str, Any]]) -> int | None:
    heights: list[int] = []
    for row in rows:
        last_height = row.get("last_block_height")
        gap = row.get("blocks_since_last_produced")
        if isinstance(last_height, int) and isinstance(gap, int):
            heights.append(last_height + gap)
    return max(heights) if heights else None


def export_ledger(kind: str) -> list[dict[str, Any]]:
    docker_bin = os.environ.get("DOCKER_BIN", "/usr/bin/docker")
    container = os.environ.get("MINA_DAEMON_CONTAINER", "mainnet-daemon")

    cmd = [
        docker_bin, "exec", container,
        "mina", "ledger", "export", kind,
    ]

    try:
        result = subprocess.run(
            cmd,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=int(os.environ.get("MINA_LEDGER_EXPORT_TIMEOUT", "120")),
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"{kind} export timed out") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"{kind} export failed (exit {exc.returncode}): "
            f"{(exc.stderr or exc.stdout or 'no diagnostic output').strip()[:2000]}"
        ) from exc

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{kind} returned invalid JSON") from exc

    if not isinstance(payload, list):
        raise RuntimeError(f"{kind} returned {type(payload).__name__}, expected list")

    return payload


def aggregate_ledger(
    accounts: list[dict[str, Any]],
) -> tuple[dict[str, Decimal], dict[str, int]]:
    stake: dict[str, Decimal] = defaultdict(Decimal)
    delegators: dict[str, int] = defaultdict(int)

    for account in accounts:
        if account.get("token") != DEFAULT_MINA_TOKEN_ID:
            continue

        pk = account.get("pk")
        delegate = account.get("delegate") or pk
        if not delegate:
            continue

        try:
            balance = Decimal(str(account.get("balance") or "0"))
        except (InvalidOperation, ValueError):
            continue

        if balance <= 0:
            continue

        stake[delegate] += balance

        if pk and pk != delegate:
            delegators[delegate] += 1

    return dict(stake), dict(delegators)


def pct_change(new: Decimal, old: Decimal) -> float | None:
    if old == 0:
        return None
    return float(((new - old) / old) * Decimal("100"))


def enrich_with_consensus_ledgers(rows: list[dict[str, Any]]) -> dict[str, Any]:
    staking_accounts = export_ledger("staking-epoch-ledger")
    # N+1 can be unavailable during transition-frontier recovery. Never reuse
    # an old ledger: it could belong to a different epoch.
    try:
        next_accounts = export_ledger("next-epoch-ledger")
    except (RuntimeError, OSError) as exc:
        print(f"WARNING: N+1 ledger unavailable; publishing other metrics. {exc}", file=sys.stderr)
        next_accounts = None

    stake_n, delegators_n = aggregate_ledger(staking_accounts)
    stake_n1, delegators_n1 = aggregate_ledger(next_accounts or [])

    total_stake = sum(stake_n.values(), Decimal("0"))
    active_wallets = {
        str(row["wallet_address"]) for row in rows
        if (row.get("blocks_previous_epoch") or 0) > 0
        or (row.get("blocks_current_epoch") or 0) > 0
    }
    active_stake = sum((stake_n.get(wallet, Decimal("0")) for wallet in active_wallets), Decimal("0"))

    for row in rows:
        wallet = str(row.get("wallet_address") or "")

        current = stake_n.get(wallet, Decimal("0"))
        nxt = stake_n1.get(wallet, Decimal("0")) if next_accounts is not None else None
        live = Decimal(str(row.get("current_stake") or 0))

        row["stake_current_epoch"] = float(current)
        row["stake_current_pct"] = float(current / total_stake * 100) if total_stake else None
        row["is_active_validator"] = wallet in active_wallets
        row["stake_active_pct"] = (
            float(current / active_stake * 100) if wallet in active_wallets and active_stake else None
        )
        row["stake_next_epoch"] = float(nxt) if nxt is not None else None
        row["stake_live_estimate"] = float(live)

        row["stake_next_delta"] = float(nxt - current) if nxt is not None else None
        row["stake_next_delta_pct"] = pct_change(nxt, current) if nxt is not None else None

        row["stake_live_delta"] = float(live - nxt) if nxt is not None else None
        row["stake_live_delta_pct"] = pct_change(live, nxt) if nxt is not None else None

        row["delegators_current_epoch"] = delegators_n.get(wallet, 0)
        row["delegators_next_epoch"] = delegators_n1.get(wallet, 0) if nxt is not None else None

    return {
        "staking_ledger_accounts": len(staking_accounts),
        "next_ledger_available": next_accounts is not None,
        "next_ledger_accounts": len(next_accounts) if next_accounts is not None else None,
        "staking_validators": len(stake_n),
        "next_validators": len(stake_n1) if next_accounts is not None else None,
        "total_stake_current_epoch": float(total_stake),
        "active_stake_current_epoch": float(active_stake),
        "active_validator_count": len(active_wallets),
        "block_count_basis": "canonical",
        "active_definition": "Produced at least one canonical block in the previous or current epoch",
    }


def preserve_previous_stake(rows: list[dict[str, Any]], previous: dict[str, Any] | None) -> None:
    """Carry epoch-labelled stakes across snapshots, never assume an old row is N-1."""
    old_rows = {r["wallet_address"]: r for r in (previous or {}).get("validators", [])}
    for row in rows:
        old = old_rows.get(row["wallet_address"], {})
        target = row.get("previous_epoch_label")
        value = None
        if target and old.get("network_epoch_label") == target:
            value = old.get("stake_current_epoch")
        elif target and old.get("stake_previous_epoch_label") == target:
            value = old.get("stake_previous_epoch")
        row["stake_previous_epoch"] = value
        row["stake_previous_epoch_label"] = target if value is not None else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--query",
        default=str(Path(__file__).with_name("query.sql")),
    )
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    sql = Path(args.query).read_text(encoding="utf-8")
    output_path = Path(args.output)

    db = {
        "host": os.environ.get("PGHOST", "127.0.0.1"),
        "port": int(os.environ.get("PGPORT", "26432")),
        "dbname": os.environ.get("PGDATABASE", "archive"),
        "user": os.environ.get("PGUSER", "archive"),
        "password": os.environ.get("PGPASSWORD"),
        "connect_timeout": int(os.environ.get("PGCONNECT_TIMEOUT", "10")),
        "application_name": "mina-validator-performance-exporter",
    }

    if not db["password"]:
        print("ERROR: PGPASSWORD is not set.", file=sys.stderr)
        return 2

    with psycopg2.connect(**db) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SET statement_timeout = %s",
                (os.environ.get("PGSTATEMENT_TIMEOUT", "8min"),),
            )
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            rows = [normalize_row(dict(row)) for row in cur.fetchall()]

    ledger_meta = enrich_with_consensus_ledgers(rows)

    rows.sort(
        key=lambda r: (
            -(float(r.get("stake_live_estimate") or 0)),
            -(float(r.get("delegated_stake_pct") or 0)),
            -(int(r.get("canonical_blocks_all_epochs") or 0)),
            str(r.get("wallet_address") or ""),
        )
    )

    archive_height = archive_height_from_rows(rows)

    previous = load_previous(output_path)
    preserve_previous_stake(rows, previous)
    if previous and previous.get("validators") == rows and previous.get("ledger_meta") == ledger_meta:
        print(
            f"No validator data change: {len(rows)} rows, "
            f"archive height {archive_height}."
        )
        return 0

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "validator_count": len(rows),
        "archive_height": archive_height,
        "ledger_meta": ledger_meta,
        "source": {
            "database": "Mina archive PostgreSQL",
            "query": "exporter/query.sql",
            "staking_epoch_ledger": "mina ledger export staking-epoch-ledger",
            "next_epoch_ledger": "mina ledger export next-epoch-ledger",
        },
        "validators": rows,
    }

    atomic_write_json(output_path, payload)

    print(
        f"Updated {output_path}: {len(rows)} validators, "
        f"archive height {archive_height}, "
        f"staking ledger accounts {ledger_meta['staking_ledger_accounts']}, "
        f"next ledger accounts {ledger_meta['next_ledger_accounts']}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
