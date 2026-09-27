"""T3 community voting, ballots, results gating, comments and audit trail."""
import hashlib
import random
import re
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_organizer, resolve_event
from app.models import (
    CommunityVote,
    ProjectComment,
    VoteAuditLog,
    Project,
    Track,
    User,
)
from app.models.enums import UserRole, VoteAction
from app.schemas.voting_t4 import (
    VoteTokenRequest,
    VoteTokenResponse,
    VoteCast,
    BallotResponse,
    VoteResults,
    CommentCreate,
    CommentResponse,
)

router = APIRouter(tags=["voting"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TOKEN_LIMIT_PER_HOUR = 5
VOTES_PER_MINUTE_PER_IP = 20


def _now():
    return datetime.now(timezone.utc)


def _client_ip(request: Request) -> Optional[str]:
    if request.client:
        return request.client.host
    return None


async def _audit(
    db: AsyncSession,
    event_id,
    project_id,
    action: VoteAction,
    request: Request,
    email: Optional[str] = None,
    details: Optional[dict] = None,
):
    db.add(
        VoteAuditLog(
            event_id=event_id,
            project_id=project_id,
            action=action,
            voter_ip=_client_ip(request),
            voter_email=email,
            user_agent=request.headers.get("user-agent"),
            details=details or {},
        )
    )


def _voting_open(event) -> Optional[str]:
    """Return None when voting is open, else a human reason."""
    now = _now()
    if not event.voting_open_at or not event.voting_close_at:
        return "Community voting is not configured for this event"
    open_at = event.voting_open_at
    close_at = event.voting_close_at
    if open_at.tzinfo is None:
        open_at = open_at.replace(tzinfo=timezone.utc)
    if close_at.tzinfo is None:
        close_at = close_at.replace(tzinfo=timezone.utc)
    if now < open_at:
        return "Community voting has not opened yet"
    if now > close_at:
        return "Community voting has closed"
    return None


def _results_visible(event) -> bool:
    """Results stay hidden until the published date (T3 requirement)."""
    if not event.results_published_at:
        return False
    published = event.results_published_at
    if published.tzinfo is None:
        published = published.replace(tzinfo=timezone.utc)
    return _now() >= published


# ---------------------------------------------------------------- tokens
@router.post(
    "/api/events/{event_identifier}/voting/token",
    response_model=VoteTokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def request_vote_token(
    event_identifier: str,
    data: VoteTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Email-gated ballot token. Rate limited per email; every attempt audited."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    email = data.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email")

    closed_reason = _voting_open(event)
    if closed_reason:
        raise HTTPException(status_code=400, detail=closed_reason)

    since = _now() - timedelta(hours=1)
    recent = await db.execute(
        select(func.count(CommunityVote.id)).where(
            CommunityVote.event_id == event.id,
            CommunityVote.voter_email == email,
            CommunityVote.project_id.is_(None),
            CommunityVote.created_at >= since,
        )
    )
    if (recent.scalar() or 0) >= TOKEN_LIMIT_PER_HOUR:
        await _audit(
            db, event.id, None, VoteAction.RATE_LIMITED, request,
            email=email, details={"reason": "token rate limit"},
        )
        await db.commit()
        raise HTTPException(status_code=429, detail="Too many token requests, try later")

    token_row = CommunityVote(
        event_id=event.id,
        project_id=None,
        voter_email=email,
        voter_ip=_client_ip(request),
        score=None,
    )
    db.add(token_row)
    await _audit(
        db, event.id, None, VoteAction.VOTE_CAST, request,
        email=email, details={"action": "token issued"},
    )
    await db.commit()
    await db.refresh(token_row)
    return VoteTokenResponse(token=token_row.vote_token, expires_at=event.voting_close_at)


# ---------------------------------------------------------------- ballot
@router.get(
    "/api/events/{event_identifier}/ballot",
    response_model=BallotResponse,
)
async def get_ballot(
    event_identifier: str,
    token: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Randomized ballot. Order is shuffled with a per-token seed so every
    voter sees a fair order and a reload shows the same ballot."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    token_row = (
        await db.execute(
            select(CommunityVote).where(
                CommunityVote.event_id == event.id,
                CommunityVote.vote_token == token,
            )
        )
    ).scalar_one_or_none()
    if not token_row:
        raise HTTPException(status_code=401, detail="Invalid vote token")

    closed_reason = _voting_open(event)
    if closed_reason:
        raise HTTPException(status_code=400, detail=closed_reason)

    result = await db.execute(
        select(Project)
        .options(selectinload(Project.team), selectinload(Project.track))
        .where(Project.event_id == event.id, Project.is_draft == False)  # noqa: E712
        .order_by(Project.title)
    )
    projects = list(result.scalars().all())
    seed = int(hashlib.sha256(str(token).encode()).hexdigest(), 16) % (2**32)
    random.Random(seed).shuffle(projects)

    voted = (
        await db.execute(
            select(CommunityVote.project_id).where(
                CommunityVote.event_id == event.id,
                CommunityVote.voter_email == token_row.voter_email,
                CommunityVote.score.is_not(None),
            )
        )
    ).scalars().all()

    return BallotResponse(
        projects=[
            {
                "id": str(p.id),
                "title": p.title,
                "summary": p.summary,
                "team": p.team.name if p.team else "",
                "track": p.track.name if p.track else "",
                "already_voted": p.id in set(voted),
            }
            for p in projects
        ],
        vote_token=token,
    )


# ---------------------------------------------------------------- cast
@router.post("/api/events/{event_identifier}/voting/votes", status_code=status.HTTP_201_CREATED)
async def cast_vote(
    event_identifier: str,
    vote: VoteCast,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Cast one vote. Duplicates are refused and audit-logged (anti-abuse)."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    closed_reason = _voting_open(event)
    if closed_reason:
        raise HTTPException(status_code=400, detail=closed_reason)

    token_row = (
        await db.execute(
            select(CommunityVote).where(
                CommunityVote.event_id == event.id,
                CommunityVote.vote_token == vote.token,
            )
        )
    ).scalar_one_or_none()
    if not token_row:
        raise HTTPException(status_code=401, detail="Invalid vote token")
    email = token_row.voter_email

    project = (
        await db.execute(
            select(Project).where(
                Project.id == vote.project_id, Project.event_id == event.id
            )
        )
    ).scalar_one_or_none()
    if not project or project.is_draft:
        await _audit(
            db, event.id, vote.project_id, VoteAction.VOTE_REJECTED, request,
            email=email, details={"reason": "unknown or draft project"},
        )
        await db.commit()
        raise HTTPException(status_code=404, detail="Project not found")

    # Per-IP rate limit
    since = _now() - timedelta(minutes=1)
    recent_ip = await db.execute(
        select(func.count(CommunityVote.id)).where(
            CommunityVote.event_id == event.id,
            CommunityVote.voter_ip == _client_ip(request),
            CommunityVote.score.is_not(None),
            CommunityVote.created_at >= since,
        )
    )
    if (recent_ip.scalar() or 0) >= VOTES_PER_MINUTE_PER_IP:
        await _audit(
            db, event.id, project.id, VoteAction.RATE_LIMITED, request,
            email=email, details={"reason": "ip rate limit"},
        )
        await db.commit()
        raise HTTPException(status_code=429, detail="Too many votes, slow down")

    # Duplicate detection: one score per (event, project, voter)
    existing = await db.execute(
        select(CommunityVote).where(
            CommunityVote.event_id == event.id,
            CommunityVote.project_id == project.id,
            CommunityVote.voter_email == email,
            CommunityVote.score.is_not(None),
        )
    )
    if existing.scalar_one_or_none():
        await _audit(
            db, event.id, project.id, VoteAction.DUPLICATE_DETECTED, request,
            email=email, details={"reason": "already voted for project"},
        )
        await db.commit()
        raise HTTPException(status_code=400, detail="Already voted for this project")

    db.add(
        CommunityVote(
            event_id=event.id,
            project_id=project.id,
            voter_email=email,
            voter_ip=_client_ip(request),
            score=vote.score,
        )
    )
    await _audit(
        db, event.id, project.id, VoteAction.VOTE_CAST, request,
        email=email, details={"score": vote.score},
    )
    await db.commit()
    return {"message": "Vote recorded", "project_id": str(project.id), "score": vote.score}


# ---------------------------------------------------------------- results
@router.get(
    "/api/events/{event_identifier}/voting/results",
    response_model=List[VoteResults],
)
async def voting_results(
    event_identifier: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Organizers always see results; everyone else waits until publish
    (results hidden during the voting window). Auth is optional here."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    current_user = None
    try:
        current_user = await get_current_user(request, request.cookies.get("session"), db)
    except Exception:
        current_user = None
    is_organizer = current_user and current_user.role in (UserRole.ORGANIZER, UserRole.ADMIN)
    if not is_organizer and not _results_visible(event):
        raise HTTPException(status_code=403, detail="Results are hidden until published")

    result = await db.execute(
        select(Project)
        .options(selectinload(Project.team))
        .where(Project.event_id == event.id, Project.is_draft == False)  # noqa: E712
    )
    projects = list(result.scalars().all())
    rows = []
    for p in projects:
        agg = await db.execute(
            select(func.avg(CommunityVote.score), func.count(CommunityVote.id)).where(
                CommunityVote.event_id == event.id,
                CommunityVote.project_id == p.id,
                CommunityVote.score.is_not(None),
            )
        )
        avg, count = agg.one()
        rows.append(
            {
                "project_id": p.id,
                "project_title": p.title,
                "team_name": p.team.name if p.team else "",
                "average_score": round(float(avg or 0), 2),
                "vote_count": count or 0,
            }
        )
    rows.sort(key=lambda r: (-r["average_score"], -r["vote_count"], r["project_title"]))
    ranked = []
    for i, r in enumerate(rows, start=1):
        r["rank"] = i
        ranked.append(r)
    return ranked


@router.get("/api/events/{event_identifier}/voting/audit")
async def voting_audit(
    event_identifier: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
    limit: int = 100,
):
    """Organizer-readable audit trail (anti-abuse transparency)."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(
        select(VoteAuditLog)
        .where(VoteAuditLog.event_id == event.id)
        .order_by(VoteAuditLog.created_at.desc())
        .limit(min(limit, 500))
    )
    return [
        {
            "id": str(a.id),
            "action": a.action.value if hasattr(a.action, "value") else str(a.action),
            "project_id": str(a.project_id) if a.project_id else None,
            "voter_email": a.voter_email,
            "voter_ip": str(a.voter_ip) if a.voter_ip else None,
            "details": a.details,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in result.scalars().all()
    ]


# ---------------------------------------------------------------- comments
@router.get(
    "/api/events/{event_identifier}/projects/{project_id}/comments",
    response_model=List[CommentResponse],
)
async def list_comments(
    event_identifier: str,
    project_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = None,
):
    """Public sees approved comments; organizers pass ?status=all to moderate
    (pending included, emails visible)."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    show_all = status == "all"
    show_emails = False
    if show_all:
        try:
            user = await get_current_user(request, request.cookies.get("session"), db)
        except HTTPException:
            user = None
        if not user or user.role not in (UserRole.ORGANIZER, UserRole.ADMIN):
            raise HTTPException(status_code=403, detail="Organizer only")
        show_emails = True
    filters = [
        ProjectComment.event_id == event.id,
        ProjectComment.project_id == project_id,
    ]
    if not show_all:
        filters.append(ProjectComment.is_approved == True)  # noqa: E712
    result = await db.execute(
        select(ProjectComment).where(*filters).order_by(ProjectComment.created_at)
    )
    comments = result.scalars().all()
    return [
        CommentResponse(
            id=c.id,
            project_id=c.project_id,
            author_name=c.author_name or "Anonymous",
            author_email=c.author_email if show_emails else None,
            content=c.content,
            is_approved=c.is_approved,
            created_at=c.created_at,
        )
        for c in comments
    ]


@router.post(
    "/api/events/{event_identifier}/projects/{project_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_comment(
    event_identifier: str,
    project_id: UUID,
    data: CommentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticated or anonymous (name+email) comments. Held for moderation
    unless the author is an organizer/admin."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    project = (
        await db.execute(
            select(Project).where(
                Project.id == project_id, Project.event_id == event.id
            )
        )
    ).scalar_one_or_none()
    if not project or project.is_draft:
        raise HTTPException(status_code=404, detail="Project not found")

    content = (data.content or "").strip()
    if not content or len(content) > 5000:
        raise HTTPException(status_code=400, detail="Content must be 1-5000 characters")

    # Optional auth: attach identity when logged in, never fail when not
    user = None
    try:
        user = await get_current_user(request, request.cookies.get("session"), db)
    except HTTPException:
        user = None

    if user:
        name = user.full_name or user.email
        email = user.email
        approved = user.role in (UserRole.ORGANIZER, UserRole.ADMIN)
        user_id = user.id
    else:
        if not data.author_name or not data.author_email:
            raise HTTPException(
                status_code=400,
                detail="Sign in or provide author_name and author_email",
            )
        if not EMAIL_RE.match(data.author_email.strip()):
            raise HTTPException(status_code=400, detail="Invalid author email")
        name = data.author_name.strip()
        email = data.author_email.strip().lower()
        approved = False
        user_id = None

    comment = ProjectComment(
        event_id=event.id,
        project_id=project.id,
        user_id=user_id,
        author_name=name,
        author_email=email,
        content=content,
        is_approved=approved,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return CommentResponse(
        id=comment.id,
        project_id=comment.project_id,
        author_name=comment.author_name,
        author_email=None,
        content=comment.content,
        is_approved=comment.is_approved,
        created_at=comment.created_at,
    )


@router.patch("/api/events/{event_identifier}/comments/{comment_id}/approve")
async def approve_comment(
    event_identifier: str,
    comment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(
        select(ProjectComment).where(
            ProjectComment.id == comment_id,
            ProjectComment.event_id == event.id,
        )
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment.is_approved = True
    await db.commit()
    return {"message": "Comment approved", "id": str(comment.id)}
