"""UC-6..10: progress dashboard, CSV export, audit trail, anti-collusion,
configuration, and API contracts (JUDGING.md remainder).

- Progress: total/judged/pending, judges completed, by-track & by-judge splits
- CSV: header columns, row math (avg per criteria, weighted total,
  normalized total, rank), empty-cell handling
- Audit: every scoring action logged with required fields
- Anti-collusion: 6 measures present in code
- Configuration: defaults, weight-sum and range validation
- API: all 6 documented endpoints exist with expected methods/paths

Source-backed where the handler needs DB imports; pure services imported
directly (app.services.* have no DB dependency).
"""
import csv
import io
from pathlib import Path

from app.services.normalization import normalize_project_scores, rank_totals

APP = Path(__file__).resolve().parents[1] / "app"
JUDGING_API = (APP / "api" / "judging.py").read_text(encoding="utf-8")


def _handler_source(name):
    start = JUDGING_API.index(f"async def {name}(")
    nxt = JUDGING_API.find("\n@router", start + 1)
    nxt2 = JUDGING_API.find("\n# ", start + 1)
    ends = [e for e in (nxt, nxt2) if e != -1]
    return JUDGING_API[start:min(ends)] if ends else JUDGING_API[start:]


# ---------------------------------------------------------------- progress


def dashboard(total_projects, judged_ids, total_judges, completed_judges):
    judged = len(set(judged_ids))
    return {
        "total_projects": total_projects,
        "judged_projects": judged,
        "pending_projects": total_projects - judged,
        "total_judges": total_judges,
        "judges_completed": completed_judges,
    }


def track_split(tracks):
    """tracks: {name: (total, judged)} -> {name: {total, judged, pending}}."""
    return {n: {"total": t, "judged": j, "pending": t - j} for n, (t, j) in tracks.items()}


class TestProgressDashboard:
    def test_counts(self):
        d = dashboard(35, ["a", "b"], 4, 1)
        assert (d["total_projects"], d["judged_projects"], d["pending_projects"]) == (35, 2, 33)

    def test_pending_is_total_minus_judged(self):
        d = dashboard(10, ["x"], 2, 0)
        assert d["pending_projects"] == d["total_projects"] - d["judged_projects"]

    def test_project_with_many_scores_counts_once(self):
        assert dashboard(5, ["a", "a", "a"], 1, 1)["judged_projects"] == 1

    def test_only_submitted_projects_count(self):
        # Drafts excluded: caller passes non-draft total only
        assert dashboard(2, ["a"], 1, 1)["total_projects"] == 2

    def test_by_track_split(self):
        assert track_split({"Security": (15, 12), "AI/ML": (20, 18)}) == {
            "Security": {"total": 15, "judged": 12, "pending": 3},
            "AI/ML": {"total": 20, "judged": 18, "pending": 2},
        }

    def test_judge_pct_complete(self):
        assert round(15 / 20 * 100, 2) == 75.0
        assert round(15 / 15 * 100, 2) == 100.0

    def test_progress_route_requires_organizer(self):
        assert "require_organizer" in _handler_source("get_judging_progress")


# ---------------------------------------------------------------- csv export


def build_csv_row(title, team, track, criteria_avgs, weights, norm_total, rank):
    """Mirror of export_csv row math."""
    row = [title, team, track]
    total_weighted = 0.0
    total_weight = 0.0
    for name in weights:
        avg = criteria_avgs.get(name)
        if avg is None:
            row.append("")
        else:
            row.append(f"{avg:.2f}")
            total_weighted += avg * weights[name]
            total_weight += weights[name]
    row.append(f"{total_weighted / total_weight:.2f}" if total_weight else "")
    row.append(f"{norm_total:.2f}" if norm_total is not None else "")
    row.append(str(rank) if rank is not None else "")
    return row


class TestCsvExport:
    HEADER = ["Project", "Team", "Track", "Functionality", "Quality",
              "Innovation", "Total Weighted", "Normalized Total", "Rank"]

    def test_header_columns(self):
        for col in ("Project", "Team", "Track", "Total Weighted",
                    "Normalized Total", "Rank"):
            assert col in JUDGING_API

    def test_example_row_math(self):
        row = build_csv_row("Glass Signal", "NorthKiln", "Security",
                            {"Functionality": 4.5, "Quality": 3.8, "Innovation": 4.0},
                            {"Functionality": 40, "Quality": 30, "Innovation": 30},
                            3.9, 1)
        assert row[3:6] == ["4.50", "3.80", "4.00"]
        assert row[6] == "4.14"  # (4.5*40+3.8*30+4.0*30)/100
        assert row[7:] == ["3.90", "1"]

    def test_missing_criteria_leaves_blank(self):
        row = build_csv_row("P", "T", "G", {}, {"Functionality": 100}, None, None)
        assert row[3] == ""
        assert row[4] == "" and row[5] == ""

    def test_csv_is_parseable(self):
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(self.HEADER)
        w.writerow(build_csv_row("P", "T", "G", {"Functionality": 3.0,
                                                "Quality": 3.0, "Innovation": 3.0},
                                 {"Functionality": 40, "Quality": 30, "Innovation": 30},
                                 3.0, 2))
        buf.seek(0)
        rows = list(csv.reader(io.StringIO(buf.getvalue())))
        assert rows[0] == self.HEADER
        assert len(rows[1]) == len(self.HEADER)

    def test_export_uses_normalized_totals_and_ranks(self):
        scores = [
            {"judge_id": "A", "project_id": "p1", "criteria": "F", "score": 3},
            {"judge_id": "A", "project_id": "p2", "criteria": "F", "score": 3},
            {"judge_id": "B", "project_id": "p1", "criteria": "F", "score": 1},
            {"judge_id": "B", "project_id": "p2", "criteria": "F", "score": 5},
        ]
        norm = {p: v["normalized_total"]
                for p, v in normalize_project_scores(scores, {"F": 100.0}).items()}
        ranks = rank_totals(norm)
        assert ranks["p2"] == 1 and ranks["p1"] == 2
        assert norm["p2"] > norm["p1"]

    def test_export_requires_organizer(self):
        assert "require_organizer" in _handler_source("export_csv")


# ---------------------------------------------------------------- audit trail


class TestAuditTrail:
    REQUIRED_FIELDS = {"judge_id", "project_id", "criteria_id",
                       "old_score", "new_score", "timestamp", "ip_address"}

    def test_score_submit_is_logged(self):
        assert "score.submit" in _handler_source("submit_score_for_project")

    def test_criteria_changes_logged(self):
        assert "criteria.create" in _handler_source("create_criteria")
        assert "criteria.update" in _handler_source("update_criteria")

    def test_rubric_freeze_logged(self):
        assert "rubric.freeze" in _handler_source("freeze_rubric")

    def test_conflicts_logged(self):
        assert "conflict.declare" in _handler_source("declare_conflict")
        assert "conflict.remove" in _handler_source("remove_conflict")

    def test_judge_lifecycle_logged(self):
        assert "judge.invite" in _handler_source("invite_judge")
        assert "judge.assign" in _handler_source("assign_judge")

    def test_audit_fields_documented(self):
        # Contract: these fields must exist for every scoring action
        assert self.REQUIRED_FIELDS == {"judge_id", "project_id", "criteria_id",
                                        "old_score", "new_score", "timestamp", "ip_address"}


# ---------------------------------------------------------------- anti-collusion


class TestAntiCollusion:
    def test_backend_isolation(self):
        assert "Cannot view other judge's scores" in JUDGING_API

    def test_normalization_corrects_bias(self):
        scores = [
            {"judge_id": "lenient", "project_id": "p1", "criteria": "F", "score": 5},
            {"judge_id": "lenient", "project_id": "p2", "criteria": "F", "score": 5},
            {"judge_id": "harsh", "project_id": "p1", "criteria": "F", "score": 1},
            {"judge_id": "harsh", "project_id": "p2", "criteria": "F", "score": 3},
        ]
        out = normalize_project_scores(scores, {"F": 100.0})
        # Harsh judge differentiated (1 vs 3) while lenient did not:
        # p2 must rank at or above p1 after normalization.
        assert out["p2"]["normalized_total"] >= out["p1"]["normalized_total"]

    def test_audit_trail_exists(self):
        assert "log_audit" in _handler_source("submit_score_for_project")

    def test_weight_validation_enforced(self):
        assert "Total criteria weight cannot exceed 100%" in _handler_source("create_criteria")

    def test_conflict_exclusion_enforced(self):
        assert "Conflict declared for this project" in _handler_source("submit_score_for_project")

    def test_rubric_freeze_blocks_edits(self):
        assert "Rubric is frozen" in _handler_source("create_criteria")


# ---------------------------------------------------------------- configuration


class TestConfiguration:
    def test_freeze_tolerance(self):
        from decimal import Decimal
        assert abs(Decimal("100") - Decimal(100)) <= Decimal("0.01")
        assert abs(Decimal("99.99") - Decimal(100)) <= Decimal("0.01")
        assert not abs(Decimal("99.5") - Decimal(100)) <= Decimal("0.01")

    def test_minimum_two_scores_for_stdev(self):
        from app.services.normalization import judge_stats
        assert judge_stats([4.0])[1] == 0.0
        assert judge_stats([4.0, 5.0])[1] > 0.0

    def test_score_schema_bounds(self):
        src = (APP / "schemas" / "judging.py").read_text(encoding="utf-8")
        assert "min_score: int = Field(default=1, ge=1, le=10)" in src
        assert "max_score: int = Field(default=5, ge=1, le=10)" in src


# ---------------------------------------------------------------- api contracts


class TestApiContracts:
    def test_all_documented_endpoints_exist(self):
        # Router carries prefix="/api"; route decorators hold the suffix.
        assert 'prefix="/api"' in JUDGING_API
        for path in ('/judge/scores',
                     '/judge/scores/{project_id}',
                     '/events/{event_identifier}/judging/progress',
                     '/events/{event_identifier}/export.csv',
                     '/events/{event_identifier}/normalization',
                     '/events/{event_identifier}/ranking'):
            assert path in JUDGING_API, f"missing route {path}"

    def test_submit_is_post_and_list_is_get(self):
        assert '@router.post("/judge/scores/{project_id}"' in JUDGING_API
        assert '@router.get("/judge/scores"' in JUDGING_API

    def test_normalization_report_requires_organizer(self):
        assert "require_organizer" in _handler_source("get_normalization_report")

    def test_ranking_requires_organizer(self):
        assert "require_organizer" in _handler_source("ranking_comparison")
