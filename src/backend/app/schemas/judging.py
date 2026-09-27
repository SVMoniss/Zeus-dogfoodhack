from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from decimal import Decimal


class JudgingCriteriaBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    weight: Decimal = Field(..., ge=0, le=100, decimal_places=2)
    min_score: int = Field(default=1, ge=1, le=10)
    max_score: int = Field(default=5, ge=1, le=10)
    display_order: int = 0


class JudgingCriteriaCreate(JudgingCriteriaBase):
    pass


class JudgingCriteriaUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    weight: Optional[Decimal] = Field(None, ge=0, le=100, decimal_places=2)
    min_score: Optional[int] = Field(None, ge=1, le=10)
    max_score: Optional[int] = Field(None, ge=1, le=10)
    display_order: Optional[int] = None


class JudgingCriteriaResponse(JudgingCriteriaBase):
    id: UUID
    event_id: UUID

    class Config:
        from_attributes = True


class JudgeInvite(BaseModel):
    email: str


class JudgeAssign(BaseModel):
    judge_id: UUID
    track_id: UUID


class JudgeAssignmentResponse(BaseModel):
    id: UUID
    event_id: UUID
    judge_id: UUID
    track_id: UUID
    judge_name: Optional[str] = None
    judge_email: Optional[str] = None
    track_name: Optional[str] = None

    class Config:
        from_attributes = True


class ScoreCreate(BaseModel):
    criteria_id: UUID
    score: int
    comment: Optional[str] = None


class ScoreSubmit(BaseModel):
    scores: List[ScoreCreate]


class ScoreResponse(BaseModel):
    id: UUID
    event_id: UUID
    judge_id: UUID
    project_id: UUID
    criteria_id: UUID
    score: int
    comment: Optional[str]
    submitted_at: datetime

    class Config:
        from_attributes = True


class ProjectScoreSummary(BaseModel):
    project_id: UUID
    project_title: str
    team_name: str
    track_name: str
    criteria_scores: dict  # criteria_name -> score
    total_weighted_score: float
    normalized_score: Optional[float] = None
    rank: Optional[int] = None


class ProgressDashboard(BaseModel):
    total_projects: int
    judged_projects: int
    pending_projects: int
    total_judges: int
    judges_completed: int
    by_track: dict  # track_name -> {total, judged, pending}
    by_judge: dict  # judge_id -> {name, total, completed, pending}


class NormalizationReport(BaseModel):
    judge_id: UUID
    judge_name: str
    raw_scores: dict  # criteria -> list of scores
    mean: float
    std: float
    normalized_scores: dict  # project_id -> normalized_score