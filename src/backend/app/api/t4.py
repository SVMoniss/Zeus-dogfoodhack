"""T4 stretch: API keys + v1 REST, webhooks, certificates, widget, bulk."""
import hashlib
import secrets
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import require_organizer, resolve_event
from app.models import (
    APIKey, BulkJob, Certificate, Event, Project, Team, Track, User,
    Score, JudgingCriteria, JudgeAssignment, AuditEvent,
)
from app.models.enums import JobStatus, JobType
from app.schemas.voting_t4 import (
    APIKeyCreate,
    APIKeyResponse,
    APIKeyWithSecret,
    BulkJobResponse,
    CertificateGenerate,
    CertificateResponse,
    CertificateVerify,
    WebhookCreate,
    WebhookResponse,
)
from app.models import Webhook as WebhookModel
from app.services import certificates as cert_service
from app.services.webhooks import dispatch

router = APIRouter(tags=["t4"])


def _now():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- API keys
def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


@router.post(
    "/api/events/{event_identifier}/api-keys",
    response_model=APIKeyWithSecret,
    status_code=status.HTTP_201_CREATED,
)
async def create_api_key(
    event_identifier: str,
    data: APIKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    """Issue a REST API key. The secret is shown once, only the hash is stored."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    raw = "dfr_" + secrets.token_urlsafe(32)
    row = APIKey(
        event_id=event.id,
        name=data.name,
        key_hash=_hash_key(raw),
        key_prefix=raw[:12],
        permissions=data.permissions or ["read"],
        created_by=current_user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return APIKeyWithSecret(
        id=row.id,
        name=row.name,
        key_prefix=row.key_prefix,
        permissions=row.permissions,
        created_at=row.created_at,
        expires_at=row.expires_at,
        last_used_at=row.last_used_at,
        key=raw,
    )


@router.get(
    "/api/events/{event_identifier}/api-keys",
    response_model=List[APIKeyResponse],
)
async def list_api_keys(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(select(APIKey).where(APIKey.event_id == event.id))
    return [
        APIKeyResponse(
            id=k.id, name=k.name, key_prefix=k.key_prefix,
            permissions=k.permissions, created_at=k.created_at,
            expires_at=k.expires_at, last_used_at=k.last_used_at,
        )
        for k in result.scalars().all()
    ]


@router.delete("/api/events/{event_identifier}/api-keys/{key_id}", status_code=204)
async def revoke_api_key(
    event_identifier: str,
    key_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(
        select(APIKey).where(APIKey.id == key_id, APIKey.event_id == event.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="API key not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)


async def require_api_key(request: Request, db: AsyncSession) -> APIKey:
    """Validate X-API-Key header. Updates last_used_at; rejects expired keys."""
    raw = request.headers.get("x-api-key", "")
    if not raw:
        raise HTTPException(status_code=401, detail="X-API-Key header required")
    result = await db.execute(select(APIKey).where(APIKey.key_hash == _hash_key(raw)))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if row.expires_at:
        exp = row.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if _now() > exp:
            raise HTTPException(status_code=401, detail="API key expired")
    row.last_used_at = _now()
    return row


async def _key_for_event(request: Request, db: AsyncSession, event) -> APIKey:
    row = await require_api_key(request, db)
    if row.event_id != event.id:
        raise HTTPException(status_code=403, detail="API key is for another event")
    if "read" not in (row.permissions or []):
        raise HTTPException(status_code=403, detail="API key lacks read permission")
    await db.commit()
    return row


# ---------------------------------------------------------------- v1 REST
@router.get("/api/v1/events/{event_identifier}")
async def v1_event(
    event_identifier: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Documented public REST: event + tracks (keyed). See /docs."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    await _key_for_event(request, db, event)
    await db.refresh(event, attribute_names=["tracks"])
    return {
        "id": str(event.id),
        "name": event.name,
        "slug": event.slug,
        "description": event.description,
        "submissions_open_at": event.submissions_open_at.isoformat() if event.submissions_open_at else None,
        "submissions_close_at": event.submissions_close_at.isoformat() if event.submissions_close_at else None,
        "prizes": event.prizes or [],
        "tracks": [{"id": str(t.id), "name": t.name} for t in event.tracks],
    }


@router.get("/api/v1/events/{event_identifier}/projects")
async def v1_projects(
    event_identifier: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Documented public REST: submitted projects (keyed). See /docs."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    await _key_for_event(request, db, event)
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.team), selectinload(Project.track))
        .where(Project.event_id == event.id, Project.is_draft == False)  # noqa: E712
        .order_by(Project.submitted_at.desc().nullslast())
    )
    return [
        {
            "id": str(p.id),
            "title": p.title,
            "summary": p.summary,
            "repo_url": p.repo_url,
            "demo_url": p.demo_url,
            "team": p.team.name if p.team else "",
            "track": p.track.name if p.track else "",
            "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
        }
        for p in result.scalars().all()
    ]


# ---------------------------------------------------------------- webhooks
@router.post(
    "/api/events/{event_identifier}/webhooks",
    response_model=WebhookResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_webhook(
    event_identifier: str,
    data: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not data.url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL must be http(s)")
    hook = WebhookModel(
        event_id=event.id,
        url=data.url,
        secret=secrets.token_urlsafe(24),
        events=data.events or ["*"],
        is_active=True,
    )
    db.add(hook)
    await db.commit()
    await db.refresh(hook)
    return WebhookResponse(
        id=hook.id, url=hook.url, events=hook.events,
        is_active=hook.is_active, created_at=hook.created_at,
        secret=hook.secret,
    )


@router.get(
    "/api/events/{event_identifier}/webhooks",
    response_model=List[WebhookResponse],
)
async def list_webhooks(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(select(WebhookModel).where(WebhookModel.event_id == event.id))
    return [
        WebhookResponse(
            id=h.id, url=h.url, events=h.events,
            is_active=h.is_active, created_at=h.created_at,
        )
        for h in result.scalars().all()
    ]


@router.delete("/api/events/{event_identifier}/webhooks/{hook_id}", status_code=204)
async def delete_webhook(
    event_identifier: str,
    hook_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(
        select(WebhookModel).where(
            WebhookModel.id == hook_id, WebhookModel.event_id == event.id
        )
    )
    hook = result.scalar_one_or_none()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await db.delete(hook)
    await db.commit()
    return Response(status_code=204)


async def notify(event_id, event_type: str, payload: dict):
    """Fire webhooks without blocking the request (BackgroundTasks caller)."""
    from app.services.webhooks import deliver_event

    try:
        await deliver_event(event_id, event_type, payload)
    except Exception:
        pass


# ---------------------------------------------------------------- certificates
@router.post(
    "/api/events/{event_identifier}/certificates",
    response_model=CertificateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_certificate(
    event_identifier: str,
    data: CertificateGenerate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    """Issue an Ed25519-signed record. Anyone can verify it publicly."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if data.recipient_type not in ("user", "team", "project"):
        raise HTTPException(status_code=400, detail="recipient_type must be user, team or project")
    if data.certificate_type not in ("participation", "winner", "judge_service"):
        raise HTTPException(status_code=400, detail="Unknown certificate_type")
    signature, public_key = cert_service.sign(
        event.id, data.recipient_type, data.recipient_id,
        data.certificate_type, data.title,
    )
    row = Certificate(
        event_id=event.id,
        recipient_type=data.recipient_type,
        recipient_id=data.recipient_id,
        certificate_type=data.certificate_type,
        title=data.title,
        description=data.description,
        signature=signature,
        public_key=public_key,
    )
    # 'metadata' shadows Declarative metadata at class level but works
    # as a plain mapped attribute on instances.
    row.metadata = data.metadata or {}
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _cert_response(row)


def _cert_response(row: Certificate) -> CertificateResponse:
    return CertificateResponse(
        id=row.id, event_id=row.event_id, recipient_type=row.recipient_type,
        recipient_id=row.recipient_id, certificate_type=row.certificate_type,
        title=row.title, description=row.description, metadata=row.metadata or {},
        signature=row.signature, public_key=row.public_key,
        issued_at=row.issued_at, verified_at=row.verified_at,
    )


@router.get("/api/certificates/verify", response_model=CertificateVerify)
async def verify_certificate(
    certificate_id: UUID, db: AsyncSession = Depends(get_db)
):
    """Public verification: recompute the signature, stamp verified_at."""
    result = await db.execute(select(Certificate).where(Certificate.id == certificate_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Certificate not found")
    valid = cert_service.verify(
        row.event_id, row.recipient_type, row.recipient_id,
        row.certificate_type, row.title, row.signature or "", row.public_key or "",
    )
    if valid:
        row.verified_at = _now()
        await db.commit()
        await db.refresh(row)
    return CertificateVerify(valid=valid, certificate=_cert_response(row) if valid else None)


# ---------------------------------------------------------------- widget
@router.get("/api/events/{event_identifier}/widget.js")
async def gallery_widget(event_identifier: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Embeddable gallery widget. Embed with:
    <div data-dogfood-gallery="SLUG"></div><script src=".../widget.js"></script>"""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    base = str(request.base_url).rstrip("/")
    js = f"""(function() {{
  var mount = document.querySelector('[data-dogfood-gallery="{event.slug}"]') || document.currentScript.parentElement;
  fetch("{base}/api/events/{event.slug}/projects?limit=20")
    .then(function(r) {{ return r.json(); }})
    .then(function(projects) {{
      var html = '<div style="display:grid;gap:12px">';
      projects.forEach(function(p) {{
        html += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px">'
          + '<strong>' + p.title + '</strong><br><span>' + (p.summary || '') + '</span></div>';
      }});
      html += '</div>';
      mount.innerHTML = html;
    }})
    .catch(function() {{ mount.innerHTML = '<p>Gallery unavailable.</p>'; }});
}})();"""
    return Response(content=js, media_type="application/javascript")


# ---------------------------------------------------------------- bulk
def _job_response(row: BulkJob) -> BulkJobResponse:
    return BulkJobResponse(
        id=row.id, event_id=row.event_id,
        job_type=row.job_type.value if hasattr(row.job_type, "value") else str(row.job_type),
        status=row.status.value if hasattr(row.status, "value") else str(row.status),
        file_path=row.file_path, records_total=row.records_total,
        records_processed=row.records_processed, records_failed=row.records_failed,
        created_at=row.created_at, completed_at=row.updated_at,
    )


@router.get("/api/events/{event_identifier}/bulk/export")
async def bulk_export(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    """Full event dump as JSON (migration path out) + job record."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.refresh(event, attribute_names=["tracks"])
    tracks = (await db.execute(select(Track).where(Track.event_id == event.id))).scalars().all()
    teams = (await db.execute(select(Team).where(Team.event_id == event.id))).scalars().all()
    projects = (
        await db.execute(
            select(Project)
            .options(selectinload(Project.team), selectinload(Project.track))
            .where(Project.event_id == event.id)
        )
    ).scalars().all()
    dump = {
        "event": {
            "name": event.name, "slug": event.slug, "description": event.description,
            "prizes": event.prizes or [],
        },
        "tracks": [{"name": t.name, "description": t.description} for t in tracks],
        "teams": [{"name": t.name, "max_members": t.max_members} for t in teams],
        "projects": [
            {
                "title": p.title, "summary": p.summary, "description": p.description,
                "repo_url": p.repo_url, "demo_url": p.demo_url, "video_url": p.video_url,
                "track": p.track.name if p.track else None,
                "team": p.team.name if p.team else None,
                "is_draft": p.is_draft,
            }
            for p in projects
        ],
    }
    import json as _json

    job = BulkJob(
        event_id=event.id, job_type=JobType.EXPORT, status=JobStatus.COMPLETED,
        records_total=len(projects), records_processed=len(projects),
        records_failed=0, created_by=current_user.id,
    )
    db.add(job)
    await db.commit()
    return JSONResponse(
        content=dump,
        headers={"Content-Disposition": f"attachment; filename={event.slug}-export.json"},
    )


@router.post(
    "/api/events/{event_identifier}/bulk/import",
    response_model=BulkJobResponse,
)
async def bulk_import(
    event_identifier: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    """Bulk import projects/teams from JSON (migration path in)."""
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    items = payload.get("projects", []) if isinstance(payload, dict) else []
    track_cache: dict = {}
    team_cache: dict = {}
    processed = 0
    failed = 0
    errors = []
    import uuid as uuid_lib

    async def get_track(name: Optional[str]):
        if not name:
            return None
        if name not in track_cache:
            existing = await db.execute(
                select(Track).where(Track.event_id == event.id, Track.name == name)
            )
            track = existing.scalar_one_or_none()
            if not track:
                track = Track(event_id=event.id, name=name)
                db.add(track)
                await db.flush()
            track_cache[name] = track
        return track_cache[name]

    async def get_team(name: Optional[str]):
        if not name:
            return None
        if name not in team_cache:
            existing = await db.execute(
                select(Team).where(Team.event_id == event.id, Team.name == name)
            )
            team = existing.scalar_one_or_none()
            if not team:
                team = Team(
                    event_id=event.id, name=name,
                    invite_code=uuid_lib.uuid4().hex[:8].upper(),
                    created_by=current_user.id,
                )
                db.add(team)
                await db.flush()
            team_cache[name] = team
        return team_cache[name]

    for i, item in enumerate(items):
        try:
            title = (item.get("title") or "").strip()
            if not title:
                raise ValueError("title is required")
            track = await get_track(item.get("track"))
            team = await get_team(item.get("team"))
            if not team:
                raise ValueError("team is required")
            db.add(
                Project(
                    event_id=event.id, team_id=team.id,
                    track_id=track.id if track else None,
                    title=title, summary=item.get("summary", ""),
                    description=item.get("description", ""),
                    repo_url=item.get("repo_url", ""),
                    is_draft=True,
                )
            )
            processed += 1
        except Exception as exc:  # noqa: BLE001 - per-record errors collected
            failed += 1
            errors.append({"index": i, "error": str(exc)})

    job = BulkJob(
        event_id=event.id, job_type=JobType.IMPORT, status=JobStatus.COMPLETED,
        records_total=len(items), records_processed=processed,
        records_failed=failed, error_log=errors,
        created_by=current_user.id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return _job_response(job)


@router.get("/api/events/{event_identifier}/export/assignments.csv")
async def export_assignments_csv(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    """Organizer CSV of judge assignments and workloads (pipeline doc 11)."""
    import csv
    import io

    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(
        select(JudgeAssignment).where(JudgeAssignment.event_id == event.id)
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Judge ID", "Track ID"])
    for a in result.scalars().all():
        writer.writerow([str(a.judge_id), str(a.track_id)])
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={event.slug}-assignments.csv"},
    )


@router.get("/api/events/{event_identifier}/export/reviews.csv")
async def export_reviews_csv(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    """Organizer CSV of every review score (pipeline doc 11)."""
    import csv
    import io

    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(select(Score).where(Score.event_id == event.id))
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Judge ID", "Project ID", "Criteria ID", "Score", "Comment", "Submitted At"])
    for s in result.scalars().all():
        writer.writerow(
            [
                str(s.judge_id), str(s.project_id), str(s.criteria_id),
                s.score, s.comment or "",
                s.submitted_at.isoformat() if s.submitted_at else "",
            ]
        )
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={event.slug}-reviews.csv"},
    )


@router.get("/api/events/{event_identifier}/export/audit.csv")
async def export_audit_csv(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    """Organizer CSV of the mutation audit trail (pipeline doc 11)."""
    import csv
    import io

    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(
        select(AuditEvent)
        .where(AuditEvent.event_id == event.id)
        .order_by(AuditEvent.created_at)
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Time", "Action", "Actor", "Entity", "Details"])
    for a in result.scalars().all():
        writer.writerow(
            [
                a.created_at.isoformat() if a.created_at else "",
                a.action,
                str(a.actor_id) if a.actor_id else "",
                f"{a.entity}:{a.entity_id}" if a.entity else "",
                str(a.details or {}),
            ]
        )
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={event.slug}-audit.csv"},
    )


@router.get(
    "/api/events/{event_identifier}/bulk/jobs",
    response_model=List[BulkJobResponse],
)
async def list_bulk_jobs(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(
        select(BulkJob).where(BulkJob.event_id == event.id).order_by(BulkJob.created_at.desc())
    )
    return [_job_response(j) for j in result.scalars().all()]
