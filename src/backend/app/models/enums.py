import enum


class UserRole(str, enum.Enum):
    VISITOR = "visitor"
    PARTICIPANT = "participant"
    JUDGE = "judge"
    ORGANIZER = "organizer"
    ADMIN = "admin"


class ProjectStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class JobType(str, enum.Enum):
    IMPORT = "import"
    EXPORT = "export"


class VoteAction(str, enum.Enum):
    VOTE_CAST = "vote_cast"
    VOTE_REJECTED = "vote_rejected"
    RATE_LIMITED = "rate_limited"
    DUPLICATE_DETECTED = "duplicate_detected"


class WebhookEvent(str, enum.Enum):
    PROJECT_SUBMITTED = "project.submitted"
    JUDGING_COMPLETED = "judging.completed"
    VOTING_CLOSED = "voting.closed"
    RESULTS_PUBLISHED = "results.published"