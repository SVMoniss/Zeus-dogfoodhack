from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import datetime, timezone
from uuid import UUID
from app.models.enums import UserRole

# Guardrail: a hackathon submissions window must be ordered and bounded.
# E2E suites previously created decade-long windows (2020 -> 2030) just to
# guarantee "open now"; 90 days keeps real hackathons valid while rejecting
# meaningless year-spanning periods.
MAX_EVENT_WINDOW_DAYS = 90


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def check_submission_window(open_at: datetime, close_at: datetime) -> None:
    if close_at <= open_at:
        raise ValueError("submissions_close_at must be after submissions_open_at")
    days = (_as_utc(close_at) - _as_utc(open_at)).total_seconds() / 86400
    if days > MAX_EVENT_WINDOW_DAYS:
        raise ValueError(
            f"Submissions window cannot exceed {MAX_EVENT_WINDOW_DAYS} days"
        )


def check_voting_window(open_at: datetime, close_at: datetime) -> None:
    if close_at <= open_at:
        raise ValueError("voting_close_at must be after voting_open_at")


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
    @model_validator(mode="after")
    def _validate_windows(self) -> "EventCreate":
        check_submission_window(self.submissions_open_at, self.submissions_close_at)
        if self.voting_open_at and self.voting_close_at:
            check_voting_window(self.voting_open_at, self.voting_close_at)
        return self


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

    @model_validator(mode="after")
    def _validate_windows(self) -> "EventUpdate":
        # Partial updates are merged with stored values in the API layer;
        # here we can only check pairs fully present in the payload.
        if self.submissions_open_at and self.submissions_close_at:
            check_submission_window(self.submissions_open_at, self.submissions_close_at)
        if self.voting_open_at and self.voting_close_at:
            check_voting_window(self.voting_open_at, self.voting_close_at)
        return self


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