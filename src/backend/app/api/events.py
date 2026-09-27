from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime
from typing import List, Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_organizer
from app.models import Event, Track, User
from app.models.enums import UserRole
from app.schemas.event import (
    EventCreate, EventUpdate, EventResponse, EventListResponse,
    TrackCreate, TrackUpdate, TrackResponse
)

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=List[EventListResponse])
async def list_events(
    db: AsyncSession = Depends(get_db),
    active_only: bool = True,
):
    query = select(Event)
    if active_only:
        query = query.where(Event.is_active == True)
    query = query.order_by(Event.created_at.desc())
    result = await db.execute(query)
    events = result.scalars().all()
    return events


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    query = select(Event).options(selectinload(Event.tracks)).where(Event.id == event_id)
    result = await db.execute(query)
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    return event


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    event_data: EventCreate,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    # Check slug uniqueness
    result = await db.execute(select(Event).where(Event.slug == event_data.slug))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug already exists")
    
    event = Event(**event_data.model_dump(), created_by=current_user.id)
    db.add(event)
    await db.commit()
    await db.refresh(event)
    
    return event


@router.patch("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: UUID,
    event_data: EventUpdate,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    update_data = event_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(event, field, value)
    
    await db.commit()
    await db.refresh(event)
    
    return event


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: UUID,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    await db.delete(event)
    await db.commit()


# Tracks
@router.get("/{event_id}/tracks", response_model=List[TrackResponse])
async def list_tracks(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    result = await db.execute(select(Track).where(Track.event_id == event_id).order_by(Track.display_order))
    tracks = result.scalars().all()
    return tracks


@router.post("/{event_id}/tracks", response_model=TrackResponse, status_code=status.HTTP_201_CREATED)
async def create_track(
    event_id: UUID,
    track_data: TrackCreate,
    current_user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    track = Track(**track_data.model_dump(), event_id=event_id)
    db.add(track)
    await db.commit()
    await db.refresh(track)
    
    return track