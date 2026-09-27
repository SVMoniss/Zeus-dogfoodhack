from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class VoteTokenRequest(BaseModel):
    email: EmailStr


class VoteTokenResponse(BaseModel):
    token: UUID
    expires_at: datetime


class VoteCast(BaseModel):
    token: UUID
    project_id: UUID
    score: int = Field(..., ge=1, le=5)


class BallotResponse(BaseModel):
    projects: List[dict]  # Randomized project list
    vote_token: UUID


class VoteResults(BaseModel):
    project_id: UUID
    project_title: str
    team_name: str
    average_score: float
    vote_count: int
    rank: int


class CommentCreate(BaseModel):
    content: str
    author_name: Optional[str] = None
    author_email: Optional[EmailStr] = None


class CommentResponse(BaseModel):
    id: UUID
    project_id: UUID
    author_name: str
    author_email: Optional[str]
    content: str
    is_approved: bool
    created_at: datetime

    class Config:
        from_attributes = True


# T4 Schemas
class APIKeyCreate(BaseModel):
    name: str
    permissions: List[str] = []


class APIKeyResponse(BaseModel):
    id: UUID
    name: str
    key_prefix: str
    permissions: List[str]
    created_at: datetime
    expires_at: Optional[datetime]
    last_used_at: Optional[datetime]

    class Config:
        from_attributes = True


class APIKeyWithSecret(APIKeyResponse):
    key: str  # Only returned on creation


class WebhookCreate(BaseModel):
    url: str
    events: List[str]


class WebhookResponse(BaseModel):
    id: UUID
    url: str
    events: List[str]
    is_active: bool
    created_at: datetime
    secret: Optional[str] = None  # Only returned on creation (needed to verify signatures)

    class Config:
        from_attributes = True


class CertificateGenerate(BaseModel):
    recipient_type: str
    recipient_id: UUID
    certificate_type: str
    title: str
    description: Optional[str] = None
    metadata: dict = {}


class CertificateResponse(BaseModel):
    id: UUID
    event_id: UUID
    recipient_type: str
    recipient_id: UUID
    certificate_type: str
    title: str
    description: Optional[str]
    metadata: dict
    signature: Optional[str] = None
    public_key: Optional[str] = None
    issued_at: datetime
    verified_at: Optional[datetime]

    class Config:
        from_attributes = True


class CertificateVerify(BaseModel):
    valid: bool
    certificate: Optional[CertificateResponse] = None


class BulkJobStart(BaseModel):
    job_type: str  # import or export


class BulkJobResponse(BaseModel):
    id: UUID
    event_id: UUID
    job_type: str
    status: str
    file_path: Optional[str]
    records_total: int
    records_processed: int
    records_failed: int
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class SearchQuery(BaseModel):
    query: str
    limit: int = 10


class SearchResult(BaseModel):
    project_id: UUID
    title: str
    summary: Optional[str]
    similarity: float