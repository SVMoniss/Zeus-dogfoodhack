"""Webhook delivery with HMAC signatures and retries (T4)."""
import asyncio
import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Webhook

logger = logging.getLogger(__name__)

TIMEOUT = 10
ATTEMPTS = 3


def sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def _deliver(url: str, secret: str, event_type: str, payload: dict) -> bool:
    body = json.dumps(
        {
            "type": event_type,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "data": payload,
        }
    ).encode()
    headers = {
        "Content-Type": "application/json",
        "X-Dogfood-Event": event_type,
        "X-Dogfood-Signature": sign(secret, body),
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for attempt in range(1, ATTEMPTS + 1):
            try:
                resp = await client.post(url, content=body, headers=headers)
                if resp.status_code < 500:
                    return True
                logger.warning("Webhook %s attempt %d got %d", url, attempt, resp.status_code)
            except Exception as exc:  # noqa: BLE001 - best effort delivery
                logger.warning("Webhook %s attempt %d failed: %s", url, attempt, exc)
            if attempt < ATTEMPTS:
                await asyncio.sleep(attempt)
    return False


async def dispatch(db: AsyncSession, event_id, event_type: str, payload: dict) -> int:
    """Deliver to all active webhooks subscribed to event_type. Returns count delivered."""
    result = await db.execute(
        select(Webhook).where(Webhook.event_id == event_id, Webhook.is_active == True)  # noqa: E712
    )
    delivered = 0
    for hook in result.scalars().all():
        subscribed = hook.events or []
        if event_type in subscribed or "*" in subscribed:
            if await _deliver(hook.url, hook.secret, event_type, payload):
                delivered += 1
    return delivered


async def deliver_event(event_id, event_type: str, payload: dict) -> int:
    """Standalone delivery with its own session (safe for BackgroundTasks,
    which run after the request session closes)."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        return await dispatch(db, event_id, event_type, payload)
