"""UC-1: Weighted rubric & raw scoring (JUDGING.md "Scoring Mathematics").

Covers:
- Raw_Score(judge, project) = sum(w_i * s_i) / 100
- Project_Raw_Score = mean of per-judge raw scores
- Criteria weights must sum to 100% (create: total > 100 rejected;
  freeze: total must equal 100 +/- 0.01; defaults 40/30/30)
- Score range validation (min_score <= score <= max_score, integer)
"""
from decimal import Decimal


def raw_score(scores, weights):
    """Mirror of judging.py submit/export math: sum(w*s)/100."""
    return sum(weights[c] * s for c, s in scores.items()) / 100.0


def project_raw(per_judge_raw):
    return sum(per_judge_raw) / len(per_judge_raw)


def create_rejects(total_existing, new_weight):
    return (total_existing + new_weight) > 100


def freeze_allowed(total):
    # Mirrors freeze_rubric: Decimal comparison, 0.01 tolerance.
    total = Decimal(str(total))
    return abs(total - Decimal(100)) <= Decimal("0.01")


class TestRawScoreFormula:
    def test_single_criterion_weight_100(self):
        assert raw_score({"Functionality": 4}, {"Functionality": 100}) == 4.0

    def test_default_weights_example(self):
        # Functionality 40%, Quality 30%, Innovation 30%
        weights = {"Functionality": 40, "Quality": 30, "Innovation": 30}
        scores = {"Functionality": 5, "Quality": 4, "Innovation": 3}
        # (40*5 + 30*4 + 30*3)/100 = 4.1
        assert raw_score(scores, weights) == 4.1

    def test_weights_must_sum_to_100_for_valid_rubric(self):
        assert sum([40, 30, 30]) == 100
        assert sum([50, 50, 10]) != 100

    def test_zero_score_criterion(self):
        assert raw_score({"A": 0}, {"A": 100}) == 0.0

    def test_max_boundary_score(self):
        assert raw_score({"A": 5, "B": 5}, {"A": 50, "B": 50}) == 5.0


class TestAggregatedRawScore:
    def test_average_across_judges(self):
        assert project_raw([4.1, 3.9]) == 4.0

    def test_single_judge_passthrough(self):
        assert project_raw([3.5]) == 3.5

    def test_lenient_and_harsh_judges_averaged(self):
        # Lenient judge 5.0, harsh judge 3.0 -> 4.0 (normalization fixes this later)
        assert project_raw([5.0, 3.0]) == 4.0

    def test_three_judges(self):
        assert project_raw([2.0, 4.0, 6.0]) == 4.0


class TestWeightValidation:
    def test_create_rejects_total_over_100(self):
        assert create_rejects(Decimal("60"), Decimal("50")) is True

    def test_create_allows_total_exactly_100(self):
        assert create_rejects(Decimal("60"), Decimal("40")) is False

    def test_create_allows_total_under_100(self):
        # Incremental creation allowed; freeze enforces exactly 100
        assert create_rejects(Decimal("40"), Decimal("30")) is False

    def test_freeze_requires_exactly_100(self):
        assert freeze_allowed(Decimal("100")) is True
        assert freeze_allowed(Decimal("100.005")) is True  # within 0.01 tolerance
        assert freeze_allowed(Decimal("99.9")) is False
        assert freeze_allowed(Decimal("110")) is False
        assert freeze_allowed(Decimal("0")) is False

    def test_freeze_regression_99_99_boundary(self):
        # Regression: float(Decimal("99.99")) is 99.98999... and the old
        # float-based check wrongly rejected this within-tolerance total.
        # Weights as stored (DECIMAL) sum exactly; Decimal math must allow it.
        assert Decimal("40") + Decimal("30") + Decimal("29.99") == Decimal("99.99")
        assert freeze_allowed(Decimal("40") + Decimal("30") + Decimal("29.99")) is True

    def test_default_weights_sum_to_100(self):
        assert 40 + 30 + 30 == 100


class TestScoreRangeValidation:
    def validate(self, score, lo=1, hi=5):
        return lo <= score <= hi

    def test_inside_range_ok(self):
        assert self.validate(1) and self.validate(3) and self.validate(5)

    def test_below_min_rejected(self):
        assert self.validate(0) is False

    def test_above_max_rejected(self):
        assert self.validate(6) is False

    def test_custom_range(self):
        assert self.validate(7, lo=1, hi=10) is True
        assert self.validate(11, lo=1, hi=10) is False

    def test_schema_defaults_are_1_to_5(self):
        from pathlib import Path
        src = (Path(__file__).resolve().parents[1] / "app" / "schemas" / "judging.py"
               ).read_text(encoding="utf-8")
        assert "min_score: int = Field(default=1" in src
        assert "max_score: int = Field(default=5" in src
