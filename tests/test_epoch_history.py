import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from decimal import Decimal

spec = importlib.util.spec_from_file_location("epoch_history", Path(__file__).resolve().parents[1] / "exporter/epoch_history.py")
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)


class HistoryTests(unittest.TestCase):
    def test_bounds_and_reject_paths(self):
        self.assertEqual(history.bounds("mesa:3"), (979860, 987000))
        with self.assertRaises(ValueError):
            history.bounds("../bad")

    def test_recovery_preserves_missing_ledger_and_zero_producers(self):
        with tempfile.TemporaryDirectory() as directory:
            snapshot = {"ledger_meta": {"total_stake_current_epoch": 1000, "block_count_basis": "canonical"},
                        "validators": [{"wallet_address": "A", "network_epoch_label": "mesa:4",
                                        "previous_epoch_label": "mesa:3", "stake_current_epoch": 30,
                                        "blocks_previous_epoch": 2},
                                       {"wallet_address": "B", "network_epoch_label": "mesa:4",
                                        "previous_epoch_label": "mesa:3", "stake_current_epoch": 10,
                                        "blocks_previous_epoch": 0}]}
            history.recover_snapshot(directory, snapshot, "git")
            current = history.read(history.path_for(directory, "mesa:4"))
            self.assertEqual(current["ledger"]["total_stake_mina"], "1000")
            self.assertIn("B", current["ledger"]["recipients"])
            previous = history.read(history.path_for(directory, "mesa:3"))
            self.assertIsNone(previous["ledger"])
            self.assertEqual(previous["production"]["total_canonical_blocks"], 2)

    def test_full_ledger_not_overwritten_and_write_is_stable(self):
        with tempfile.TemporaryDirectory() as directory:
            aggregate = lambda _: ({"A": Decimal("1.234567891"), "B": Decimal("2")}, {"A": 3})
            history.capture_ledger(directory, "mesa:4", [], aggregate, "daemon")
            path = history.path_for(directory, "mesa:4")
            data = history.read(path)
            self.assertEqual(data["ledger"]["total_stake_mina"], "3.234567891")
            history.merge_ledger(data, {"coverage": "snapshot_rows_only"})
            self.assertFalse(history.write_changed(path, data))
            history.capture_ledger(directory, "mesa:4", [], aggregate, "later capture")
            self.assertEqual(history.read(path), data)

    def test_only_closed_epochs_are_counted_once(self):
        class Cursor:
            def __init__(self, tip): self.tip = tip; self.queries = []
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql, params=None): self.queries.append((sql, params))
            def fetchone(self): return (self.tip,)
            def fetchall(self): return [("A", 7)]
        class Connection:
            def __init__(self, tip): self.cur = Cursor(tip)
            def cursor(self): return self.cur
        with tempfile.TemporaryDirectory() as directory:
            path = history.path_for(directory, "mesa:3")
            history.write_changed(path, history.record("mesa:3"))
            history.complete_production(directory, Connection(986999))
            self.assertIsNone(history.read(path)["production"])
            connection = Connection(987000)
            history.complete_production(directory, connection)
            self.assertEqual(connection.cur.queries[1][1], (979860, 987000))
            self.assertEqual(history.read(path)["production"]["total_canonical_blocks"], 7)
            connection = Connection(987100)
            history.complete_production(directory, connection)
            self.assertEqual(len(connection.cur.queries), 1)
