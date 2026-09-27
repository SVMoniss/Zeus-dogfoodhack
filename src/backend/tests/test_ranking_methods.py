"""UC-3: Multi-method ranking comparison (JUDGING.md "Multi-Method Ranking Comparison").

Covers, against the real service (app.services.ranking):
- raw_order: mean weighted total per project
- bradley_terry: MM strengths, ties skipped, disconnected-graph warning,
  empty input handling
- borda: per-judge points with fractional points for ties
- robustness: top-k SET agreement -> ROBUST else FRAGILE;
  no scored projects -> FRAGILE
"""
from app.services import ranking as rank


def totals_from(judge_totals):
    """Helper: {(judge, project): total} from {judge: {project: total}}."""
    return {(j, p): t for j, pm in judge_totals.items() for p, t in pm.items()}


class TestRawOrder:
    def test_orders_by_mean_descending(self):
        by_jp = totals_from({"j1": {"a": 5.0, "b": 1.0}, "j2": {"a": 3.0, "b": 3.0}})
        assert rank.raw_order(by_jp) == ["a", "b"]  # means 4.0 vs 2.0

    def test_id_tiebreak(self):
        by_jp = totals_from({"j1": {"b": 3.0, "a": 3.0}})
        assert rank.raw_order(by_jp) == ["a", "b"]

    def test_single_project(self):
        assert rank.raw_order({("j", "only"): 4.0}) == ["only"]

    def test_empty(self):
        assert rank.raw_order({}) == []


class TestBradleyTerry:
    def test_clear_winner_ranked_first(self):
        by_jp = totals_from({"j1": {"a": 5.0, "b": 1.0}, "j2": {"a": 4.0, "b": 2.0}})
        theta, warning = rank.bradley_terry(by_jp)
        assert rank.order_of(theta) == ["a", "b"]
        assert warning == ""

    def test_ties_are_skipped(self):
        tied = totals_from({"j1": {"a": 3.0, "b": 3.0}})
        theta, warning = rank.bradley_terry(tied)
        assert theta == {}
        assert "no pairwise" in warning

    def test_judge_with_single_project_yields_no_pairs(self):
        by_jp = {("j1", "a"): 5.0, ("j2", "b"): 1.0}  # nobody scored both
        theta, warning = rank.bradley_terry(by_jp)
        assert theta == {}

    def test_disconnected_graph_warns(self):
        # a-vs-b pair and c-vs-d pair share no judge overlap path
        by_jp = totals_from({"j1": {"a": 5.0, "b": 1.0}, "j2": {"c": 5.0, "d": 1.0}})
        _, warning = rank.bradley_terry(by_jp)
        assert "disconnected" in warning

    def test_empty_input(self):
        theta, warning = rank.bradley_terry({})
        assert theta == {}
        assert warning != ""

    def test_ranking_endpoint_fixture_agrees(self):
        # Same fixture as e2e ranking.spec.ts: flat (3,3) + spread (1,5)
        by_jp = {("ja", "p1"): 3.0, ("ja", "p2"): 3.0, ("jb", "p1"): 1.0, ("jb", "p2"): 5.0}
        theta, _ = rank.bradley_terry(by_jp)
        assert rank.order_of(theta)[0] == "p2"


class TestBorda:
    def test_simple_two_project_split(self):
        by_jp = totals_from({"j1": {"a": 5.0, "b": 1.0}, "j2": {"a": 1.0, "b": 5.0}})
        assert rank.borda(by_jp) == {"a": 1.0, "b": 1.0}

    def test_fractional_points_for_ties(self):
        # n=3, all tied: each gets mean(2,1,0) = 1.0 from that judge
        by_jp = totals_from({"j1": {"a": 3.0, "b": 3.0, "c": 3.0}})
        assert rank.borda(by_jp) == {"a": 1.0, "b": 1.0, "c": 1.0}

    def test_partial_tie(self):
        # n=3: a first (2 pts), b/c tie for remaining (1+0)/2 = 0.5 each
        by_jp = totals_from({"j1": {"a": 5.0, "b": 3.0, "c": 3.0}})
        assert rank.borda(by_jp) == {"a": 2.0, "b": 0.5, "c": 0.5}

    def test_accumulates_across_judges(self):
        by_jp = totals_from({"j1": {"a": 5.0, "b": 1.0}, "j2": {"a": 5.0, "b": 1.0}})
        assert rank.borda(by_jp) == {"a": 2.0, "b": 0.0}

    def test_ranking_fixture_borda(self):
        by_jp = {("ja", "p1"): 3.0, ("ja", "p2"): 3.0, ("jb", "p1"): 1.0, ("jb", "p2"): 5.0}
        assert rank.order_of(rank.borda(by_jp))[0] == "p2"


class TestRobustnessVerdict:
    def test_all_agree_is_robust(self):
        orders = {"raw_average": ["p2", "p1"], "calibrated_average": ["p2", "p1"],
                  "bradley_terry": ["p2", "p1"], "borda": ["p2", "p1"]}
        verdict, explanation, above, below = rank.robustness(orders, 1)
        assert verdict == "ROBUST"
        assert above == ["p2"]
        assert below == ["p1"]
        assert "agree" in explanation

    def test_disagreement_is_fragile_and_names_methods(self):
        orders = {"raw_average": ["p1", "p2"], "calibrated_average": ["p2", "p1"]}
        verdict, explanation, _, _ = rank.robustness(orders, 1)
        assert verdict == "FRAGILE"
        assert "disagree" in explanation

    def test_compares_sets_not_orders(self):
        # Same top-2 set in different order still counts as agreement
        orders = {"m1": ["a", "b", "c"], "m2": ["b", "a", "c"]}
        verdict, _, above, below = rank.robustness(orders, 2)
        assert verdict == "ROBUST"
        assert sorted(above) == ["a", "b"]
        assert below == ["c"]

    def test_no_scored_projects_is_fragile(self):
        verdict, explanation, above, below = rank.robustness({}, 3)
        assert verdict == "FRAGILE"
        assert above == [] and below == []
        assert "no scored projects" in explanation

    def test_empty_method_orderings_ignored(self):
        # BT with no pairs yields []; remaining methods agreeing -> ROBUST
        orders = {"raw_average": ["p2", "p1"], "bradley_terry": []}
        verdict, _, above, _ = rank.robustness(orders, 1)
        assert verdict == "ROBUST"
        assert above == ["p2"]

    def test_default_k_boundary_top3(self):
        orders = {m: ["a", "b", "c", "d"] for m in ("raw_average", "borda")}
        verdict, _, above, below = rank.robustness(orders, 3)
        assert verdict == "ROBUST"
        assert above == ["a", "b", "c"]
        assert below == ["d"]
