#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras


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
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
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


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export Mina validator/archive statistics to a static JSON snapshot."
    )
    parser.add_argument(
        "--query",
        default=str(Path(__file__).with_name("query.sql")),
        help="SQL query file",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Destination validators.json",
    )
    args = parser.parse_args()

    query_path = Path(args.query)
    output_path = Path(args.output)

    sql = query_path.read_text(encoding="utf-8")

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
        print(
            "ERROR: PGPASSWORD is not set. "
            "Put it in /etc/mina-validator-performance.env.",
            file=sys.stderr,
        )
        return 2

    with psycopg2.connect(**db) as conn:
        # This protects the archive DB from an exporter query stuck forever.
        with conn.cursor() as timeout_cur:
            timeout_cur.execute(
                "SET statement_timeout = %s",
                (os.environ.get("PGSTATEMENT_TIMEOUT", "8min"),),
            )

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            rows = [normalize_row(dict(row)) for row in cur.fetchall()]

    # Stable order makes diffs deterministic.
    rows.sort(
        key=lambda r: (
            -(float(r.get("current_stake") or 0)),
            -(float(r.get("delegated_stake_pct") or 0)),
            -(int(r.get("total_blocks_all_epochs") or 0)),
            str(r.get("wallet_address") or ""),
        )
    )

    archive_height = archive_height_from_rows(rows)

    previous = load_previous(output_path)
    if previous and previous.get("validators") == rows:
        print(
            f"No validator data change: {len(rows)} rows, "
            f"archive height {archive_height}."
        )
        return 0

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "validator_count": len(rows),
        "archive_height": archive_height,
        "source": {
            "database": "Mina archive PostgreSQL",
            "query": "exporter/query.sql",
        },
        "validators": rows,
    }

    atomic_write_json(output_path, payload)
    print(
        f"Updated {output_path}: {len(rows)} validators, "
        f"archive height {archive_height}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
