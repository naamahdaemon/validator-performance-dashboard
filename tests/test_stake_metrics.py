"""Run with: python -m unittest discover -s tests -v"""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "export_validators", Path(__file__).resolve().parents[1] / "exporter/export_validators.py"
)
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


def account(wallet, balance, token=None):
    return {"pk": wallet, "delegate": wallet, "balance": str(balance),
            "token": token or exporter.DEFAULT_MINA_TOKEN_ID}


class StakeMetricsTests(unittest.TestCase):
    def test_missing_next_ledger_keeps_other_metrics_and_recovers(self):
        rows = [{"wallet_address": "A", "current_stake": 90, "blocks_current_epoch": 3}]
        for error in (RuntimeError("export failed"), RuntimeError("timed out"), OSError("docker unavailable")):
            with self.subTest(error=str(error)):
                with patch.object(exporter, "export_ledger", side_effect=[[account("A", 100)], error]):
                    with patch("sys.stderr"):
                        meta = exporter.enrich_with_consensus_ledgers(rows)
                self.assertFalse(meta["next_ledger_available"])
                self.assertIsNone(meta["next_ledger_accounts"])
                self.assertEqual(rows[0]["stake_current_epoch"], 100)
                self.assertEqual(rows[0]["stake_live_estimate"], 90)
                self.assertEqual(rows[0]["blocks_current_epoch"], 3)
                self.assertEqual(rows[0]["stake_active_pct"], 100)
                for key in ("stake_next_epoch", "stake_next_delta", "stake_next_delta_pct",
                            "stake_live_delta", "stake_live_delta_pct", "delegators_next_epoch"):
                    self.assertIsNone(rows[0][key])
        with patch.object(exporter, "export_ledger", side_effect=[[account("A", 100)], [account("A", 120)]]):
            meta = exporter.enrich_with_consensus_ledgers(rows)
        self.assertTrue(meta["next_ledger_available"])
        self.assertEqual(rows[0]["stake_next_delta"], 20)
        self.assertEqual(rows[0]["stake_live_delta"], -30)

    def test_current_ledger_failure_still_stops_export(self):
        with patch.object(exporter, "export_ledger", side_effect=RuntimeError("staking failed")):
            with self.assertRaisesRegex(RuntimeError, "staking failed"):
                exporter.enrich_with_consensus_ledgers([])

    def test_total_includes_unlisted_stake_and_activity_uses_both_epochs(self):
        ledger = [account("A", 100), account("B", 300), account("C", 200),
                  account("unlisted", 400), account("other-token", 9999, "OTHER")]
        rows = [
            {"wallet_address": "A", "blocks_previous_epoch": 2, "blocks_current_epoch": 0},
            {"wallet_address": "B", "blocks_previous_epoch": 0, "blocks_current_epoch": 1},
            {"wallet_address": "C", "blocks_previous_epoch": 0, "blocks_current_epoch": 0},
        ]
        with patch.object(exporter, "export_ledger", return_value=ledger):
            meta = exporter.enrich_with_consensus_ledgers(rows)
        self.assertEqual(meta["total_stake_current_epoch"], 1000)
        self.assertEqual(meta["active_stake_current_epoch"], 400)
        self.assertEqual(meta["active_validator_count"], 2)
        self.assertEqual([r["stake_current_pct"] for r in rows], [10, 30, 20])
        self.assertEqual([r["stake_active_pct"] for r in rows], [25, 75, None])
        self.assertFalse(rows[2]["is_active_validator"])

    def test_no_active_stake_and_zero_total_are_not_false_percentages(self):
        rows = [{"wallet_address": "A", "blocks_previous_epoch": 0, "blocks_current_epoch": 0}]
        with patch.object(exporter, "export_ledger", return_value=[account("A", 100)]):
            exporter.enrich_with_consensus_ledgers(rows)
        self.assertEqual(rows[0]["stake_current_pct"], 100)
        self.assertIsNone(rows[0]["stake_active_pct"])
        with patch.object(exporter, "export_ledger", return_value=[]):
            exporter.enrich_with_consensus_ledgers(rows)
        self.assertIsNone(rows[0]["stake_current_pct"])
        self.assertIsNone(rows[0]["stake_active_pct"])

    def test_next_and_live_delta_keep_their_reference(self):
        rows = [{"wallet_address": "A", "current_stake": 90, "blocks_current_epoch": 1}]
        with patch.object(exporter, "export_ledger", side_effect=[[account("A", 100)], [account("A", 120)]]):
            exporter.enrich_with_consensus_ledgers(rows)
        self.assertEqual(rows[0]["stake_next_delta"], 20)
        self.assertEqual(rows[0]["stake_next_delta_pct"], 20)
        self.assertEqual(rows[0]["stake_live_delta"], -30)
        self.assertEqual(rows[0]["stake_live_delta_pct"], -25)


if __name__ == "__main__":
    unittest.main()
