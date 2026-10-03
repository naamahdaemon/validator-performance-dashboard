#!/usr/bin/env python3
"""Import the supplied MinaScan rates into the existing validator_names table."""
import argparse
import json
import os
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=str(Path(__file__).with_name("validator-commissions.json")))
    args = parser.parse_args()
    records = json.loads(Path(args.input).read_text(encoding="utf-8"))["validators"]
    rows = []
    seen = set()
    for record in records:
        key, name, fee = record["public_key"], record["name"], record["commission_pct"]
        if not isinstance(key, str) or not key.startswith("B62") or key in seen:
            raise ValueError("Invalid or duplicate validator key")
        if not isinstance(fee, (int, float)) or isinstance(fee, bool) or not 0 <= fee <= 100:
            raise ValueError(f"Invalid commission for {key}")
        if not isinstance(name, str):
            raise ValueError(f"Invalid name for {key}")
        seen.add(key)
        rows.append((key, name, fee))
    with psycopg2.connect(
        host=os.environ.get("PGHOST", "127.0.0.1"), port=os.environ.get("PGPORT", "26432"),
        dbname=os.environ.get("PGDATABASE", "archive"), user=os.environ.get("PGUSER", "archive"),
        password=os.environ.get("PGPASSWORD"), connect_timeout=10,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL lock_timeout = '10s'")
            cur.execute("SET LOCAL statement_timeout = '60s'")
            cur.execute("""ALTER TABLE public.validator_names
                ADD COLUMN IF NOT EXISTS commission_pct numeric
                CHECK (commission_pct >= 0 AND commission_pct <= 100)""")
            cur.execute("""CREATE TEMP TABLE commission_import
                (public_key text PRIMARY KEY, name text, commission_pct numeric) ON COMMIT DROP""")
            execute_values(cur, "INSERT INTO commission_import VALUES %s", rows)
            cur.execute("""UPDATE public.validator_names vn SET commission_pct = src.commission_pct
                FROM commission_import src WHERE vn.public_key = src.public_key""")
            updated = cur.rowcount
            cur.execute("""INSERT INTO public.validator_names (public_key, name, source, commission_pct)
                SELECT src.public_key, src.name, 'minascan', src.commission_pct FROM commission_import src
                WHERE NOT EXISTS (SELECT 1 FROM public.validator_names vn WHERE vn.public_key = src.public_key)""")
            added = cur.rowcount
    print(f"Committed commissions: {updated} existing rows updated, {added} validators added. Existing names preserved.")


if __name__ == "__main__":
    main()
