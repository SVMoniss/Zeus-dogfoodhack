from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime
from typing import List
from app.core.database import get_db
from app.core.deps import get_current_user, require_participant, resolve_event
from app.models import Team, TeamMember, User, Event
from app.models.enums import UserRole
from app.schemas.team_project import TeamCreate, TeamJoin, TeamResponse, TeamMemberResponse

router = APIRouter(prefix="/api/events/{event_identifier}/teams", tags=["teams"])


@router.get("", response_model=List[TeamResponse])
async def list_teams(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    query = select(Team).where(Team.event_id == event.id)
    result = await db.execute(query)
    teams = result.scalars().all()
    
    # Add member counts
    for team in teams:
        member_count = await db.execute(
            select(func.count(TeamMember.id)).where(TeamMember.team_id == team.id)
        )
        team.member_count = member_count.scalar() or 0
    
    return teams


class MyTeamResponse(TeamResponse):
    members: List[TeamMemberResponse] = []


@router.get("/my", response_model=MyTeamResponse)
async def get_my_team(
    event_identifier: str,
    current_user: User = Depends(require_participant),
    db: AsyncSession = Depends(get_db),
):
    """The current user's team in this event (T1 team formation UI)."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(
        select(Team)
        .join(TeamMember)
        .where(Team.event_id == event.id, TeamMember.user_id == current_user.id)
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="No team in this event")
    members_result = await db.execute(
        select(TeamMember, User).join(User).where(TeamMember.team_id == team.id)
    )
    members = [
        TeamMemberResponse(
            id=m.TeamMember.id,
            team_id=m.TeamMember.team_id,
            user_id=m.User.id,
            user_email=m.User.email,
            user_name=m.User.full_name,
            # TeamMember tracks created_at (TimestampMixin); exposed as joined_at
            joined_at=m.TeamMember.created_at,
        )
        for m in members_result.all()
    ]
    member_count = await db.execute(
        select(func.count(TeamMember.id)).where(TeamMember.team_id == team.id)
    )
    return MyTeamResponse(
        id=team.id,
        event_id=team.event_id,
        name=team.name,
        max_members=team.max_members,
        invite_code=team.invite_code,
        created_by=team.created_by,
        created_at=team.created_at,
        member_count=member_count.scalar() or 0,
        members=members,
    )


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    event_identifier: str,
    team_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(select(Team).where(Team.id == team_id, Team.event_id == event.id))
    team = result.scalar_one_or_none()
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    member_count = await db.execute(
        select(func.count(TeamMember.id)).where(TeamMember.team_id == team.id)
    )
    team.member_count = member_count.scalar() or 0
    
    return team


@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    event_identifier: str,
    team_data: TeamCreate,
    current_user: User = Depends(require_participant),
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Check if user already has a team in this event
    existing = await db.execute(
        select(Team)
        .join(TeamMember)
        .where(Team.event_id == event.id, TeamMember.user_id == current_user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already in a team for this event")

    import uuid as uuid_lib
    invite_code = uuid_lib.uuid4().hex[:8].upper()

    team = Team(
        **team_data.model_dump(),
        event_id=event.id,
        invite_code=invite_code,
        created_by=current_user.id,
    )
    db.add(team)
    await db.flush()
    
    # Add creator as member
    member = TeamMember(team_id=team.id, user_id=current_user.id)
    db.add(member)
    
    await db.commit()
    await db.refresh(team)
    team.member_count = 1
    
    return team


@router.post("/{team_id}/join", response_model=TeamResponse)
async def join_team(
    event_identifier: str,
    team_id: UUID,
    join_data: TeamJoin,
    current_user: User = Depends(require_participant),
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(select(Team).where(Team.id == team_id, Team.event_id == event.id))
    team = result.scalar_one_or_none()
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.invite_code != join_data.invite_code:
        raise HTTPException(status_code=400, detail="Invalid invite code")
    
    # Check if user already in a team for this event
    existing = await db.execute(
        select(Team)
        .join(TeamMember)
        .where(Team.event_id == event.id, TeamMember.user_id == current_user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already in a team for this event")

    # Check team capacity
    member_count = await db.execute(
        select(func.count(TeamMember.id)).where(TeamMember.team_id == team.id)
    )
    if member_count.scalar() >= team.max_members:
        raise HTTPException(status_code=400, detail="Team is full")

    member = TeamMember(team_id=team.id, user_id=current_user.id)
    db.add(member)
    await db.commit()
    await db.refresh(team)
    team.member_count = member_count.scalar() + 1

    return team


@router.get("/by-code/{invite_code}", response_model=TeamResponse)
async def get_team_by_invite_code(
    event_identifier: str,
    invite_code: str,
    current_user: User = Depends(require_participant),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a team from its invite link code (T1: team formation by invite link)."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(
        select(Team).where(
            Team.event_id == event.id,
            Team.invite_code == invite_code.upper().strip(),
        )
    )
    team = result.scalar_one_or_none()

    if not team:
        # Fall back to case-sensitive match for legacy codes
        result = await db.execute(
            select(Team).where(
                Team.event_id == event.id, Team.invite_code == invite_code
            )
        )
        team = result.scalar_one_or_none()

    if not team:
        raise HTTPException(status_code=404, detail="Team not found for invite code")

    member_count = await db.execute(
        select(func.count(TeamMember.id)).where(TeamMember.team_id == team.id)
    )
    team.member_count = member_count.scalar() or 0

    return team


@router.post("/join-by-code", response_model=TeamResponse)
async def join_team_by_invite_code(
    event_identifier: str,
    join_data: TeamJoin,
    current_user: User = Depends(require_participant),
    db: AsyncSession = Depends(get_db),
):
    """Join a team using only its invite link code (T1: team formation by invite link)."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    code = join_data.invite_code.upper().strip()
    result = await db.execute(
        select(Team).where(Team.event_id == event.id, Team.invite_code == code)
    )
    team = result.scalar_one_or_none()

    if not team:
        result = await db.execute(
            select(Team).where(
                Team.event_id == event.id, Team.invite_code == join_data.invite_code
            )
        )
        team = result.scalar_one_or_none()

    if not team:
        raise HTTPException(status_code=404, detail="Team not found for invite code")

    # Check if user already in a team for this event
    existing = await db.execute(
        select(Team)
        .join(TeamMember)
        .where(Team.event_id == event.id, TeamMember.user_id == current_user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already in a team for this event")

    # Check team capacity
    member_count = await db.execute(
        select(func.count(TeamMember.id)).where(TeamMember.team_id == team.id)
    )
    if member_count.scalar() >= team.max_members:
        raise HTTPException(status_code=400, detail="Team is full")

    member = TeamMember(team_id=team.id, user_id=current_user.id)
    db.add(member)
    await db.commit()
    await db.refresh(team)
    team.member_count = member_count.scalar() + 1

    return team


@router.post("/{team_id}/leave", response_model=TeamResponse)
async def leave_team(
    event_identifier: str,
    team_id: UUID,
    current_user: User = Depends(require_participant),
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(select(Team).where(Team.id == team_id, Team.event_id == event.id))
    team = result.scalar_one_or_none()
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    result = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team.id, TeamMember.user_id == current_user.id)
    )
    member = result.scalar_one_or_none()
    
    if not member:
        raise HTTPException(status_code=400, detail="Not a member of this team")
    
    if team.created_by == current_user.id:
        raise HTTPException(status_code=400, detail="Team creator cannot leave, delete team instead")
    
    await db.delete(member)
    await db.commit()
    
    member_count = await db.execute(
        select(func.count(TeamMember.id)).where(TeamMember.team_id == team.id)
    )
    team.member_count = member_count.scalar() or 0
    
    return team


@router.get("/{team_id}/members", response_model=List[TeamMemberResponse])
async def list_team_members(
    event_identifier: str,
    team_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(select(Team).where(Team.id == team_id, Team.event_id == event.id))
    team = result.scalar_one_or_none()
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    query = select(TeamMember, User).join(User).where(TeamMember.team_id == team_id)
    result = await db.execute(query)
    members = result.all()
    
    return [
        TeamMemberResponse(
            id=m.TeamMember.id,
            team_id=m.TeamMember.team_id,
            user_id=m.User.id,
            user_email=m.User.email,
            user_name=m.User.full_name,
            # TeamMember tracks created_at (TimestampMixin); exposed as joined_at
            joined_at=m.TeamMember.created_at,
        )
        for m in members
    ]


# Add Event import
from app.models import Event