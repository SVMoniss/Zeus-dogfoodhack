"""Live API integration tests for JUDGING.md use cases.

Hits the real stack (FastAPI + Postgres) at DOGFOOD_API
(default http://localhost:8000). Skips cleanly when the backend is
not reachable, so plain unit runs stay green anywhere.

Covers end-to-end (no mocks):
- Checker trio: own scores 200 / peer 403 / participant 403
- Organizer view-any (200) vs missing param (400)
- Freeze regression: 99.99 rubric freezes (Decimal fix); off-100 rejected;
  criteria creation over 100% rejected
- Submit guards: happy path, out-of-range 400, unassigned track 403,
  declared conflict 403
- Normalization report math, ranking ROBUST verdict, CSV export, progress
"""
import os
import random
import time
from datetime import datetime, timedelta, timezone

import httpx
import pytest

API = os.environ.get("DOGFOOD_API", "http://localhost:8000")
JUDGE_A = "00000000-0000-0000-0000-000000000002"
JUDGE_B = "00000000-0000-0000-0000-000000000003"


def _backend_up():
    try:
        return httpx.get(API + "/health", timeout=5).status_code == 200
    except Exception:
        return False


if not _backend_up():
    pytest.skip(f"live backend not reachable at {API}", allow_module_level=True)


def login(email, password="testpass123"):
    r = httpx.post(f"{API}/api/auth/login",
                   json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def close(a, b, tol=0.1):
    return abs(a - b) < tol


@pytest.fixture(scope="module")
def creds():
    return {
        "org": login("organizer@dogfood.local"),
        "part": login("participant@dogfood.local"),
        "ja": login("judge_a@dogfood.local"),
        "jb": login("judge_b@dogfood.local"),
    }


@pytest.fixture(scope="module")
def scored_event(creds):
    """Shared event for guard/mutation tests. Report tests use their own
    pristine event (report_event) so extra probe scores can't shift the math."""
    return _build_scored_event(creds, "live")


@pytest.fixture(scope="module")
def report_event(creds):
    """Pristine flat-(3,3)+spread-(1,5) event; nothing ever mutates it."""
    return _build_scored_event(creds, "report")


def _build_scored_event(creds, tag):
    """Create event: 1 track, 1x100% criterion, 2 judges, 2 submitted
    projects scored flat (3,3) by A and spread (1,5) by B."""
    stamp = f"{int(time.time())}{random.randint(0, 99999)}"
    slug = f"{tag}-{stamp}"
    H_org, H_part = auth(creds["org"]), auth(creds["part"])
    now = datetime.now(timezone.utc)
    open_ = (now - timedelta(days=1)).isoformat()
    close_ = (now + timedelta(days=30)).isoformat()

    r = httpx.post(f"{API}/api/events", headers=H_org, json={
        "name": f"Live {stamp}", "slug": slug, "description": "live judging",
        "submissions_open_at": open_, "submissions_close_at": close_}, timeout=15)
    assert r.status_code in (200, 201), r.text
    event = r.json()

    r = httpx.post(f"{API}/api/events/{event['id']}/tracks",
                   headers=H_org, json={"name": "General"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    track = r.json()

    r = httpx.post(f"{API}/api/events/{event['id']}/criteria", headers=H_org, json={
        "name": "Functionality", "weight": 100, "min_score": 1, "max_score": 5},
        timeout=15)
    assert r.status_code in (200, 201), r.text
    criteria = r.json()

    for jid in (JUDGE_A, JUDGE_B):
        r = httpx.post(f"{API}/api/events/{event['id']}/judges/assign",
                       headers=H_org, json={"judge_id": jid, "track_id": track["id"]},
                       timeout=15)
        assert r.status_code in (200, 201), r.text

    r = httpx.post(f"{API}/api/events/{event['id']}/teams",
                   headers=H_part, json={"name": f"Live Team {stamp}"}, timeout=15)
    assert r.status_code in (200, 201), r.text

    pids = {}
    for name in ("Live P1", "Live P2"):
        r = httpx.post(f"{API}/api/events/{slug}/projects", headers=H_part, json={
            "title": f"{name} {stamp}", "summary": "live", "track_id": track["id"]},
            timeout=15)
        assert r.status_code in (200, 201), r.text
        p = r.json()
        pids[name] = p["id"]
        r = httpx.post(f"{API}/api/events/{slug}/projects/{p['id']}/submit",
                       headers=H_part, timeout=15)
        assert r.status_code in (200, 201), r.text

    for tok, vals in ((creds["ja"], [3, 3]), (creds["jb"], [1, 5])):
        for pid, val in zip((pids["Live P1"], pids["Live P2"]), vals):
            r = httpx.post(f"{API}/api/judge/scores/{pid}", headers=auth(tok),
                           json=[{"criteria_id": criteria["id"], "score": val}],
                           timeout=15)
            assert r.status_code in (200, 201), r.text

    return {"event": event, "slug": slug, "track": track, "criteria": criteria,
            "p1": pids["Live P1"], "p2": pids["Live P2"], "stamp": stamp}


def _fresh_project(creds, scored_event, title, track_id=None):
    H = auth(creds["part"])
    r = httpx.post(f"{API}/api/events/{scored_event['slug']}/projects", headers=H, json={
        "title": title, "summary": "probe",
        "track_id": track_id or scored_event["track"]["id"]}, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


class TestCheckerTrioLive:
    def test_judge_sees_own_scores(self, creds):
        r = httpx.get(f"{API}/api/judge/scores", headers=auth(creds["ja"]), timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_judge_cannot_see_peer_by_email(self, creds):
        r = httpx.get(f"{API}/api/judge/scores?judge=judge_a@dogfood.local",
                      headers=auth(creds["jb"]), timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_judge_cannot_see_peer_by_id(self, creds):
        r = httpx.get(f"{API}/api/judge/scores?judge_id={JUDGE_A}",
                      headers=auth(creds["jb"]), timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_participant_blocked(self, creds):
        r = httpx.get(f"{API}/api/judge/scores", headers=auth(creds["part"]), timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_organizer_views_any_judge(self, creds):
        r = httpx.get(f"{API}/api/judge/scores?judge_id={JUDGE_A}",
                      headers=auth(creds["org"]), timeout=15)
        assert r.status_code == 200, r.text

    def test_organizer_missing_param_400(self, creds):
        r = httpx.get(f"{API}/api/judge/scores", headers=auth(creds["org"]), timeout=15)
        assert r.status_code == 400, r.text


class TestFreezeLive:
    def _event_with_weights(self, creds, weights):
        stamp = f"{int(time.time())}{random.randint(0, 99999)}"
        slug = f"frz-{stamp}"
        H = auth(creds["org"])
        now = datetime.now(timezone.utc)
        r = httpx.post(f"{API}/api/events", headers=H, json={
            "name": f"Frz {stamp}", "slug": slug, "description": "freeze",
            "submissions_open_at": (now - timedelta(days=1)).isoformat(),
            "submissions_close_at": (now + timedelta(days=30)).isoformat()}, timeout=15)
        assert r.status_code in (200, 201), r.text
        eid = r.json()["id"]
        for i, w in enumerate(weights):
            r = httpx.post(f"{API}/api/events/{eid}/criteria", headers=H, json={
                "name": f"C{i}", "weight": w, "min_score": 1, "max_score": 5},
                timeout=15)
            assert r.status_code in (200, 201), r.text
        return eid

    def test_freeze_99_99_allowed(self, creds):
        # Regression: Decimal 40+30+29.99 must freeze (float quirk fixed).
        eid = self._event_with_weights(creds, [40, 30, 29.99])
        r = httpx.post(f"{API}/api/events/{eid}/rubric/freeze",
                       headers=auth(creds["org"]), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["total_weight"] == "99.99"

    def test_freeze_off_100_rejected(self, creds):
        eid = self._event_with_weights(creds, [50])
        r = httpx.post(f"{API}/api/events/{eid}/rubric/freeze",
                       headers=auth(creds["org"]), timeout=15)
        assert r.status_code == 400, r.text

    def test_create_over_100_rejected(self, creds, scored_event):
        # Shared event already at 100% -> any addition exceeds.
        r = httpx.post(f"{API}/api/events/{scored_event['event']['id']}/criteria",
                       headers=auth(creds["org"]),
                       json={"name": "Extra", "weight": 10, "min_score": 1,
                             "max_score": 5}, timeout=15)
        assert r.status_code == 400, r.text


class TestSubmitGuardsLive:
    def test_happy_path(self, creds, scored_event):
        pid = _fresh_project(creds, scored_event, f"Probe happy {scored_event['stamp']}")
        r = httpx.post(f"{API}/api/judge/scores/{pid}", headers=auth(creds["ja"]), json=[
            {"criteria_id": scored_event["criteria"]["id"], "score": 4,
             "comment": "Good"}], timeout=15)
        assert r.status_code in (200, 201), r.text
        assert r.json()[0]["score"] == 4

    def test_out_of_range_400(self, creds, scored_event):
        r = httpx.post(f"{API}/api/judge/scores/{scored_event['p1']}",
                       headers=auth(creds["ja"]), json=[
            {"criteria_id": scored_event["criteria"]["id"], "score": 6}],
            timeout=15)
        assert r.status_code == 400, r.text

    def test_unassigned_track_403(self, creds, scored_event):
        H = auth(creds["org"])
        r = httpx.post(f"{API}/api/events/{scored_event['event']['id']}/tracks",
                       headers=H, json={"name": "Other"}, timeout=15)
        assert r.status_code in (200, 201), r.text
        pid = _fresh_project(creds, scored_event,
                             f"Probe other {scored_event['stamp']}", r.json()["id"])
        r = httpx.post(f"{API}/api/judge/scores/{pid}", headers=auth(creds["ja"]), json=[
            {"criteria_id": scored_event["criteria"]["id"], "score": 3}], timeout=15)
        assert r.status_code == 403, r.text

    def test_declared_conflict_403(self, creds, scored_event):
        pid = _fresh_project(creds, scored_event,
                             f"Probe conflict {scored_event['stamp']}")
        r = httpx.post(f"{API}/api/events/{scored_event['event']['id']}/conflicts",
                       headers=auth(creds["ja"]), json={"project_id": pid},
                       timeout=15)
        assert r.status_code in (200, 201), r.text
        r = httpx.post(f"{API}/api/judge/scores/{pid}", headers=auth(creds["ja"]), json=[
            {"criteria_id": scored_event["criteria"]["id"], "score": 3}], timeout=15)
        assert r.status_code == 403, r.text


class TestReportsLive:
    def test_normalization_math(self, creds, report_event):
        r = httpx.get(f"{API}/api/events/{report_event['event']['id']}/normalization",
                      headers=auth(creds["org"]), timeout=15)
        assert r.status_code == 200, r.text
        by_judge = {x["judge_id"]: x for x in r.json()}
        assert close(by_judge[JUDGE_A]["mean"], 3)
        assert by_judge[JUDGE_A]["std"] == 0
        assert close(by_judge[JUDGE_A]["normalized_scores"][report_event["p1"]], 3)
        assert close(by_judge[JUDGE_B]["std"], 2.83, 0.05)
        assert close(by_judge[JUDGE_B]["normalized_scores"][report_event["p1"]], 1.85)
        assert close(by_judge[JUDGE_B]["normalized_scores"][report_event["p2"]], 4.15)

    def test_ranking_robust(self, creds, report_event):
        r = httpx.get(f"{API}/api/events/{report_event['event']['id']}/ranking?k=1",
                      headers=auth(creds["org"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert sorted(body["methods"]) == ["borda", "bradley_terry",
                                           "calibrated_average", "raw_average"]
        assert body["methods"]["raw_average"] == [report_event["p2"], report_event["p1"]]
        assert body["verdict"] == "ROBUST"

    def test_csv_export(self, creds, report_event):
        r = httpx.get(f"{API}/api/events/{report_event['slug']}/export.csv",
                      headers=auth(creds["org"]), timeout=15)
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        lines = r.text.replace("\r", "").strip().split("\n")
        assert "Normalized Total" in lines[0] and "Rank" in lines[0]
        ranks = sorted(line.rsplit(",", 1)[1].strip().strip('"') for line in lines[1:])
        assert ranks == ["1", "2"]

    def test_progress_dashboard(self, creds, report_event):
        r = httpx.get(
            f"{API}/api/events/{report_event['event']['id']}/judging/progress",
            headers=auth(creds["org"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total_projects"] == 2
        assert body["judged_projects"] == 2
        assert body["pending_projects"] == 0
        assert body["by_track"]["General"] == {"total": 2, "judged": 2, "pending": 0}
