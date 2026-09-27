from sqlalchemy import Column, String, Text, ForeignKey, Enum as SQLEnum, DateTime, Integer, Boolean, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
from sqlalchemy.orm import relationship
import uuid
from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import VoteAction, WebhookEvent, JobStatus, JobType


class CommunityVote(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "community_votes"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    voter_email = Column(String(255), nullable=False)
    voter_ip = Column(INET)
    vote_token = Column(UUID(as_uuid=True), unique=True, nullable=False, default=uuid.uuid4, index=True)
    score = Column(Integer, nullable=False)

    # Relationships
    event = relationship("Event", back_populates="community_votes", foreign_keys="CommunityVote.event_id")
    project = relationship("Project", back_populates="community_votes", foreign_keys="CommunityVote.project_id")

    __table_args__ = (UniqueConstraint("event_id", "project_id", "voter_email", name="uq_vote_event_project_voter"),)

    def __repr__(self):
        return f"<CommunityVote(project_id={self.project_id}, voter_email={self.voter_email})>"


class ProjectComment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "project_comments"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    author_name = Column(String(255))
    author_email = Column(String(255))
    content = Column(Text, nullable=False)
    is_approved = Column(Boolean, default=False, nullable=False)

    # Relationships
    event = relationship("Event", back_populates="project_comments", foreign_keys="ProjectComment.event_id")
    project = relationship("Project", back_populates="comments", foreign_keys="ProjectComment.project_id")
    user = relationship("User", foreign_keys="ProjectComment.user_id")

    def __repr__(self):
        return f"<ProjectComment(project_id={self.project_id}, author={self.author_name})>"


class VoteAuditLog(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "vote_audit_log"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(SQLEnum(VoteAction), nullable=False)
    voter_ip = Column(INET)
    voter_email = Column(String(255))
    user_agent = Column(Text)
    details = Column(JSONB)

    # Relationships
    event = relationship("Event", back_populates="vote_audit_logs", foreign_keys="VoteAuditLog.event_id")
    project = relationship("Project", foreign_keys="VoteAuditLog.project_id")

    def __repr__(self):
        return f"<VoteAuditLog(action={self.action}, project_id={self.project_id})>"


class APIKey(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "api_keys"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    key_hash = Column(String(255), nullable=False)
    key_prefix = Column(String(20), nullable=False)
    permissions = Column(JSONB, default=list, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    last_used_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))

    # Relationships
    event = relationship("Event", back_populates="api_keys", foreign_keys="APIKey.event_id")
    creator = relationship("User", back_populates="api_keys", foreign_keys="APIKey.created_by")

    def __repr__(self):
        return f"<APIKey(name={self.name})>"


class Webhook(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "webhooks"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(String(500), nullable=False)
    secret = Column(String(255), nullable=False)
    events = Column(JSONB, default=list, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    event = relationship("Event", back_populates="webhooks", foreign_keys="Webhook.event_id")

    def __repr__(self):
        return f"<Webhook(url={self.url})>"


class Certificate(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "certificates"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_type = Column(String(50), nullable=False)
    recipient_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    certificate_type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    metadata = Column(JSONB)
    signature = Column(String(500))
    public_key = Column(String(500))
    issued_at = Column(DateTime(timezone=True), server_default=func.now())
    verified_at = Column(DateTime(timezone=True))

    # Relationships
    event = relationship("Event", back_populates="certificates", foreign_keys="Certificate.event_id")
    recipient = relationship("User", primaryjoin="and_(Certificate.recipient_id==foreign(User.id), Certificate.recipient_type=='user')", foreign_keys="Certificate.recipient_id")

    def __repr__(self):
        return f"<Certificate(type={self.certificate_type}, recipient_id={self.recipient_id})>"


class BulkJob(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "bulk_jobs"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    job_type = Column(SQLEnum(JobType), nullable=False)
    status = Column(SQLEnum(JobStatus), default=JobStatus.PENDING, nullable=False)
    file_path = Column(String(500))
    records_total = Column(Integer, default=0)
    records_processed = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    error_log = Column(JSONB)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    # Relationships
    event = relationship("Event", back_populates="bulk_jobs", foreign_keys="BulkJob.event_id")
    creator = relationship("User", back_populates="bulk_jobs", foreign_keys="BulkJob.created_by")

    def __repr__(self):
        return f"<BulkJob(type={self.job_type}, status={self.status})>"


class ProjectEmbedding(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "project_embeddings"

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    embedding = Column("embedding", JSONB)  # Using JSONB for now, will use VECTOR when pgvector is available
    content_hash = Column(String(64))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    project = relationship("Project", back_populates="embedding", foreign_keys="ProjectEmbedding.project_id")

    def __repr__(self):
        return f"<ProjectEmbedding(project_id={self.project_id})>"