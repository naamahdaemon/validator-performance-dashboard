"""Recover explicitly selected Git snapshots without database or daemon access."""
import argparse
import json
import subprocess
from pathlib import Path
from epoch_history import recover_snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", action="append", required=True)
    parser.add_argument("--output", default="docs/data/history")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    for ref in args.ref:
        sha = subprocess.check_output(["git", "rev-parse", "--verify", ref + "^{commit}"], cwd=root, text=True).strip()
        snapshot = json.loads(subprocess.check_output(["git", "show", f"{sha}:docs/data/validators.json"], cwd=root))
        recover_snapshot(root / args.output, snapshot,
                         {"git_commit": sha, "snapshot_at": snapshot.get("generated_at")})
        print(f"Recovered history from {sha}")


if __name__ == "__main__":
    main()
