"""Multi-method ranking comparison and robustness verdicts.

Methods consume the same submitted human scores; no method receives a
private modifier (pipeline doc section 8):
- raw average: mean weighted total per project
- calibrated average: z-score normalized total (see normalization service)
- bradley_terry: MM-estimated latent strengths from pairwise comparisons
  derived from judges who scored both projects (ties skipped)
- borda: per-judge ranking points with fractional points for ties

A prize boundary (top-k set) is ROBUST when every method with enough data
agrees on the set above the line, else FRAGILE with an explanation.
"""
import math
from collections import defaultdict
from typing import Dict, List, Tuple


def weighted_totals(
    by_judge_project: Dict[Tuple[str, str], float],
) -> Dict[str, List[Tuple[str, float]]]:
    """Group (judge, project) totals per judge: {judge: [(project, total)]}."""
    out: Dict[str, List[Tuple[str, float]]] = defaultdict(list)
    for (judge, project), total in by_judge_project.items():
        out[judge].append((project, total))
    return out


def raw_order(by_judge_project: Dict[Tuple[str, str], float]) -> List[str]:
    """Projects by mean raw total across judges (desc, id tiebreak)."""
    per_project: Dict[str, List[float]] = defaultdict(list)
    for (judge, project), total in by_judge_project.items():
        per_project[project].append(total)
    avg = {p: sum(v) / len(v) for p, v in per_project.items()}
    return [p for p, _ in sorted(avg.items(), key=lambda kv: (-kv[1], kv[0]))]


def bradley_terry(
    by_judge_project: Dict[Tuple[str, str], float],
    iters: int = 100,
) -> Tuple[Dict[str, float], str]:
    """MM estimate of latent strengths. Returns (thetas, warning).

    Ties contribute nothing and are skipped. Judges scoring fewer than two
    projects yield no pairs. A disconnected comparison graph warns that the
    ranking is not globally grounded.
    """
    wins: Dict[str, float] = defaultdict(float)
    pairs: Dict[Tuple[str, str], float] = defaultdict(float)
    for judge, projs in weighted_totals(by_judge_project).items():
        for i in range(len(projs)):
            for j in range(i + 1, len(projs)):
                (pa, sa), (pb, sb) = projs[i], projs[j]
                if sa == sb:
                    continue
                w, l = (pa, pb) if sa > sb else (pb, pa)
                wins[w] += 1.0
                pairs[(w, l)] += 1.0
                pairs[(l, w)] += 0.0

    projects = sorted({p for pair in pairs for p in pair})
    if not projects:
        return {}, "no pairwise comparisons available"
    theta = {p: 0.0 for p in projects}
    for _ in range(iters):
        new = {}
        for p in projects:
            denom = 0.0
            for q in projects:
                if q == p:
                    continue
                n = pairs.get((p, q), 0.0) + pairs.get((q, p), 0.0)
                if n:
                    denom += n / (math.exp(theta[p]) + math.exp(theta[q]))
            new[p] = math.log(wins[p] / denom) if denom > 0 and wins[p] > 0 else theta[p]
        theta = new

    # Connectivity: every project must share a comparison path.
    seen = {projects[0]}
    frontier = [projects[0]]
    while frontier:
        cur = frontier.pop()
        for q in projects:
            if q not in seen and (
                pairs.get((cur, q), 0) > 0 or pairs.get((q, cur), 0) > 0
            ):
                seen.add(q)
                frontier.append(q)
    warning = ""
    if len(seen) < len(projects):
        warning = "comparison graph is disconnected; ranking is not globally grounded"
    return theta, warning


def borda(by_judge_project: Dict[Tuple[str, str], float]) -> Dict[str, float]:
    """Per-judge ranking points with fractional points for ties.

    For n ranked projects, positions share (n - rank) points averaged
    across tied members.
    """
    points: Dict[str, float] = defaultdict(float)
    for judge, projs in weighted_totals(by_judge_project).items():
        ordered = sorted(projs, key=lambda pt: (-pt[1], pt[0]))
        n = len(ordered)
        i = 0
        while i < n:
            j = i
            while j < n and ordered[j][1] == ordered[i][1]:
                j += 1
            share = sum(n - 1 - r for r in range(i, j)) / (j - i)
            for k in range(i, j):
                points[ordered[k][0]] += share
            i = j
    return dict(points)


def order_of(scores: Dict[str, float]) -> List[str]:
    return [p for p, _ in sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))]


def robustness(
    orders: Dict[str, List[str]], k: int
) -> Tuple[str, str, List[str], List[str]]:
    """Compare top-k SETS across methods.

    Returns (verdict, explanation, above, below). ROBUST means every
    non-empty method agrees on the set above the line. With no scored
    projects the verdict is FRAGILE (nothing to defend).
    """
    sets = {m: set(o[:k]) for m, o in orders.items() if o}
    union_projects = sorted({p for o in orders.values() for p in o})
    if not union_projects:
        return "FRAGILE", "no scored projects to rank", [], []
    if not sets:
        return "FRAGILE", "no method produced an ordering", [], union_projects
    first = next(iter(sets.values()))
    if all(s == first for s in sets.values()):
        above = sorted(first)
        below = sorted(set(union_projects) - first)
        return (
            "ROBUST",
            f"all {len(sets)} ranking methods agree on the top-{k}",
            above,
            below,
        )
    disagree = sorted(m for m, s in sets.items() if s != first)
    above = sorted(first)
    below = sorted(set(union_projects) - first)
    return (
        "FRAGILE",
        f"methods disagree on the top-{k}: {', '.join(disagree)} differ",
        above,
        below,
    )
