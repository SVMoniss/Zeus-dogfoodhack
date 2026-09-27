from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from app.models.enums import ProjectStatus


class TeamBase(BaseModel):
    name: str = Field(..., max_length=255)
    max_members: int = Field(default=4, ge=1, le=10)


class TeamCreate(TeamBase):
    pass


class TeamJoin(BaseModel):
    invite_code: str


class TeamResponse(TeamBase):
    id: UUID
    event_id: UUID
    invite_code: str
    created_by: UUID
    created_at: datetime
    member_count: int = 0

    class Config:
        from_attributes = True


class TeamMemberResponse(BaseModel):
    id: UUID
    team_id: UUID
    user_id: UUID
    user_email: str
    user_name: Optional[str]
    joined_at: datetime

    class Config:
        from_attributes = True


class ProjectBase(BaseModel):
    title: str = Field(..., max_length=255)
    summary: Optional[str] = None
    description: Optional[str] = None
    repo_url: Optional[str] = None
    demo_url: Optional[str] = None
    video_url: Optional[str] = None
    track_id: Optional[UUID] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    summary: Optional[str] = None
    description: Optional[str] = None
    repo_url: Optional[str] = None
    demo_url: Optional[str] = None
    video_url: Optional[str] = None
    track_id: Optional[UUID] = None


class ProjectSubmit(BaseModel):
    pass  # Just submit action


class ProjectResponse(ProjectBase):
    id: UUID
    event_id: UUID
    team_id: UUID
    submitted_at: Optional[datetime]
    is_draft: bool
    created_at: datetime
    updated_at: datetime
    team_name: Optional[str] = None
    track_name: Optional[str] = None

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    id: UUID
    title: str
    summary: Optional[str]
    repo_url: Optional[str]
    demo_url: Optional[str]
    video_url: Optional[str]
    submitted_at: Optional[datetime]
    is_draft: bool
    team_name: str
    track_name: str

    class Config:
        from_attributes = True