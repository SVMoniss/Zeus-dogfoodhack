from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_participant
from app.models import Project, Team, TeamMember, Track, Event, User
from app.models.enums import UserRole, ProjectStatus
from app.schemas.team_project import ProjectCreate, ProjectUpdate, ProjectSubmit, ProjectResponse, ProjectListResponse
from app.api.t4 import notify

router = APIRouter(prefix="/api/events/{event_identifier}/projects", tags=["projects"])


async def check_submission_open(event: Event) -> bool:
    """Check if submissions are open for an event."""
    now = datetime.now(timezone.utc)
    open_at = event.submissions_open_at
    close_at = event.submissions_close_at
    # Normalize naive datetimes (e.g. SQLite / legacy rows) to UTC
    if open_at is not None and open_at.tzinfo is None:
        open_at = open_at.replace(tzinfo=timezone.utc)
    if close_at is not None and close_at.tzinfo is None:
        close_at = close_at.replace(tzinfo=timezone.utc)
    if open_at is None or close_at is None:
        return False
    return open_at <= now <= close_at


@router.get("", response_model=list[ProjectListResponse])
async def list_projects(
    event_identifier: str,
    track_id: Optional[UUID] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
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
    
    query = select(Project).options(
        selectinload(Project.team),
        selectinload(Project.track)
    ).where(Project.event_id == event.id, Project.is_draft == False)
    
    if track_id:
        query = query.where(Project.track_id == track_id)
    
    if search:
        query = query.where(
            or_(
                Project.title.ilike(f"%{search}%"),
                Project.summary.ilike(f"%{search}%"),
            )
        )
    
    query = query.order_by(Project.submitted_at.desc().nullslast())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    projects = result.scalars().all()
    
    return [
        ProjectListResponse(
            id=p.id,
            title=p.title,
            summary=p.summary,
            repo_url=p.repo_url,
            demo_url=p.demo_url,
            video_url=p.video_url,
            submitted_at=p.submitted_at,
            is_draft=p.is_draft,
            team_name=p.team.name if p.team else "",
            track_name=p.track.name if p.track else "",
        )
        for p in projects
    ]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    event_identifier: str,
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    # Try to parse as UUID first, otherwise treat as slug
    try:
        event_id = UUID(event_identifier)
        result = await db.execute(select(Event).where(Event.id == event_id))
    except ValueError:
        result = await db.execute(select(Event).where(Event.slug == event_identifier))
    
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    query = select(Project).options(
        selectinload(Project.team),
        selectinload(Project.track)
    ).where(Project.id == project_id, Project.event_id == event.id)
    result = await db.execute(query)
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return ProjectResponse(
        **project.__dict__,
        team_name=project.team.name if project.team else None,
        track_name=project.track.name if project.track else None,
    )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    event_identifier: str,
    project_data: ProjectCreate,
    current_user: User = Depends(require_participant),
    db: AsyncSession = Depends(get_db),
):
    # Try to parse as UUID first, otherwise treat as slug
    try:
        event_id = UUID(event_identifier)
        result = await db.execute(select(Event).where(Event.id == event_id))
    except ValueError:
        result = await db.execute(select(Event).where(Event.slug == event_identifier))
    
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Deadline enforcement: closed event refuses new submissions (T1 checker)
    if not await check_submission_open(event):
        raise HTTPException(status_code=400, detail="Submissions are closed")
    
    # Check if user has a team in this event
    result = await db.execute(
        select(Team)
        .join(TeamMember)
        .where(Team.event_id == event.id, TeamMember.user_id == current_user.id)
    )
    team = result.scalar_one_or_none()
    
    if not team:
        raise HTTPException(status_code=400, detail="Must be in a team to submit a project")
    
    # Verify track belongs to event (capture name now: lazy rels are
    # unavailable after commit in async context)
    track_name = None
    if project_data.track_id:
        result = await db.execute(select(Track).where(Track.id == project_data.track_id, Track.event_id == event.id))
        track = result.scalar_one_or_none()
        if not track:
            raise HTTPException(status_code=400, detail="Invalid track for this event")
        track_name = track.name

    project = Project(
        **project_data.model_dump(),
        event_id=event.id,
        team_id=team.id,
        is_draft=True,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    return ProjectResponse(
        **project.__dict__,
        team_name=team.name,
        track_name=track_name,
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    event_identifier: str,
    project_id: UUID,
    project_data: ProjectUpdate,
    current_user: User = Depends(require_participant),
    db: AsyncSession = Depends(get_db),
):
    # Try to parse as UUID first, otherwise treat as slug
    try:
        event_id = UUID(event_identifier)
        result = await db.execute(select(Event).where(Event.id == event_id))
    except ValueError:
        result = await db.execute(select(Event).where(Event.slug == event_identifier))
    
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check submission deadline
    if not await check_submission_open(event):
        raise HTTPException(status_code=400, detail="Submissions are closed")
    
    query = select(Project).options(selectinload(Project.track)).where(
        Project.id == project_id, Project.event_id == event.id
    )
    result = await db.execute(query)
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check ownership
    result = await db.execute(
        select(TeamMember).where(TeamMember.team_id == project.team_id, TeamMember.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this project's team")
    
    if not project.is_draft:
        raise HTTPException(status_code=400, detail="Cannot edit submitted project")
    
    update_data = project_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    # Capture display names before commit: lazy rels are unavailable
    # after commit in async context (track is eagerly loaded above).
    # Re-read track in case track_id changed.
    track_name = None
    track_id = update_data.get("track_id", project.track_id)
    if track_id:
        track_result = await db.execute(select(Track).where(Track.id == track_id))
        track_obj = track_result.scalar_one_or_none()
        track_name = track_obj.name if track_obj else None
    team_result = await db.execute(select(Team).where(Team.id == project.team_id))
    team_obj = team_result.scalar_one_or_none()
    team_name = team_obj.name if team_obj else None

    await db.commit()
    await db.refresh(project)

    return ProjectResponse(
        **project.__dict__,
        team_name=team_name,
        track_name=track_name,
    )


@router.post("/{project_id}/submit", response_model=ProjectResponse)
async def submit_project(
    event_identifier: str,
    project_id: UUID,
    background: BackgroundTasks,
    current_user: User = Depends(require_participant),
    db: AsyncSession = Depends(get_db),
):
    # Try to parse as UUID first, otherwise treat as slug
    try:
        event_id = UUID(event_identifier)
        result = await db.execute(select(Event).where(Event.id == event_id))
    except ValueError:
        result = await db.execute(select(Event).where(Event.slug == event_identifier))
    
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check submission deadline
    if not await check_submission_open(event):
        raise HTTPException(status_code=400, detail="Submissions are closed")
    
    query = select(Project).options(selectinload(Project.track)).where(
        Project.id == project_id, Project.event_id == event.id
    )
    result = await db.execute(query)
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check ownership
    result = await db.execute(
        select(TeamMember).where(TeamMember.team_id == project.team_id, TeamMember.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this project's team")
    
    if not project.is_draft:
        raise HTTPException(status_code=400, detail="Project already submitted")

    # Capture display names before commit: lazy rels are unavailable
    # after commit in async context (track is eagerly loaded above)
    track_name = project.track.name if project.track else None
    team_result = await db.execute(select(Team).where(Team.id == project.team_id))
    team = team_result.scalar_one_or_none()
    team_name = team.name if team else None

    project.is_draft = False
    project.submitted_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(project)

    background.add_task(
        notify, event.id, "project.submitted",
        {"project_id": str(project.id), "title": project.title, "team": team_name},
    )

    return ProjectResponse(
        **project.__dict__,
        team_name=team_name,
        track_name=track_name,
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    event_identifier: str,
    project_id: UUID,
    current_user: User = Depends(require_participant),
    db: AsyncSession = Depends(get_db),
):
    # Try to parse as UUID first, otherwise treat as slug
    try:
        event_id = UUID(event_identifier)
        result = await db.execute(select(Event).where(Event.id == event_id))
    except ValueError:
        result = await db.execute(select(Event).where(Event.slug == event_identifier))
    
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check submission deadline
    if not await check_submission_open(event):
        raise HTTPException(status_code=400, detail="Submissions are closed")
    
    query = select(Project).where(Project.id == project_id, Project.event_id == event.id)
    result = await db.execute(query)
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check ownership
    result = await db.execute(
        select(TeamMember).where(TeamMember.team_id == project.team_id, TeamMember.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this project's team")
    
    if not project.is_draft:
        raise HTTPException(status_code=400, detail="Cannot delete submitted project")
    
    await db.delete(project)
    await db.commit()