"""Organizer-readable mutation audit trail (pipeline doc section 12)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.deps import require_organizer, resolve_event
from app.models import AuditEvent, User

router = APIRouter(tags=["audit"])


@router.get("/api/events/{event_identifier}/audit")
async def list_audit_events(
    event_identifier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_organizer),
    limit: int = 100,
):
    event = await resolve_event(db, event_identifier)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await db.execute(
        select(AuditEvent)
        .where(AuditEvent.event_id == event.id)
        .order_by(AuditEvent.created_at.desc())
        .limit(min(limit, 500))
    )
    return [
        {
            "id": str(a.id),
            "action": a.action,
            "actor_id": str(a.actor_id) if a.actor_id else None,
            "entity": a.entity,
            "entity_id": str(a.entity_id) if a.entity_id else None,
            "details": a.details or {},
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in result.scalars().all()
    ]
