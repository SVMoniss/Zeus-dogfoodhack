from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime, timezone
from typing import List, Optional
from decimal import Decimal
from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    require_judge,
    require_organizer,
    require_participant,
    resolve_event,
)
from app.models import (
    JudgingCriteria, JudgeAssignment, Score, JudgeBatch, Project, User, Event, Track,
    Team, TeamMember, Conflict,
)
from app.models.enums import UserRole
from app.schemas.judging import (
    JudgingCriteriaCreate, JudgingCriteriaUpdate, JudgingCriteriaResponse,
    JudgeInvite, JudgeAssign, JudgeAssignmentResponse,
    ScoreCreate, ScoreSubmit, ScoreResponse,
    ProjectScoreSummary, ProgressDashboard, NormalizationReport,
    ConflictCreate, ConflictResponse,
)
from app.api.t4 import notify
from app.services.audit import log_audit

router = APIRouter(prefix="/api", tags=["judging"])


# Judging Criteria
@router.post("/events/{event_identifier}/criteria", response_model=JudgingCriteriaResponse, status_code=status.HTTP_201_CREATED)
async def create_criteria(
    event_identifier: str,
    criteria_data: JudgingCriteriaCreate,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if event.rubric_frozen:
        raise HTTPException(status_code=400, detail="Rubric is frozen and cannot be edited")

    # Validate weight sum
    existing = await db.execute(select(JudgingCriteria).where(JudgingCriteria.event_id == event.id))
    total_weight = sum(c.weight for c in existing.scalars()) + criteria_data.weight
    if total_weight > 100:
        raise HTTPException(status_code=400, detail="Total criteria weight cannot exceed 100%")

    criteria = JudgingCriteria(**criteria_data.model_dump(), event_id=event.id)
    db.add(criteria)
    await db.flush()
    await log_audit(
        db, action="criteria.create", actor_id=current_user.id,
        event_id=event.id, entity="criteria", entity_id=criteria.id,
        details={"name": criteria.name, "weight": str(criteria.weight)},
    )
    await db.commit()
    await db.refresh(criteria)

    return criteria


@router.get("/events/{event_identifier}/criteria", response_model=List[JudgingCriteriaResponse])
async def list_criteria(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(
        select(JudgingCriteria).where(JudgingCriteria.event_id == event.id).order_by(JudgingCriteria.display_order)
    )
    return result.scalars().all()


@router.patch("/criteria/{criteria_id}", response_model=JudgingCriteriaResponse)
async def update_criteria(
    criteria_id: UUID,
    criteria_data: JudgingCriteriaUpdate,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(JudgingCriteria).where(JudgingCriteria.id == criteria_id))
    criteria = result.scalar_one_or_none()

    if not criteria:
        raise HTTPException(status_code=404, detail="Criteria not found")

    event_check = await db.execute(select(Event).where(Event.id == criteria.event_id))
    if event_check.scalar_one_or_none().rubric_frozen:
        raise HTTPException(status_code=400, detail="Rubric is frozen and cannot be edited")
    
    # Validate weight sum
    existing = await db.execute(select(JudgingCriteria).where(JudgingCriteria.event_id == criteria.event_id, JudgingCriteria.id != criteria_id))
    total_weight = sum(c.weight for c in existing.scalars()) + (criteria_data.weight or criteria.weight)
    if total_weight > 100:
        raise HTTPException(status_code=400, detail="Total criteria weight cannot exceed 100%")
    
    update_data = criteria_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(criteria, field, value)

    await log_audit(
        db, action="criteria.update", actor_id=current_user.id,
        event_id=criteria.event_id, entity="criteria", entity_id=criteria.id,
        details={"fields": sorted(update_data.keys())},
    )
    await db.commit()
    await db.refresh(criteria)

    return criteria


# Rubric freeze: locked rubrics cannot be edited, and freezing requires
# weights to sum to exactly 100 (pipeline doc: fixed scoring rules).
@router.post("/events/{event_identifier}/rubric/freeze")
async def freeze_rubric(
    event_identifier: str,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    existing = await db.execute(
        select(JudgingCriteria).where(JudgingCriteria.event_id == event.id)
    )
    total = sum((c.weight for c in existing.scalars()), Decimal(0))
    # Decimal comparison: float(total) would turn e.g. 99.99 into
    # 99.98999... and wrongly reject a within-tolerance rubric.
    if abs(total - Decimal(100)) > Decimal("0.01"):
        raise HTTPException(
            status_code=400,
            detail=f"Rubric weights sum to {total}, must total exactly 100 to freeze",
        )
    event.rubric_frozen = True
    await log_audit(
        db, action="rubric.freeze", actor_id=current_user.id,
        event_id=event.id, entity="event", entity_id=event.id,
        details={"total_weight": str(total)},
    )
    await db.commit()
    return {"message": "Rubric frozen", "total_weight": str(total)}


# Judge conflicts: declared pairs are excluded from scoring.
@router.post(
    "/events/{event_identifier}/conflicts",
    response_model=ConflictResponse,
    status_code=status.HTTP_201_CREATED,
)
async def declare_conflict(
    event_identifier: str,
    data: ConflictCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if current_user.role == UserRole.JUDGE:
        judge_id = current_user.id
    elif current_user.role in (UserRole.ORGANIZER, UserRole.ADMIN):
        if not data.judge_id:
            raise HTTPException(status_code=400, detail="judge_id required")
        judge_id = data.judge_id
    else:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    project = (
        await db.execute(
            select(Project).where(Project.id == data.project_id, Project.event_id == event.id)
        )
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    row = Conflict(
        event_id=event.id, judge_id=judge_id, project_id=project.id,
        reason=data.reason, declared_by=current_user.id,
    )
    db.add(row)
    try:
        await db.flush()
    except Exception:
        raise HTTPException(status_code=400, detail="Conflict already declared")
    await log_audit(
        db, action="conflict.declare", actor_id=current_user.id,
        event_id=event.id, entity="conflict", entity_id=row.id,
        details={"judge_id": str(judge_id), "project_id": str(project.id)},
    )
    await db.commit()
    await db.refresh(row)
    return row


@router.get(
    "/events/{event_identifier}/conflicts",
    response_model=List[ConflictResponse],
)
async def list_conflicts(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(select(Conflict).where(Conflict.event_id == event.id))
    return result.scalars().all()


@router.delete("/events/{event_identifier}/conflicts/{conflict_id}", status_code=204)
async def remove_conflict(
    event_identifier: str,
    conflict_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(
        select(Conflict).where(Conflict.id == conflict_id, Conflict.event_id == event.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Conflict not found")
    await log_audit(
        db, action="conflict.remove", actor_id=current_user.id,
        event_id=event.id, entity="conflict", entity_id=row.id, details={},
    )
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)


# Judge Management
@router.post("/events/{event_identifier}/judges/invite", status_code=status.HTTP_201_CREATED)
async def invite_judge(
    event_identifier: str,
    invite_data: JudgeInvite,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Find or create user
    result = await db.execute(select(User).where(User.email == invite_data.email))
    user = result.scalar_one_or_none()
    
    if not user:
        # Create judge user with placeholder password
        user = User(
            email=invite_data.email,
            password_hash="",  # Will be set on first login
            full_name=invite_data.email.split("@")[0],
            role=UserRole.JUDGE,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)

    await log_audit(
        db, action="judge.invite", actor_id=current_user.id,
        event_id=event.id, entity="user", entity_id=user.id,
        details={"email": user.email},
    )
    await db.commit()

    return {"message": "Judge invited", "judge_id": str(user.id), "email": user.email}


@router.get("/events/{event_identifier}/judges", response_model=List[JudgeAssignmentResponse])
async def list_judges(
    event_identifier: str,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    query = select(JudgeAssignment).options(
        selectinload(JudgeAssignment.judge),
        selectinload(JudgeAssignment.track)
    ).where(JudgeAssignment.event_id == event.id)
    result = await db.execute(query)
    assignments = result.scalars().all()
    
    return [
        JudgeAssignmentResponse(
            id=a.id,
            event_id=a.event_id,
            judge_id=a.judge_id,
            track_id=a.track_id,
            judge_name=a.judge.full_name,
            judge_email=a.judge.email,
            track_name=a.track.name,
        )
        for a in assignments
    ]


@router.post("/events/{event_identifier}/judges/assign", response_model=JudgeAssignmentResponse)
async def assign_judge(
    event_identifier: str,
    assign_data: JudgeAssign,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check judge exists and is a judge
    result = await db.execute(select(User).where(User.id == assign_data.judge_id, User.role == UserRole.JUDGE))
    judge = result.scalar_one_or_none()
    
    if not judge:
        raise HTTPException(status_code=400, detail="Invalid judge")
    
    # Check track belongs to event
    track_result = await db.execute(select(Track).where(Track.id == assign_data.track_id, Track.event_id == event.id))
    track = track_result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=400, detail="Invalid track for this event")

    assignment = JudgeAssignment(
        event_id=event.id,
        judge_id=assign_data.judge_id,
        track_id=assign_data.track_id,
        assigned_by=current_user.id,
    )
    db.add(assignment)
    await db.flush()
    await log_audit(
        db, action="judge.assign", actor_id=current_user.id,
        event_id=event.id, entity="assignment", entity_id=assignment.id,
        details={"judge_id": str(assign_data.judge_id), "track_id": str(assign_data.track_id)},
    )
    await db.commit()
    await db.refresh(assignment)
    
    return JudgeAssignmentResponse(
        id=assignment.id,
        event_id=assignment.event_id,
        judge_id=assignment.judge_id,
        track_id=assignment.track_id,
        judge_name=judge.full_name,
        judge_email=judge.email,
        track_name=track.name,
    )


# CRITICAL: Judge cannot see peer scores - backend enforced
@router.get("/judge/scores", response_model=List[ScoreResponse])
async def get_judge_scores(
    judge_id: Optional[UUID] = None,
    judge: Optional[str] = None,  # Allow judge email/name for peer_scores check
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get judge scores with backend-enforced isolation:
    - Judge can only see their own scores
    - Organizer can see any judge's scores
    - Participant cannot access
    """
    # Resolve judge parameter to judge_id if provided
    if judge and not judge_id:
        # Try to find judge by email
        result = await db.execute(select(User).where(User.email == judge))
        judge_user = result.scalar_one_or_none()
        if judge_user:
            judge_id = judge_user.id
    
    # Judge can only see their own scores
    if current_user.role == UserRole.JUDGE:
        if judge_id and judge_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot view other judge's scores")
        target_judge_id = current_user.id
    
    # Organizer can see any judge's scores
    elif current_user.role in [UserRole.ORGANIZER, UserRole.ADMIN]:
        if not judge_id:
            raise HTTPException(status_code=400, detail="judge_id parameter required for organizer")
        target_judge_id = judge_id
    
    # Participant cannot access
    else:
        raise HTTPException(status_code=403, detail="Participants cannot access judge scores")
    
    query = select(Score).options(
        selectinload(Score.criteria),
        selectinload(Score.project)
    ).where(Score.judge_id == target_judge_id)
    result = await db.execute(query)
    scores = result.scalars().all()
    return scores


@router.post("/judge/scores/{project_id}", response_model=List[ScoreResponse])
async def submit_score_for_project(
    project_id: UUID,
    scores: List[ScoreCreate],
    background: BackgroundTasks,
    current_user: User = Depends(require_judge),
    db: AsyncSession = Depends(get_db),
):
    """Submit scores for a specific project by the current judge."""
    # Verify project exists and is assigned to this judge
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if judge is assigned to this project's track
    assignment = await db.execute(
        select(JudgeAssignment).where(
            JudgeAssignment.judge_id == current_user.id,
            JudgeAssignment.event_id == project.event_id,
            JudgeAssignment.track_id == project.track_id,
        )
    )
    if not assignment.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not assigned to this project's track")

    # Self-review exclusion: a judge cannot score their own team's project
    own_team = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == project.team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    if own_team.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Cannot score your own team's project")

    # Declared conflicts exclude scoring
    conflict = await db.execute(
        select(Conflict).where(
            Conflict.event_id == project.event_id,
            Conflict.judge_id == current_user.id,
            Conflict.project_id == project.id,
        )
    )
    if conflict.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Conflict declared for this project")
    
    results = []
    for score_data in scores:
        # Verify criteria belongs to this event
        criteria_result = await db.execute(
            select(JudgingCriteria).where(
                JudgingCriteria.id == score_data.criteria_id,
                JudgingCriteria.event_id == project.event_id,
            )
        )
        criteria = criteria_result.scalar_one_or_none()
        if not criteria:
            raise HTTPException(status_code=400, detail=f"Invalid criteria: {score_data.criteria_id}")
        
        # Validate score range
        if not (criteria.min_score <= score_data.score <= criteria.max_score):
            raise HTTPException(
                status_code=400,
                detail=f"Score must be between {criteria.min_score} and {criteria.max_score}"
            )
        
        # Upsert score
        existing = await db.execute(
            select(Score).where(
                Score.judge_id == current_user.id,
                Score.project_id == project_id,
                Score.criteria_id == score_data.criteria_id,
            )
        )
        score = existing.scalar_one_or_none()
        
        if score:
            score.score = score_data.score
            score.comment = score_data.comment
            score.submitted_at = datetime.now(timezone.utc)
        else:
            score = Score(
                event_id=project.event_id,
                judge_id=current_user.id,
                project_id=project_id,
                criteria_id=score_data.criteria_id,
                score=score_data.score,
                comment=score_data.comment,
                submitted_at=datetime.now(timezone.utc),
            )
            db.add(score)
        
        results.append(score)
    
    await log_audit(
        db, action="score.submit", actor_id=current_user.id,
        event_id=project.event_id, entity="project", entity_id=project_id,
        details={"scores": len(results)},
    )
    await db.commit()
    for r in results:
        await db.refresh(r)

    background.add_task(
        notify, project.event_id, "score.submitted",
        {"project_id": str(project_id), "judge_id": str(current_user.id)},
    )

    return results


# Progress Dashboard
@router.get("/events/{event_identifier}/judging/progress", response_model=ProgressDashboard)
async def get_judging_progress(
    event_identifier: str,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    event_id = event.id
    
    # Total projects
    total_projects = await db.execute(
        select(func.count(Project.id)).where(Project.event_id == event_id, Project.is_draft == False)
    )
    total = total_projects.scalar() or 0
    
    # Judged projects
    judged = await db.execute(
        select(func.count(Project.id.distinct()))
        .select_from(Project)
        .join(Score, Score.project_id == Project.id)
        .where(Project.event_id == event_id, Project.is_draft == False)
    )
    judged_count = judged.scalar() or 0
    
    # Total judges
    total_judges = await db.execute(
        select(func.count(JudgeAssignment.id.distinct())).where(JudgeAssignment.event_id == event_id)
    )
    judges_total = total_judges.scalar() or 0
    
    # Judges completed
    judges_completed = await db.execute(
        select(func.count(Score.judge_id.distinct())).where(Score.event_id == event_id)
    )
    completed = judges_completed.scalar() or 0
    
    # By track
    tracks_result = await db.execute(select(Track).where(Track.event_id == event_id))
    tracks = tracks_result.scalars().all()
    
    by_track = {}
    for track in tracks:
        track_projects = await db.execute(
            select(func.count(Project.id)).where(Project.event_id == event_id, Project.track_id == track.id, Project.is_draft == False)
        )
        track_total = track_projects.scalar() or 0
        
        track_judged = await db.execute(
            select(func.count(Project.id.distinct()))
            .select_from(Project)
            .join(Score, Score.project_id == Project.id)
            .where(Project.event_id == event_id, Project.track_id == track.id, Project.is_draft == False)
        )
        track_judged_count = track_judged.scalar() or 0
        
        by_track[track.name] = {
            "total": track_total,
            "judged": track_judged_count,
            "pending": track_total - track_judged_count,
        }
    
    # By judge
    assignments = await db.execute(
        select(JudgeAssignment).options(
            selectinload(JudgeAssignment.judge),
            selectinload(JudgeAssignment.track)
        ).where(JudgeAssignment.event_id == event_id)
    )
    by_judge = {}
    for a in assignments.scalars().all():
        judge_scores = await db.execute(
            select(func.count(Score.id)).where(
                Score.judge_id == a.judge_id, Score.event_id == event_id
            )
        )
        by_judge[str(a.judge_id)] = {
            "name": a.judge.full_name or a.judge.email,
            "track": a.track.name,
            "total": 0,  # Would need to calculate assigned projects
            "completed": judge_scores.scalar() or 0,
        }
    
    return ProgressDashboard(
        total_projects=total,
        judged_projects=judged_count,
        pending_projects=total - judged_count,
        total_judges=judges_total,
        judges_completed=completed,
        by_track=by_track,
        by_judge=by_judge,
    )


# CSV Export
@router.get("/events/{event_identifier}/export.csv")
async def export_csv(
    event_identifier: str,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    from fastapi.responses import Response
    import csv
    import io
    import traceback
    import sys
    from sqlalchemy import select, func
    from sqlalchemy.orm import selectinload
    from app.models import Project, Score, JudgingCriteria, Team, Track, User
    
    try:
        # Try to parse as UUID first, otherwise treat as slug
        try:
            event_id = UUID(event_identifier)
            result = await db.execute(select(Event).where(Event.id == event_id))
        except ValueError:
            # Not a UUID, treat as slug
            result = await db.execute(select(Event).where(Event.slug == event_identifier))
        
        event = result.scalar_one_or_none()
        
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Get all projects with scores
        projects_result = await db.execute(
            select(Project).options(
                selectinload(Project.team),
                selectinload(Project.track),
                selectinload(Project.scores).selectinload(Score.criteria),
                selectinload(Project.scores).selectinload(Score.judge)
            ).where(Project.event_id == event.id, Project.is_draft == False)
        )
        projects = projects_result.scalars().all()
        
        # Get criteria for this event
        criteria_result = await db.execute(
            select(JudgingCriteria).where(JudgingCriteria.event_id == event.id).order_by(JudgingCriteria.display_order)
        )
        criteria_list = criteria_result.scalars().all()
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header row
        header = ["Project", "Team", "Track"]
        for c in criteria_list:
            header.append(c.name)
        header.append("Total Weighted")
        header.append("Normalized Total")
        header.append("Rank")
        writer.writerow(header)

        # Cross-judge normalized totals + ranks (z-score per JUDGING.md)
        from app.services import normalization as norm_svc

        svc_scores = []
        for project in projects:
            for s in project.scores:
                svc_scores.append(
                    {
                        "judge_id": str(s.judge_id),
                        "project_id": str(project.id),
                        "criteria": s.criteria.name if s.criteria else "",
                        "score": s.score,
                    }
                )
        weights = {c.name: float(c.weight) for c in criteria_list}
        norm_totals = {
            pid: v["normalized_total"]
            for pid, v in norm_svc.normalize_project_scores(svc_scores, weights).items()
        }
        ranks = norm_svc.rank_totals(norm_totals)

        # Data rows
        for project in projects:
            row = [project.title, project.team.name if project.team else "", project.track.name if project.track else ""]
            total_weighted = 0
            total_weight = 0

            for criteria in criteria_list:
                # Get average score for this criteria across all judges
                criteria_scores = [s.score for s in project.scores if s.criteria_id == criteria.id]
                if criteria_scores:
                    avg_score = sum(criteria_scores) / len(criteria_scores)
                    weighted = float(avg_score) * float(criteria.weight)
                    total_weighted += weighted
                    total_weight += float(criteria.weight)
                    row.append(f"{avg_score:.2f}")
                else:
                    row.append("")

            if total_weight > 0:
                row.append(f"{total_weighted / total_weight:.2f}")
            else:
                row.append("")

            pid = str(project.id)
            if pid in norm_totals:
                row.append(f"{norm_totals[pid]:.2f}")
                row.append(str(ranks[pid]))
            else:
                row.append("")
                row.append("")

            writer.writerow(row)
        
        output.seek(0)
        csv_content = output.getvalue()
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=event_{event.id}_results.csv"}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"CSV export failed: {str(e)}")


# Multi-method ranking comparison + robustness verdict (pipeline doc 8-9)
@router.get("/events/{event_identifier}/ranking")
async def ranking_comparison(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
    k: int = 3,
    exclude_judge: Optional[UUID] = None,
):
    from app.services import normalization as norm_svc
    from app.services import ranking as rank_svc
    import statistics

    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    scores_result = await db.execute(
        select(Score).where(Score.event_id == event.id)
    )
    scores = list(scores_result.scalars().all())
    if exclude_judge:
        scores = [s for s in scores if s.judge_id != exclude_judge]
    crit_result = await db.execute(
        select(JudgingCriteria).where(JudgingCriteria.event_id == event.id)
    )
    weights = {c.name: float(c.weight) for c in crit_result.scalars().all()}
    crit_rows = (
        await db.execute(select(JudgingCriteria).where(JudgingCriteria.event_id == event.id))
    ).scalars().all()
    crit_by_id = {c.id: c for c in crit_rows}

    by_jp: dict = {}
    svc_scores = []
    for s in scores:
        crit = crit_by_id.get(s.criteria_id)
        if not crit:
            continue
        w = weights.get(crit.name, 0)
        by_jp.setdefault((str(s.judge_id), str(s.project_id)), []).append(w * s.score / 100.0)
        svc_scores.append(
            {
                "judge_id": str(s.judge_id),
                "project_id": str(s.project_id),
                "criteria": crit.name,
                "score": s.score,
            }
        )
    totals = {jp: sum(v) for jp, v in by_jp.items()}
    norm_map = norm_svc.normalize_project_scores(svc_scores, weights)
    norm_order = rank_svc.order_of({p: v["normalized_total"] for p, v in norm_map.items()})
    bt_scores, bt_warning = rank_svc.bradley_terry(totals)
    borda_scores = rank_svc.borda(totals)
    orders = {
        "raw_average": rank_svc.raw_order(totals),
        "calibrated_average": norm_order,
        "bradley_terry": rank_svc.order_of(bt_scores) if bt_scores else [],
        "borda": rank_svc.order_of(borda_scores) if borda_scores else [],
    }
    verdict, explanation, above, below = rank_svc.robustness(orders, max(k, 1))

    # Review coverage + data-quality flags (demo scenario: 3 reviews/project).
    reviewers: dict = {}
    for s in scores:
        reviewers.setdefault(str(s.project_id), set()).add(str(s.judge_id))
    review_counts = {pid: len(jids) for pid, jids in reviewers.items()}
    low_confidence = sorted(pid for pid, n in review_counts.items() if n < 3)

    # Duplicate submissions: same title (case-insensitive), counted once —
    # the earliest-submitted project is kept, later ones are dropped from
    # every method's ordering.
    proj_rows = (
        await db.execute(
            select(Project).where(Project.event_id == event.id, Project.is_draft == False)  # noqa: E712
        )
    ).scalars().all()
    dup_groups: dict = {}
    for p in proj_rows:
        dup_groups.setdefault((p.title or "").casefold().strip(), []).append(p)
    duplicates = []
    dropped: set = set()
    for title_key, group in dup_groups.items():
        if len(group) < 2:
            continue
        group.sort(key=lambda p: (p.submitted_at or p.created_at, str(p.id)))
        kept = group[0]
        drop_ids = [str(p.id) for p in group[1:]]
        dropped.update(drop_ids)
        duplicates.append(
            {
                "title": kept.title,
                "project_ids": [str(p.id) for p in group],
                "kept_project_id": str(kept.id),
            }
        )
    if dropped:
        orders = {m: [p for p in o if p not in dropped] for m, o in orders.items()}
        above = [p for p in above if p not in dropped]
        below = [p for p in below if p not in dropped]
        verdict, explanation, above, below = rank_svc.robustness(orders, max(k, 1))

    # Per-judge stats: constant scorers (std 0 over 2+ reviews) need flagging
    # because z-score normalization cannot differentiate their projects.
    by_judge_vals: dict = {}
    for s in scores:
        by_judge_vals.setdefault(str(s.judge_id), []).append(s.score)
    judge_stats = {}
    for jid, vals in by_judge_vals.items():
        mean = statistics.mean(vals)
        std = statistics.stdev(vals) if len(vals) > 1 else 0.0
        judge_stats[jid] = {
            "reviews": len(vals),
            "mean": round(mean, 2),
            "std": round(std, 2),
            "constant": len(vals) > 1 and std == 0.0,
        }

    return {
        "event_id": str(event.id),
        "methods": orders,
        "boundary": {"k": max(k, 1), "above": above, "below": below},
        "verdict": verdict,
        "explanation": explanation,
        "warnings": {"bradley_terry": bt_warning},
        "review_counts": review_counts,
        "low_confidence": low_confidence,
        "duplicates": duplicates,
        "judge_stats": judge_stats,
        "excluded_judge": str(exclude_judge) if exclude_judge else None,
    }


@router.get("/events/{event_identifier}/teams/my/receipt")
async def team_receipt(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_participant),
):
    """Per-team results receipt: per-criteria averages, anonymized judge
    feedback, and ranks under every method (pipeline doc section 11)."""
    from app.services import normalization as norm_svc
    from app.services import ranking as rank_svc

    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    membership = await db.execute(
        select(Team).join(TeamMember).where(
            Team.event_id == event.id, TeamMember.user_id == current_user.id
        )
    )
    team = membership.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="No team in this event")

    projects = (
        await db.execute(
            select(Project)
            .options(selectinload(Project.scores).selectinload(Score.criteria))
            .where(
                Project.event_id == event.id,
                Project.team_id == team.id,
                Project.is_draft == False,  # noqa: E712
            )
        )
    ).scalars().all()
    crit_rows = (
        await db.execute(select(JudgingCriteria).where(JudgingCriteria.event_id == event.id))
    ).scalars().all()
    weights = {c.name: float(c.weight) for c in crit_rows}

    # Event-wide orders for rank lookup
    all_scores = (
        await db.execute(select(Score).where(Score.event_id == event.id))
    ).scalars().all()
    by_jp: dict = {}
    svc_scores = []
    for s in all_scores:
        crit = next((c for c in crit_rows if c.id == s.criteria_id), None)
        if not crit:
            continue
        by_jp.setdefault((str(s.judge_id), str(s.project_id)), []).append(
            weights.get(crit.name, 0) * s.score / 100.0
        )
        svc_scores.append(
            {
                "judge_id": str(s.judge_id),
                "project_id": str(s.project_id),
                "criteria": crit.name,
                "score": s.score,
            }
        )
    totals = {jp: sum(v) for jp, v in by_jp.items()}
    norm_map = norm_svc.normalize_project_scores(svc_scores, weights)
    bt_scores, _ = rank_svc.bradley_terry(totals)
    borda_scores = rank_svc.borda(totals)
    orders = {
        "raw_average": rank_svc.raw_order(totals),
        "calibrated_average": rank_svc.order_of(
            {p: v["normalized_total"] for p, v in norm_map.items()}
        ),
        "bradley_terry": rank_svc.order_of(bt_scores) if bt_scores else [],
        "borda": rank_svc.order_of(borda_scores) if borda_scores else [],
    }

    def rank_of(method: str, pid: str):
        try:
            return orders[method].index(pid) + 1
        except ValueError:
            return None

    judge_labels = {}
    for i, jid in enumerate(sorted({str(s.judge_id) for s in all_scores}), start=1):
        judge_labels[jid] = f"Judge {i}"

    items = []
    for p in projects:
        per_crit = {}
        feedback = []
        for s in p.scores:
            cname = s.criteria.name if s.criteria else "?"
            per_crit.setdefault(cname, []).append(s.score)
            if s.comment:
                feedback.append(
                    {
                        "judge": judge_labels.get(str(s.judge_id), "Judge ?"),
                        "criteria": cname,
                        "comment": s.comment,
                    }
                )
        items.append(
            {
                "id": str(p.id),
                "title": p.title,
                "criteria": [
                    {"name": c, "average": round(sum(v) / len(v), 2)} for c, v in per_crit.items()
                ],
                "feedback": feedback,
                "ranks": {m: rank_of(m, str(p.id)) for m in orders},
            }
        )
    verdict, explanation, _, _ = rank_svc.robustness(orders, 3)
    return {
        "team": team.name,
        "projects": items,
        "boundary_verdict": verdict,
        "boundary_explanation": explanation,
    }


# Normalization report
@router.get("/events/{event_identifier}/normalization", response_model=List[NormalizationReport])
async def get_normalization_report(
    event_identifier: str,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    event_id = event.id
    
    # Get all scores
    scores_result = await db.execute(select(Score).where(Score.event_id == event_id))
    scores = scores_result.scalars().all()
    
    # Group by judge and criteria (+ global per-criteria pools)
    judge_criteria_scores = {}
    per_criteria_all = {}
    for score in scores:
        key = (score.judge_id, score.criteria_id)
        if key not in judge_criteria_scores:
            judge_criteria_scores[key] = []
        judge_criteria_scores[key].append(score.score)
        if score.criteria_id not in per_criteria_all:
            per_criteria_all[score.criteria_id] = []
        per_criteria_all[score.criteria_id].append(score.score)
    
    # Get judge info
    judge_ids = set(k[0] for k in judge_criteria_scores.keys())
    judges_result = await db.execute(select(User).where(User.id.in_(judge_ids)))
    judges = {j.id: j for j in judges_result.scalars()}
    
    # Get criteria info
    criteria_ids = set(k[1] for k in judge_criteria_scores.keys())
    criteria_result = await db.execute(select(JudgingCriteria).where(JudgingCriteria.id.in_(criteria_ids)))
    criteria_map = {c.id: c for c in criteria_result.scalars()}
    
    from collections import defaultdict
    from app.services import normalization as norm_svc

    global_stats = {
        cid: norm_svc.judge_stats(vals)
        for cid, vals in per_criteria_all.items()
    }

    reports = []
    for (judge_id, criteria_id), values in judge_criteria_scores.items():
        judge = judges.get(judge_id)
        criteria = criteria_map.get(criteria_id)

        if not judge or not criteria:
            continue

        # Single-score judges are included: stdev 0.0 normalizes to raw.
        mean, stdev = norm_svc.judge_stats(values)
        gmean, gstdev = global_stats.get(criteria_id, (mean, 0.0))
        per_project = {}
        for score in scores:
            if score.judge_id == judge_id and score.criteria_id == criteria_id:
                per_project[str(score.project_id)] = norm_svc.normalize_value(
                    score.score, mean, stdev, gmean, gstdev
                )

        reports.append(NormalizationReport(
            judge_id=judge_id,
            judge_name=judge.full_name or judge.email,
            raw_scores={criteria.name: values},
            mean=mean,
            std=stdev,
            normalized_scores=per_project,
        ))

    return reports