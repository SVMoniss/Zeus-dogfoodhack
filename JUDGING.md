# Judging System Documentation

## Overview

The DOGFOOD 2026 judging system implements a comprehensive, fair, and transparent evaluation process for hackathon projects. It features backend-enforced isolation, weighted rubrics, cross-judge normalization, and full audit trails.

## Judge Assignment Algorithm

### Assignment Process
1. **Organizer invites judges** via email → creates User with role `judge`
2. **Organizer assigns judges to tracks** → creates `JudgeAssignment` records
3. **Judge logs in** → sees only projects in their assigned tracks
4. **Automatic batch tracking** → `JudgeBatch` records track progress per track

### Assignment Constraints
- One judge can be assigned to multiple tracks
- One track can have multiple judges
- Unique constraint: `(judge_id, track_id)` prevents duplicate assignments
- Only organizers/admins can create assignments

### Load Balancing
- System shows organizer progress dashboard with per-judge workload
- Organizers can rebalance by adding/removing assignments
- Automatic detection of unassigned projects

## Scoring Mathematics

### Weighted Rubric
Each event defines judging criteria with weights that must sum to 100%:

```
Criteria:  {C₁, C₂, ..., Cₙ}
Weights:   {w₁, w₂, ..., wₙ} where Σwᵢ = 100%
Scores:    {s₁, s₂, ..., sₙ} where minᵢ ≤ sᵢ ≤ maxᵢ
```

### Raw Project Score (per judge)
For a single judge's evaluation of one project:

```
Raw_Score(judge, project) = Σ(wᵢ × sᵢ) / 100
```

Where:
- `wᵢ` = weight of criteria i (as percentage)
- `sᵢ` = score given by judge for criteria i

### Total Weighted Score (aggregated across judges)
Since multiple judges may score the same project:

```
Project_Raw_Score(project) = Average(Raw_Score(judge, project)) over all judges who scored it
```

## Cross-Judge Normalization (Z-Score Method)

### Problem
Different judges have different scoring tendencies:
- **Lenient judges** consistently give higher scores
- **Harsh judges** consistently give lower scores
- **Inconsistent judges** vary widely per project

Without normalization, a project scored by lenient judges gets unfair advantage.

### Solution: Z-Score Normalization Per Judge

For each judge `j` and criteria `c`:

```
1. Collect all scores by judge j for criteria c:
   Sⱼ,ᶜ = {s₁, s₂, ..., sₘ}  (m = projects judged by j on criteria c)

2. Calculate judge's statistics for criteria c:
   μⱼ,ᶜ = mean(Sⱼ,ᶜ)
   σⱼ,ᶜ = stdev(Sⱼ,ᶜ)  (sample standard deviation)

3. Calculate global statistics for criteria c (across all judges):
   Sᶜ = ⋃ Sⱼ,ᶜ for all judges j
   μᶜ = mean(Sᶜ)
   σᶜ = stdev(Sᶜ)

4. Normalize each score:
   z = (s - μⱼ,ᶜ) / σⱼ,ᶜ           (if σⱼ,ᶜ > 0)
   normalized = z × σᶜ + μᶜ         (if σⱼ,ᶜ > 0)
   normalized = s                   (if σⱼ,ᶜ = 0, i.e., judge gave same score to all)

5. For project-level aggregation:
   Normalized_Score(project, criteria) = Average(normalized scores across judges)
```

### Handling Edge Cases

| Scenario | Handling |
|----------|----------|
| Judge scored only 1 project on criteria | σⱼ,ᶜ = 0 → use raw score (cannot normalize) |
| Judge gave same score to all projects | σⱼ,ᶜ = 0 → use raw score (no differentiation) |
| Incomplete batches (judge didn't score all assigned) | Only normalize on criteria they actually scored |
| Single judge for a track | Global stats = judge's stats → normalized = raw |

### Weighted Normalized Total

```
Project_Normalized_Total = Σ(weightᵢ × Normalized_Score(project, criteriaᵢ)) / 100
```

### Rank Assignment
1. Sort projects by `Project_Normalized_Total` descending
2. Assign ranks: 1, 2, 3... (ties get same rank, next rank skips)

## Multi-Method Ranking Comparison

Beyond raw and calibrated averages the portal computes two further views
over the same submitted scores (`GET /api/events/{id}/ranking`, organizer):

- **Bradley-Terry**: MM-estimated latent strengths from pairwise comparisons
  derived per judge (ties skipped; warns on disconnected graphs).
- **Borda**: per-judge ranking points with fractional points for ties.

A prize boundary (top-k set, default k=3) is **ROBUST** when every method
agrees on the set above the line, else **FRAGILE** with the disagreeing
methods named. With no scored projects the verdict is FRAGILE.

## Demo scenario: Grand Jury (30 judges × 40 projects)

Fixture-scale variant of the same idea (seed `20260929`, script
`demo-5min/seed_grand_jury.py`): project *i* (0-based) belongs to cycle
*c = i//10* and is reviewed by judges *{(3i+11c)%30, +1, +2}*, so every
10-project cycle covers all 30 judges exactly once — 4 reviews per judge,
120 slots. Biases: lenient +1 (idx 5, 14, 23), harsh −1 (idx 2, 17, 27),
idx 29 constant 3. Projects #11 and #33 ship with 2 reviews (118 rows); a
second "Solar Kiosk" is flagged and counted once. Single track, one
criterion, k=3. Observed result: FRAGILE — raw #2 "Mural Mile" falls to
calibrated #3. Video: `e2e-demo-grand-jury.mp4` (3:05, narrated twin
included), rebuilt via scenario env vars on `demo-5min/make.mjs`.

## Demo scenario: Calibration Cup (4 judges × 30 projects)

The 5-minute demo runs its own scenario (seed `20260928`, script
`demo-5min/seed_judging_demo.py`); the acceptance fixtures stay loaded
untouched. Reproduce with `python demo-5min/seed_judging_demo.py`.

- **Event**: single track ("General") and one criterion ("Overall", weight
  100) — track matching is deliberately relaxed for the demo and stated
  on screen. Prize boundary k=3.
- **Assignment**: project *i* (1-based) skips judge *(i mod 4)* over judges
  A (fair), B (lenient +1), C (harsh −1), D (constant 3). Every pair of
  judges shares ~22 projects, so the offset model is well connected.
  The plan is written to the audit trail as `assignment.generate` with
  the seed, the rule and the resulting loads (22/22/21/23 — C and A each
  lose one review to the unfinished batch below).
- **Awkward cases, all seeded**: D scores a constant 3.0 (std 0 →
  normalization falls back to raw; `/ranking` flags
  `constant: true` and accepts `?exclude_judge=` to show results with
  and without them); projects #7 and #19 ship with only 2 reviews
  (`low_confidence`); a second "Solar Kiosk" is submitted by another
  team, flagged in `duplicates`, and excluded from every method's
  ordering (`kept_project_id` = earliest submitted).
- **Observed result**: boundary verdict FRAGILE — raw #2 "Food Rescue
  Route" (lenient-judge inflation) falls to calibrated #5, and the
  constant judge's exclusion swaps the calibrated #3.

## CSV Export Format

The organizer can download results as CSV with columns:

```
Project,Team,Track,
Functionality (raw),Functionality (normalized),
Quality (raw),Quality (normalized),
Innovation (raw),Innovation (normalized),
Raw Total,Normalized Total,Rank
```

Example row:
```
"Glass Signal","NorthKiln","Security",
4.5,4.2,
3.8,3.5,
4.0,4.1,
4.1,3.9,1
```

## Backend-Enforced Judge Isolation (Critical)

### Security Requirement
> **Judges must ONLY see their own scores.** Any attempt by Judge B to access Judge A's scores must return 401/403.

### Implementation

```python
# In FastAPI dependency (app/api/judging.py)

@router.get("/judge/scores")
async def get_judge_scores(
    judge_id: Optional[UUID] = None,  # Optional query param
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Judge requesting their own scores
    if current_user.role == UserRole.JUDGE:
        if judge_id and judge_id != current_user.id:
            raise HTTPException(403, "Cannot view other judge's scores")
        target_judge_id = current_user.id
    
    # Organizer can view any judge's scores
    elif current_user.role in [UserRole.ORGANIZER, UserRole.ADMIN]:
        if not judge_id:
            raise HTTPException(400, "judge_id required for organizer")
        target_judge_id = judge_id
    
    # Participant/visitor cannot access
    else:
        raise HTTPException(403, "Insufficient permissions")
    
    # Query only target judge's scores
    scores = await db.execute(
        select(Score).where(Score.judge_id == target_judge_id)
    )
    return scores.scalars().all()
```

### Middleware Alternative (for broader protection)

```python
# app/core/middleware.py
async def judge_isolation_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/judge/scores"):
        # Extract judge_id from query or path
        # Verify current_user can access
        pass
    return await call_next(request)
```

### Checker Verification
The DOGFOOD 2026 acceptance checker (`run.py`) specifically tests:
1. `GET /api/judge/scores` as judge_a → 200 ✅
2. `GET /api/judge/scores?judge=judge_a` as judge_b → 401/403 ✅
3. `GET /api/judge/scores` as participant → 401/403 ✅

**This is the most common failure point.** Implement in backend, not frontend.

## Progress Dashboard

The organizer sees real-time progress:

### Metrics
- **Total Projects**: Submitted (non-draft) projects
- **Judged Projects**: Projects with ≥1 score
- **Pending Projects**: Total - Judged
- **Total Judges**: Assigned judges
- **Judges Completed**: Judges who finished all assigned

### Breakdown by Track
| Track | Total | Judged | Pending |
|-------|-------|--------|---------|
| Security | 15 | 12 | 3 |
| AI/ML | 20 | 18 | 2 |

### Breakdown by Judge
| Judge | Track | Assigned | Scored | % Complete |
|-------|-------|----------|--------|------------|
| Ada Okonkwo | Security | 15 | 15 | 100% |
| Wei Lindqvist | AI/ML | 20 | 15 | 75% |

## Audit Trail

Every scoring action is logged:

| Field | Description |
|-------|-------------|
| judge_id | Who scored |
| project_id | What was scored |
| criteria_id | Which criteria |
| old_score | Previous value (null if new) |
| new_score | New value |
| timestamp | When |
| ip_address | Source (optional) |

## Anti-Collusion Measures

1. **Backend Isolation**: Judges cannot see each other's scores
2. **Randomized Assignment**: Judges don't know who else scores their projects
3. **Normalization**: Mathematical correction for bias
4. **Audit Trail**: All scores traceable to judge + timestamp
5. **Batch Tracking**: Incomplete batches flagged for organizer review
6. **Weight Validation**: Criteria weights must sum to 100% (enforced on create/update)

## Configuration

### Criteria Weights
- Organizer defines in UI or API
- Must sum to 100% (validated on create/update)
- Default: Functionality 40%, Quality 30%, Innovation 30%

### Score Ranges
- Default: 1-5 for all criteria
- Configurable per criteria (min_score, max_score)
- Integer scores only

### Normalization Parameters
- Method: Z-score (configurable: percentile, Bradley-Terry planned)
- Minimum scores per judge per criteria: 2 (for stdev calculation)
- Global stats computed across all judges for each criteria

## API Reference

### Get My Scores (Judge)
```
GET /api/judge/scores
Headers: Cookie: session=<judge_token>
Response: 200 + [Score objects]
```

### Submit Scores (Judge)
```
POST /api/judge/scores/{project_id}
Headers: Cookie: session=<judge_token>
Body: [{"criteria_id": "...", "score": 4, "comment": "Good"}]
Response: 200 + [Score objects]
```

### Get Judge Scores (Organizer)
```
GET /api/judge/scores?judge={judge_id}
Headers: Cookie: session=<organizer_token>
Response: 200 + [Score objects]
```

### Progress Dashboard (Organizer)
```
GET /api/events/{id}/judging/progress
Headers: Cookie: session=<organizer_token>
Response: 200 + ProgressDashboard
```

### CSV Export (Organizer)
```
GET /api/events/{id}/export.csv
Headers: Cookie: session=<organizer_token>
Response: 200 + text/csv attachment
```

### Normalization Report (Organizer)
```
GET /api/events/{id}/normalization
Headers: Cookie: session=<organizer_token>
Response: 200 + [NormalizationReport]
```