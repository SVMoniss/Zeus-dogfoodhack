from sqlalchemy import Column, String, Text, ForeignKey, Enum as SQLEnum, DateTime, Boolean, Integer, DECIMAL, UniqueConstraint
from sqlalchemy.orm import relationship, foreign
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
from sqlalchemy.orm import relationship
import uuid
from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import UserRole


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    role = Column(SQLEnum(UserRole), default=UserRole.VISITOR, nullable=False)

    # Relationships
    teams = relationship("TeamMember", back_populates="user", cascade="all, delete-orphan")
    created_events = relationship("Event", back_populates="creator", foreign_keys="Event.created_by")
    created_teams = relationship("Team", back_populates="creator", foreign_keys="Team.created_by")
    judge_assignments = relationship("JudgeAssignment", back_populates="judge", foreign_keys="JudgeAssignment.judge_id", cascade="all, delete-orphan")
    assigned_judge_assignments = relationship("JudgeAssignment", back_populates="assigner", foreign_keys="JudgeAssignment.assigned_by")
    scores = relationship("Score", back_populates="judge", foreign_keys="Score.judge_id", cascade="all, delete-orphan")
    judge_batches = relationship("JudgeBatch", back_populates="judge", foreign_keys="JudgeBatch.judge_id", cascade="all, delete-orphan")
    api_keys = relationship("APIKey", back_populates="creator", foreign_keys="APIKey.created_by")
    certificates = relationship("Certificate", back_populates="recipient", primaryjoin="and_(User.id==foreign(Certificate.recipient_id), Certificate.recipient_type=='user')", foreign_keys="Certificate.recipient_id")
    bulk_jobs = relationship("BulkJob", back_populates="creator", foreign_keys="BulkJob.created_by")

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"


class Event(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "events"

    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text)
    submissions_open_at = Column(DateTime(timezone=True), nullable=False)
    submissions_close_at = Column(DateTime(timezone=True), nullable=False)
    voting_open_at = Column(DateTime(timezone=True))
    voting_close_at = Column(DateTime(timezone=True))
    results_published_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True, nullable=False)
    prizes = Column(JSONB, default=list, nullable=False, server_default="[]")
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    # Relationships
    creator = relationship("User", back_populates="created_events", foreign_keys="Event.created_by")
    tracks = relationship("Track", back_populates="event", foreign_keys="Track.event_id", cascade="all, delete-orphan")
    teams = relationship("Team", back_populates="event", foreign_keys="Team.event_id", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="event", foreign_keys="Project.event_id", cascade="all, delete-orphan")
    judging_criteria = relationship("JudgingCriteria", back_populates="event", foreign_keys="JudgingCriteria.event_id", cascade="all, delete-orphan")
    judge_assignments = relationship("JudgeAssignment", back_populates="event", foreign_keys="JudgeAssignment.event_id", cascade="all, delete-orphan")
    scores = relationship("Score", back_populates="event", foreign_keys="Score.event_id", cascade="all, delete-orphan")
    judge_batches = relationship("JudgeBatch", back_populates="event", foreign_keys="JudgeBatch.event_id", cascade="all, delete-orphan")
    community_votes = relationship("CommunityVote", back_populates="event", foreign_keys="CommunityVote.event_id", cascade="all, delete-orphan")
    project_comments = relationship("ProjectComment", back_populates="event", foreign_keys="ProjectComment.event_id", cascade="all, delete-orphan")
    vote_audit_logs = relationship("VoteAuditLog", back_populates="event", foreign_keys="VoteAuditLog.event_id", cascade="all, delete-orphan")
    api_keys = relationship("APIKey", back_populates="event", foreign_keys="APIKey.event_id", cascade="all, delete-orphan")
    webhooks = relationship("Webhook", back_populates="event", foreign_keys="Webhook.event_id", cascade="all, delete-orphan")
    certificates = relationship("Certificate", back_populates="event", foreign_keys="Certificate.event_id", cascade="all, delete-orphan")
    bulk_jobs = relationship("BulkJob", back_populates="event", foreign_keys="BulkJob.event_id", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Event(id={self.id}, name={self.name}, slug={self.slug})>"


class Track(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tracks"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    display_order = Column(Integer, default=0)

    # Relationships
    event = relationship("Event", back_populates="tracks", foreign_keys="Track.event_id")
    judge_assignments = relationship("JudgeAssignment", back_populates="track", foreign_keys="JudgeAssignment.track_id", cascade="all, delete-orphan")
    judge_batches = relationship("JudgeBatch", back_populates="track", foreign_keys="JudgeBatch.track_id")
    projects = relationship("Project", back_populates="track", foreign_keys="Project.track_id")

    def __repr__(self):
        return f"<Track(id={self.id}, name={self.name})>"


class Team(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "teams"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    invite_code = Column(String(50), unique=True, nullable=False, index=True)
    max_members = Column(Integer, default=4)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    # Relationships
    event = relationship("Event", back_populates="teams", foreign_keys="Team.event_id")
    creator = relationship("User", back_populates="created_teams", foreign_keys="Team.created_by")
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="team", foreign_keys="Project.team_id", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Team(id={self.id}, name={self.name}, invite_code={self.invite_code})>"


class TeamMember(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "team_members"

    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Relationships
    team = relationship("Team", back_populates="members", foreign_keys="TeamMember.team_id")
    user = relationship("User", back_populates="teams", foreign_keys="TeamMember.user_id")

    __table_args__ = (UniqueConstraint("team_id", "user_id", name="uq_team_member"),)

    def __repr__(self):
        return f"<TeamMember(team_id={self.team_id}, user_id={self.user_id})>"


class Project(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "projects"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id = Column(UUID(as_uuid=True), ForeignKey("tracks.id", ondelete="SET NULL"), index=True)
    title = Column(String(255), nullable=False)
    summary = Column(Text)
    description = Column(Text)
    repo_url = Column(String(500))
    demo_url = Column(String(500))
    video_url = Column(String(500))
    submitted_at = Column(DateTime(timezone=True))
    is_draft = Column(Boolean, default=True, nullable=False)

    # Relationships
    event = relationship("Event", back_populates="projects", foreign_keys="Project.event_id")
    team = relationship("Team", back_populates="projects", foreign_keys="Project.team_id")
    track = relationship("Track", back_populates="projects", foreign_keys="Project.track_id")
    scores = relationship("Score", back_populates="project", foreign_keys="Score.project_id", cascade="all, delete-orphan")
    community_votes = relationship("CommunityVote", back_populates="project", foreign_keys="CommunityVote.project_id", cascade="all, delete-orphan")
    comments = relationship("ProjectComment", back_populates="project", foreign_keys="ProjectComment.project_id", cascade="all, delete-orphan")
    embedding = relationship("ProjectEmbedding", back_populates="project", foreign_keys="ProjectEmbedding.project_id", uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Project(id={self.id}, title={self.title})>"