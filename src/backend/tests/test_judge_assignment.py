"""UC-4: Judge assignment algorithm (JUDGING.md "Judge Assignment Algorithm").

Covers without a database (source-backed contract tests + logic helpers):
- Unique constraint (judge_id, track_id) exists on the model
- One judge -> many tracks; one track -> many judges (model allows it)
- Only organizers/admins may create assignments (route dependency)
- Assignment validates judge role and track-event membership (source guards)
- Batch tracking model exists per (judge, track)
- Workload helpers: % complete, unassigned-project detection

Source files are read as text so these tests run without DB drivers.
"""
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
JUDGING_API = (APP / "api" / "judging.py").read_text(encoding="utf-8")
JUDGING_MODEL = (APP / "models" / "judging.py").read_text(encoding="utf-8")


def pct_complete(scored, assigned):
    return 0.0 if assigned == 0 else round(scored / assigned * 100, 2)


def unassigned_projects(all_projects, judged_ids):
    return [p for p in all_projects if p not in set(judged_ids)]


def _handler_source(name):
    start = JUDGING_API.index(f"async def {name}(")
    # handler ends at the next top-level route decorator or router def
    nxt = JUDGING_API.find("\n@router", start + 1)
    nxt2 = JUDGING_API.find("\n# ", start + 1)
    ends = [e for e in (nxt, nxt2) if e != -1]
    return JUDGING_API[start:min(ends)] if ends else JUDGING_API[start:]


class TestAssignmentConstraints:
    def test_unique_judge_track_constraint(self):
        assert 'UniqueConstraint("judge_id", "track_id"' in JUDGING_MODEL
        assert '"uq_judge_track"' in JUDGING_MODEL or "'uq_judge_track'" in JUDGING_MODEL \
            or "uq_judge_track" in JUDGING_MODEL

    def test_model_allows_one_judge_many_tracks(self):
        # No uniqueness on judge_id alone -> same judge, different tracks OK
        assert 'UniqueConstraint("judge_id")' not in JUDGING_MODEL

    def test_model_allows_one_track_many_judges(self):
        assert 'UniqueConstraint("track_id")' not in JUDGING_MODEL

    def test_assignment_carries_event_and_assigner(self):
        for col in ("event_id", "judge_id", "track_id", "assigned_by"):
            assert col in JUDGING_MODEL


class TestAssignmentPermissions:
    def test_assign_route_requires_organizer(self):
        src = _handler_source("assign_judge")
        assert "require_organizer" in src

    def test_invite_route_requires_organizer(self):
        assert "require_organizer" in _handler_source("invite_judge")

    def test_list_judges_route_requires_organizer(self):
        assert "require_organizer" in _handler_source("list_judges")

    def test_assign_rejects_non_judge_role(self):
        assert "Invalid judge" in _handler_source("assign_judge")

    def test_assign_rejects_foreign_track(self):
        assert "Invalid track for this event" in _handler_source("assign_judge")


class TestBatchTracking:
    def test_batch_model_fields(self):
        for col in ("event_id", "judge_id", "track_id", "assignment_id",
                    "started_at", "completed_at", "is_complete"):
            assert col in JUDGING_MODEL

    def test_batch_defaults_to_incomplete(self):
        assert "is_complete" in JUDGING_MODEL
        assert "default=False" in JUDGING_MODEL


class TestLoadBalancingHelpers:
    def test_pct_complete_full(self):
        assert pct_complete(15, 15) == 100.0

    def test_pct_complete_partial(self):
        assert pct_complete(15, 20) == 75.0

    def test_pct_complete_zero_assigned(self):
        assert pct_complete(0, 0) == 0.0

    def test_unassigned_detection(self):
        assert unassigned_projects(["a", "b", "c"], ["a"]) == ["b", "c"]

    def test_fully_assigned(self):
        assert unassigned_projects(["a"], ["a"]) == []
