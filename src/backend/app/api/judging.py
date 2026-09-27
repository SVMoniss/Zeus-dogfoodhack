from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime, timezone
from typing import List, Optional
from decimal import Decimal
import statistics
from app.core.database import get_db
from app.core.deps import get_current_user, require_judge, require_organizer, resolve_event
from app.models import (
    JudgingCriteria, JudgeAssignment, Score, JudgeBatch, Project, User, Event, Track
)
from app.models.enums import UserRole
from app.schemas.judging import (
    JudgingCriteriaCreate, JudgingCriteriaUpdate, JudgingCriteriaResponse,
    JudgeInvite, JudgeAssign, JudgeAssignmentResponse,
    ScoreCreate, ScoreSubmit, ScoreResponse,
    ProjectScoreSummary, ProgressDashboard, NormalizationReport
)
from app.api.t4 import notify

router = APIRouter(prefix="/api", tags=["judging"])


# Judging Criteria
@router.post("/events/{event_id}/criteria", response_model=JudgingCriteriaResponse, status_code=status.HTTP_201_CREATED)
async def create_criteria(
    event_id: UUID,
    criteria_data: JudgingCriteriaCreate,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Validate weight sum
    existing = await db.execute(select(JudgingCriteria).where(JudgingCriteria.event_id == event_id))
    total_weight = sum(c.weight for c in existing.scalars()) + criteria_data.weight
    if total_weight > 100:
        raise HTTPException(status_code=400, detail="Total criteria weight cannot exceed 100%")
    
    criteria = JudgingCriteria(**criteria_data.model_dump(), event_id=event_id)
    db.add(criteria)
    await db.commit()
    await db.refresh(criteria)
    
    return criteria


@router.get("/events/{event_id}/criteria", response_model=List[JudgingCriteriaResponse])
async def list_criteria(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JudgingCriteria).where(JudgingCriteria.event_id == event_id).order_by(JudgingCriteria.display_order)
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
    
    # Validate weight sum
    existing = await db.execute(select(JudgingCriteria).where(JudgingCriteria.event_id == criteria.event_id, JudgingCriteria.id != criteria_id))
    total_weight = sum(c.weight for c in existing.scalars()) + (criteria_data.weight or criteria.weight)
    if total_weight > 100:
        raise HTTPException(status_code=400, detail="Total criteria weight cannot exceed 100%")
    
    update_data = criteria_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(criteria, field, value)
    
    await db.commit()
    await db.refresh(criteria)
    
    return criteria


# Judge Management
@router.post("/events/{event_id}/judges/invite", status_code=status.HTTP_201_CREATED)
async def invite_judge(
    event_id: UUID,
    invite_data: JudgeInvite,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    
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
    
    return {"message": "Judge invited", "judge_id": str(user.id), "email": user.email}


@router.get("/events/{event_id}/judges", response_model=List[JudgeAssignmentResponse])
async def list_judges(
    event_id: UUID,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    query = select(JudgeAssignment).options(
        selectinload(JudgeAssignment.judge),
        selectinload(JudgeAssignment.track)
    ).where(JudgeAssignment.event_id == event_id)
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


@router.post("/events/{event_id}/judges/assign", response_model=JudgeAssignmentResponse)
async def assign_judge(
    event_id: UUID,
    assign_data: JudgeAssign,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check judge exists and is a judge
    result = await db.execute(select(User).where(User.id == assign_data.judge_id, User.role == UserRole.JUDGE))
    judge = result.scalar_one_or_none()
    
    if not judge:
        raise HTTPException(status_code=400, detail="Invalid judge")
    
    # Check track belongs to event
    track_result = await db.execute(select(Track).where(Track.id == assign_data.track_id, Track.event_id == event_id))
    track = track_result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=400, detail="Invalid track for this event")
    
    assignment = JudgeAssignment(
        event_id=event_id,
        judge_id=assign_data.judge_id,
        track_id=assign_data.track_id,
        assigned_by=current_user.id,
    )
    db.add(assignment)
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
        writer.writerow(header)
        
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


# Normalization report
@router.get("/events/{event_id}/normalization", response_model=List[NormalizationReport])
async def get_normalization_report(
    event_id: UUID,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get all scores
    scores_result = await db.execute(select(Score).where(Score.event_id == event_id))
    scores = scores_result.scalars().all()
    
    # Group by judge and criteria
    judge_criteria_scores = {}
    for score in scores:
        key = (score.judge_id, score.criteria_id)
        if key not in judge_criteria_scores:
            judge_criteria_scores[key] = []
        judge_criteria_scores[key].append(score.score)
    
    # Get judge info
    judge_ids = set(k[0] for k in judge_criteria_scores.keys())
    judges_result = await db.execute(select(User).where(User.id.in_(judge_ids)))
    judges = {j.id: j for j in judges_result.scalars()}
    
    # Get criteria info
    criteria_ids = set(k[1] for k in judge_criteria_scores.keys())
    criteria_result = await db.execute(select(JudgingCriteria).where(JudgingCriteria.id.in_(criteria_ids)))
    criteria_map = {c.id: c for c in criteria_result.scalars()}
    
    reports = []
    for (judge_id, criteria_id), values in judge_criteria_scores.items():
        if len(values) < 2:
            continue
        
        judge = judges.get(judge_id)
        criteria = criteria_map.get(criteria_id)
        
        if not judge or not criteria:
            continue
        
        mean = statistics.mean(values)
        stdev = statistics.stdev(values)
        
        reports.append(NormalizationReport(
            judge_id=judge_id,
            judge_name=judge.full_name or judge.email,
            raw_scores={criteria.name: values},
            mean=mean,
            std=stdev,
            normalized_scores={},  # Would need project-level calculation
        ))
    
    return reports