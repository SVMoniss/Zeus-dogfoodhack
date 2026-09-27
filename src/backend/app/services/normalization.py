"""Cross-judge z-score normalization (T2), exactly as documented in JUDGING.md.

For each judge j and criterion c, with the judge's scores S(j,c):
  mean_jc = mean(S(j,c)); sd_jc = sample stdev (0.0 when < 2 values)
  mean_c, sd_c = global mean/stdev across all judges for c
  normalized(s) = s                                        if sd_jc == 0
                = (s - mean_jc) / sd_jc * sd_c + mean_c   otherwise

Project level: Normalized_Score(p, c) = mean of normalized scores across
judges; Project_Normalized_Total(p) = weight-weighted sum / 100.
Ranks use standard competition ranking (ties share a rank, next skips).
"""
import statistics
from typing import Dict, List, Tuple


def judge_stats(values: List[float]) -> Tuple[float, float]:
    """(mean, sample stdev); stdev is 0.0 when fewer than 2 values."""
    if not values:
        return 0.0, 0.0
    mean = statistics.mean(values)
    if len(values) < 2:
        return mean, 0.0
    return mean, statistics.stdev(values)


def normalize_value(
    s: float, mean_j: float, sd_j: float, mean_g: float, sd_g: float
) -> float:
    if sd_j == 0:
        return float(s)
    return (s - mean_j) / sd_j * sd_g + mean_g


def normalize_project_scores(
    scores: List[dict], weights: Dict[str, float]
) -> Dict[str, dict]:
    """Aggregate raw score rows into per-project normalized totals.

    scores: [{judge_id, project_id, criteria, score}] (criteria = name).
    weights: {criteria_name: weight_percent}.
    Returns {project_id: {raw_total, normalized_total}} (raw rounded later).
    """
    from collections import defaultdict

    per_judge_crit = defaultdict(list)
    per_crit = defaultdict(list)
    for s in scores:
        per_judge_crit[(s["judge_id"], s["criteria"])].append(s["score"])
        per_crit[s["criteria"]].append(s["score"])

    stats_jc = {k: judge_stats(v) for k, v in per_judge_crit.items()}
    stats_c = {c: judge_stats(v) for c, v in per_crit.items()}

    norm_by_project_crit = defaultdict(list)
    for s in scores:
        mj, sdj = stats_jc[(s["judge_id"], s["criteria"])]
        mg, sdg = stats_c[s["criteria"]]
        norm_by_project_crit[(s["project_id"], s["criteria"])].append(
            normalize_value(s["score"], mj, sdj, mg, sdg)
        )

    projects = {s["project_id"] for s in scores}
    out: Dict[str, dict] = {}
    for p in projects:
        raw_total = 0.0
        norm_total = 0.0
        for crit, w in weights.items():
            raws = [s["score"] for s in scores if s["project_id"] == p and s["criteria"] == crit]
            norms = norm_by_project_crit.get((p, crit), [])
            if raws:
                raw_total += (sum(raws) / len(raws)) * w / 100.0
            if norms:
                norm_total += (sum(norms) / len(norms)) * w / 100.0
        out[p] = {"raw_total": raw_total, "normalized_total": norm_total}
    return out


def rank_totals(totals: Dict[str, float]) -> Dict[str, int]:
    """Standard competition ranking: ties share a rank, the next rank skips."""
    ordered = sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))
    ranks: Dict[str, int] = {}
    last_value = None
    last_rank = 0
    for i, (pid, value) in enumerate(ordered, start=1):
        if value != last_value:
            last_rank = i
            last_value = value
        ranks[pid] = last_rank
    return ranks
