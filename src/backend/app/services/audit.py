"""Append-only mutation audit (pipeline doc section 12).

Call log_audit() before the request transaction commits; the row commits
atomically with the change it describes. Rows are never updated or
deleted through the API.
"""
from typing import Optional

from app.models import AuditEvent


async def log_audit(
    db,
    *,
    action: str,
    actor_id=None,
    event_id=None,
    entity: Optional[str] = None,
    entity_id=None,
    details: Optional[dict] = None,
) -> None:
    db.add(
        AuditEvent(
            action=action,
            actor_id=actor_id,
            event_id=event_id,
            entity=entity,
            entity_id=entity_id,
            details=details or {},
        )
    )
