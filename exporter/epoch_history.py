"""Versioned research data; independent of the dashboard's estimates."""
import json
import re
from pathlib import Path

MESA_START = 958440
SLOTS = 7140


def bounds(label):
    if not re.fullmatch(r"mesa:\d+", label):
        raise ValueError(f"Unsupported history epoch: {label}")
    start = MESA_START + int(label.split(":")[1]) * SLOTS
    return start, start + SLOTS


def path_for(directory, label):
    bounds(label)
    return Path(directory) / (label.replace(":", "-") + ".json")


def read(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def write_changed(path, data):
    if read(path) == data:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
    return True


def record(label):
    start, end = bounds(label)
    return {"schema_version": 1, "epoch": label, "start_slot": start,
            "end_slot_exclusive": end, "slots_per_epoch": SLOTS,
            "ledger": None, "production": None}


def merge_ledger(data, ledger):
    # A complete daemon ledger always outranks a partial recovery from table rows.
    if data.get("ledger", {}) and data["ledger"]["coverage"] == "all_positive_stake_recipients":
        return
    data["ledger"] = ledger


def capture_ledger(directory, label, accounts, aggregate, source):
    path = path_for(directory, label)
    data = read(path) or record(label)
    stakes, delegators = aggregate(accounts)
    merge_ledger(data, {
        "coverage": "all_positive_stake_recipients",
        "source": source,
        "total_stake_mina": str(sum(stakes.values())),
        "recipients": {wallet: {"stake_mina": str(stakes[wallet]),
                                "external_delegators": delegators.get(wallet, 0)}
                       for wallet in sorted(stakes)},
    })
    write_changed(path, data)


def recover_snapshot(directory, snapshot, source):
    rows = snapshot.get("validators", [])
    labels = {r.get("network_epoch_label") for r in rows}
    if len(labels) != 1:
        raise ValueError("Snapshot has no unambiguous network epoch")
    label = labels.pop()
    path = path_for(directory, label)
    data = read(path) or record(label)
    total = snapshot.get("ledger_meta", {}).get("total_stake_current_epoch")
    if total is None:
        raise ValueError("Snapshot is missing its full ledger total")
    merge_ledger(data, {
        "coverage": "snapshot_rows_only",
        "source": source,
        "total_stake_mina": str(total),
        "recipients": {r["wallet_address"]: {"stake_mina": str(r["stake_current_epoch"]),
                         "external_delegators": r.get("delegators_current_epoch")}
                       for r in sorted(rows, key=lambda r: r["wallet_address"])
                       if r.get("stake_current_epoch") is not None},
    })
    write_changed(path, data)
    # Previous-epoch counters cover a closed epoch, but require archive validation.
    if snapshot.get("ledger_meta", {}).get("block_count_basis") != "canonical":
        return
    previous = {r.get("previous_epoch_label") for r in rows}
    if len(previous) != 1:
        return
    previous = previous.pop()
    if not previous or not previous.startswith("mesa:"):
        return
    path = path_for(directory, previous)
    data = read(path) or record(previous)
    if not data.get("production") or data["production"]["status"] != "closed_archive":
        counts = {r["wallet_address"]: int(r["blocks_previous_epoch"])
                  for r in sorted(rows, key=lambda r: r["wallet_address"])
                  if r.get("blocks_previous_epoch", 0)}
        data["production"] = {"status": "recovered_needs_archive_validation",
                              "source": source, "canonical_blocks": counts,
                              "total_canonical_blocks": sum(counts.values())}
        write_changed(path, data)


def complete_production(directory, connection):
    """Freeze closed epochs only once a confirmed canonical block passes the boundary.

    This certifies the boundary in this archive, not the archive's completeness.
    Remove a production section to explicitly request a recount after archive repair.
    """
    with connection.cursor() as cur:
        cur.execute("SELECT MAX(global_slot_since_genesis) FROM blocks WHERE chain_status = 'canonical'")
        tip = cur.fetchone()[0]
        if tip is None:
            return
        for path in sorted(Path(directory).glob("mesa-*.json")):
            data = read(path)
            start, end = bounds(data["epoch"])
            if tip < end or (data.get("production") or {}).get("status") == "closed_archive":
                continue
            cur.execute("""
                SELECT pk.value, COUNT(*)
                FROM blocks b JOIN public_keys pk ON pk.id = b.creator_id
                WHERE b.chain_status = 'canonical'
                  AND b.global_slot_since_genesis >= %s
                  AND b.global_slot_since_genesis < %s
                GROUP BY pk.value ORDER BY pk.value
            """, (start, end))
            counts = {wallet: int(count) for wallet, count in cur.fetchall()}
            data["production"] = {
                "status": "closed_archive", "source": "archive canonical blocks",
                "closure_witness_canonical_slot": int(tip),
                "archive_completeness_verified": False,
                "canonical_blocks": counts, "total_canonical_blocks": sum(counts.values()),
            }
            write_changed(path, data)
