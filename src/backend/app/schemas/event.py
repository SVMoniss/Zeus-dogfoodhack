from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from app.models.enums import UserRole


class TrackBase(BaseModel):
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    display_order: int = 0


class TrackCreate(TrackBase):
    pass


class TrackUpdate(TrackBase):
    pass


class TrackResponse(TrackBase):
    id: UUID

    class Config:
        from_attributes = True


class Prize(BaseModel):
    place: Optional[str] = Field(None, max_length=100)
    title: str = Field(..., max_length=255)
    amount: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None


class EventBase(BaseModel):
    name: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=100)
    description: Optional[str] = None
    submissions_open_at: datetime
    submissions_close_at: datetime
    voting_open_at: Optional[datetime] = None
    voting_close_at: Optional[datetime] = None
    results_published_at: Optional[datetime] = None
    prizes: List[Prize] = Field(default_factory=list)


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    submissions_open_at: Optional[datetime] = None
    submissions_close_at: Optional[datetime] = None
    voting_open_at: Optional[datetime] = None
    voting_close_at: Optional[datetime] = None
    results_published_at: Optional[datetime] = None
    is_active: Optional[bool] = None
    prizes: Optional[List[Prize]] = None


class EventResponse(EventBase):
    id: UUID
    is_active: bool
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    tracks: List[TrackResponse] = []

    class Config:
        from_attributes = True


class EventListResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str]
    submissions_open_at: datetime
    submissions_close_at: datetime
    is_active: bool
    prizes: List[Prize] = Field(default_factory=list)

    class Config:
        from_attributes = True