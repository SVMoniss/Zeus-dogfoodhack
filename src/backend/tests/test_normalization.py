"""UC-2: Cross-judge z-score normalization (JUDGING.md "Cross-Judge Normalization").

Covers, against the real service (app.services.normalization):
- judge_stats: sample stdev, 0.0 when < 2 values
- normalize_value: z-score rescale; raw passthrough when sd_j == 0
- normalize_project_scores: per-project weighted normalized total
- rank_totals: competition ranking (ties share rank, next skips)
- Edge-case table: single-project judge / flat judge / incomplete
  batches / single-judge track
"""
import statistics

from app.services.normalization import (
    judge_stats,
    normalize_value,
    normalize_project_scores,
    rank_totals,
)


def close(a, b, tol=0.1):
    return abs(a - b) < tol


class TestJudgeStats:
    def test_mean_and_sample_stdev(self):
        mean, sd = judge_stats([1.0, 5.0])
        assert mean == 3.0
        assert abs(sd - 2.8284271247461903) < 1e-9

    def test_single_value_gives_zero_stdev(self):
        # JUDGING.md: judge scored only 1 project -> sigma = 0 -> raw
        mean, sd = judge_stats([4.0])
        assert mean == 4.0
        assert sd == 0.0

    def test_empty_gives_zeros(self):
        assert judge_stats([]) == (0.0, 0.0)

    def test_flat_scores_give_zero_stdev(self):
        # JUDGING.md: same score to all -> sigma = 0 -> raw
        mean, sd = judge_stats([3.0, 3.0])
        assert mean == 3.0
        assert sd == 0.0

    def test_matches_statistics_module(self):
        vals = [2.0, 4.0, 4.0, 5.0]
        mean, sd = judge_stats(vals)
        assert mean == statistics.mean(vals)
        assert sd == statistics.stdev(vals)


class TestNormalizeValue:
    def test_zero_judge_stdev_returns_raw(self):
        assert normalize_value(3.0, 3.0, 0.0, 3.0, 1.63) == 3.0
        assert normalize_value(5.0, 5.0, 0.0, 2.0, 9.9) == 5.0

    def test_single_judge_track_identity(self):
        # Global stats == judge stats -> normalized == raw
        assert normalize_value(4.0, 3.0, 2.0, 3.0, 2.0) == 4.0

    def test_documented_spread_example(self):
        # Judge B (1,5): mean 3, sd 2.828; global [3,3,1,5]: mean 3, sd 1.633
        g_sd = statistics.stdev([3, 3, 1, 5])
        lo = normalize_value(1.0, 3.0, statistics.stdev([1, 5]), 3.0, g_sd)
        hi = normalize_value(5.0, 3.0, statistics.stdev([1, 5]), 3.0, g_sd)
        assert close(lo, 1.85)
        assert close(hi, 4.15)

    def test_lenient_judge_pulled_down_harsh_pulled_up(self):
        # Lenient judge centered at 5, harsh at 2, same global mean 3.5
        lenient = normalize_value(5.0, 5.0, 1.0, 3.5, 1.0)
        harsh = normalize_value(2.0, 2.0, 1.0, 3.5, 1.0)
        assert lenient == 3.5
        assert harsh == 3.5


class TestNormalizeProjectScores:
    def _flat_plus_spread(self):
        # Mirrors tests/e2e/normalization.spec.ts fixture
        return [
            {"judge_id": "A", "project_id": "p1", "criteria": "Functionality", "score": 3},
            {"judge_id": "A", "project_id": "p2", "criteria": "Functionality", "score": 3},
            {"judge_id": "B", "project_id": "p1", "criteria": "Functionality", "score": 1},
            {"judge_id": "B", "project_id": "p2", "criteria": "Functionality", "score": 5},
        ], {"Functionality": 100.0}

    def test_p2_outscores_p1_after_normalization(self):
        scores, weights = self._flat_plus_spread()
        out = normalize_project_scores(scores, weights)
        assert out["p2"]["normalized_total"] > out["p1"]["normalized_total"]

    def test_flat_judge_contributes_raw(self):
        scores, weights = self._flat_plus_spread()
        out = normalize_project_scores(scores, weights)
        # p1: mean(3 raw, ~1.85 normalized) ~= 2.42 ; p2 ~= 3.58
        assert close(out["p1"]["normalized_total"], 2.42)
        assert close(out["p2"]["normalized_total"], 3.58)

    def test_raw_totals_are_plain_averages(self):
        scores, weights = self._flat_plus_spread()
        out = normalize_project_scores(scores, weights)
        assert out["p1"]["raw_total"] == 2.0  # mean(3,1)
        assert out["p2"]["raw_total"] == 4.0  # mean(3,5)

    def test_weighted_normalized_total_formula(self):
        scores = [
            {"judge_id": "A", "project_id": "p", "criteria": "F", "score": 4},
            {"judge_id": "A", "project_id": "p", "criteria": "Q", "score": 2},
        ]
        out = normalize_project_scores(scores, {"F": 40.0, "Q": 60.0})
        # Single score per (judge,criteria) -> sd 0 -> normalized == raw
        assert out["p"]["normalized_total"] == (4 * 40 + 2 * 60) / 100.0

    def test_edge_single_project_judge_uses_raw(self):
        scores = [{"judge_id": "A", "project_id": "only", "criteria": "F", "score": 5}]
        out = normalize_project_scores(scores, {"F": 100.0})
        assert out["only"]["normalized_total"] == 5.0

    def test_edge_flat_judge_uses_raw(self):
        scores = [
            {"judge_id": "A", "project_id": "p1", "criteria": "F", "score": 3},
            {"judge_id": "A", "project_id": "p2", "criteria": "F", "score": 3},
        ]
        out = normalize_project_scores(scores, {"F": 100.0})
        assert out["p1"]["normalized_total"] == 3.0
        assert out["p2"]["normalized_total"] == 3.0

    def test_edge_incomplete_batch_only_scored_criteria(self):
        # Judge B never scored Q: p/Q average must come from judge A alone
        scores = [
            {"judge_id": "A", "project_id": "p", "criteria": "F", "score": 4},
            {"judge_id": "A", "project_id": "p", "criteria": "Q", "score": 2},
            {"judge_id": "B", "project_id": "p", "criteria": "F", "score": 5},
        ]
        out = normalize_project_scores(scores, {"F": 50.0, "Q": 50.0})
        assert out["p"]["raw_total"] == (4.5 * 50 + 2 * 50) / 100.0

    def test_edge_single_judge_track_normalized_equals_raw(self):
        scores = [
            {"judge_id": "A", "project_id": "p1", "criteria": "F", "score": 2},
            {"judge_id": "A", "project_id": "p2", "criteria": "F", "score": 4},
        ]
        out = normalize_project_scores(scores, {"F": 100.0})
        assert out["p1"]["normalized_total"] == out["p1"]["raw_total"]
        assert out["p2"]["normalized_total"] == out["p2"]["raw_total"]


class TestRankAssignment:
    def test_descending_ranks(self):
        assert rank_totals({"a": 1.0, "b": 3.0, "c": 2.0}) == {"b": 1, "c": 2, "a": 3}

    def test_ties_share_rank_and_next_skips(self):
        # Standard competition ranking: 1, 2, 2, 4
        ranks = rank_totals({"a": 5.0, "b": 3.0, "c": 3.0, "d": 1.0})
        assert ranks["a"] == 1
        assert ranks["b"] == 2
        assert ranks["c"] == 2
        assert ranks["d"] == 4

    def test_all_tied(self):
        assert rank_totals({"a": 2.0, "b": 2.0}) == {"a": 1, "b": 1}

    def test_normalized_order_drives_rank(self):
        scores = [
            {"judge_id": "A", "project_id": "p1", "criteria": "Functionality", "score": 3},
            {"judge_id": "A", "project_id": "p2", "criteria": "Functionality", "score": 3},
            {"judge_id": "B", "project_id": "p1", "criteria": "Functionality", "score": 1},
            {"judge_id": "B", "project_id": "p2", "criteria": "Functionality", "score": 5},
        ]
        out = normalize_project_scores(scores, {"Functionality": 100.0})
        ranks = rank_totals({p: v["normalized_total"] for p, v in out.items()})
        assert ranks["p2"] == 1
        assert ranks["p1"] == 2
