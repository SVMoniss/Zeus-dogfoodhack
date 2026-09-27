from sqlalchemy import Column, String, Text, ForeignKey, Enum as SQLEnum, DateTime, Integer, DECIMAL, Boolean, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import JobStatus, JobType, VoteAction, WebhookEvent


class JudgingCriteria(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "judging_criteria"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    weight = Column(DECIMAL(5, 2), default=1.00, nullable=False)
    min_score = Column(Integer, default=1)
    max_score = Column(Integer, default=5)
    display_order = Column(Integer, default=0)

    # Relationships
    event = relationship("Event", back_populates="judging_criteria")
    scores = relationship("Score", back_populates="criteria", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<JudgingCriteria(id={self.id}, name={self.name}, weight={self.weight})>"


class JudgeAssignment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "judge_assignments"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    judge_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id = Column(UUID(as_uuid=True), ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    # Relationships
    event = relationship("Event", back_populates="judge_assignments", foreign_keys="JudgeAssignment.event_id")
    judge = relationship("User", back_populates="judge_assignments", foreign_keys="JudgeAssignment.judge_id")
    track = relationship("Track", back_populates="judge_assignments", foreign_keys="JudgeAssignment.track_id")
    assigner = relationship("User", back_populates="assigned_judge_assignments", foreign_keys="JudgeAssignment.assigned_by")
    batches = relationship("JudgeBatch", back_populates="assignment", foreign_keys="JudgeBatch.assignment_id", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("judge_id", "track_id", name="uq_judge_track"),)

    def __repr__(self):
        return f"<JudgeAssignment(judge_id={self.judge_id}, track_id={self.track_id})>"


class Score(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "scores"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    judge_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    criteria_id = Column(UUID(as_uuid=True), ForeignKey("judging_criteria.id", ondelete="CASCADE"), nullable=False, index=True)
    score = Column(Integer, nullable=False)
    comment = Column(Text)

    # Relationships
    event = relationship("Event", back_populates="scores", foreign_keys="Score.event_id")
    judge = relationship("User", back_populates="scores", foreign_keys="Score.judge_id")
    project = relationship("Project", back_populates="scores", foreign_keys="Score.project_id")
    criteria = relationship("JudgingCriteria", back_populates="scores", foreign_keys="Score.criteria_id")

    __table_args__ = (UniqueConstraint("judge_id", "project_id", "criteria_id", name="uq_judge_project_criteria"),)

    def __repr__(self):
        return f"<Score(judge_id={self.judge_id}, project_id={self.project_id}, criteria_id={self.criteria_id}, score={self.score})>"


class JudgeBatch(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "judge_batches"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    judge_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id = Column(UUID(as_uuid=True), ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False, index=True)
    assignment_id = Column(UUID(as_uuid=True), ForeignKey("judge_assignments.id", ondelete="CASCADE"))
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))
    is_complete = Column(Boolean, default=False, nullable=False)

    # Relationships
    event = relationship("Event", back_populates="judge_batches", foreign_keys="JudgeBatch.event_id")
    judge = relationship("User", back_populates="judge_batches", foreign_keys="JudgeBatch.judge_id")
    track = relationship("Track", back_populates="judge_batches", foreign_keys="JudgeBatch.track_id")
    assignment = relationship("JudgeAssignment", back_populates="batches", foreign_keys="JudgeBatch.assignment_id")

    def __repr__(self):
        return f"<JudgeBatch(judge_id={self.judge_id}, track_id={self.track_id}, complete={self.is_complete})>"