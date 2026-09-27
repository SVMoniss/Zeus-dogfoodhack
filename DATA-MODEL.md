# Data Model Documentation

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    User     │       │    Event    │       │    Track    │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │◄──────│ created_by  │       │ id (PK)     │
│ email       │       │ id (PK)     │───────│ event_id(FK)│
│ password_   │       │ name        │       │ name        │
│   hash      │       │ slug (UQ)   │       │ description │
│ full_name   │       │ description │       │ display_    │
│ role        │       │ sub_open_at │       │   order     │
│ created_at  │       │ sub_close_at│       └──────┬──────┘
│ updated_at  │       │ voting_*    │              │
└──────┬──────┘       │ results_pub │              │
       │              │ is_active   │              │
       │              │ created_at  │              │
       │              │ updated_at  │              │
       │              └──────┬──────┘              │
       │                     │                     │
       ▼                     ▼                     ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    Team     │       │   Project   │       │  Judging    │
├─────────────┤       ├─────────────┤       │  Criteria   │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)     │       │ id (PK)     │
│ event_idFK  │◄──────│ event_idFK  │       │ event_idFK  │
│ name        │       │ team_idFK   │◄──────│ name        │
│ invite_code │       │ track_idFK  │       │ description │
│ max_members │       │ title       │       │ weight      │
│ created_by  │       │ summary     │       │ min/max     │
│ created_at  │       │ description │       │ score       │
└──────┬──────┘       │ repo_url    │       │ display_ord │
       │              │ demo_url    │       └──────┬──────┘
       │              │ video_url   │              │
       │              │ submitted_  │              │
       │              │   at        │              │
       │              │ is_draft    │              │
       │              └──────┬──────┘              │
       │                     │                     │
       ▼                     ▼                     ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│TeamMember   │       │   Score     │       │JudgeAssign- │
├─────────────┤       ├─────────────┤       │   ment      │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)     │       │ id (PK)     │
│ team_idFK   │       │ event_idFK  │       │ event_idFK  │
│ user_idFK   │       │ judge_idFK  │◄──────│ judge_idFK  │
│ joined_at   │       │ project_idFK│       │ track_idFK  │
│ (UQ)        │       │ criteria_idFK│      │ assigned_by │
└─────────────┘       │ score       │       │ assigned_at │
                      │ comment     │       └──────┬──────┘
                      │ submitted_at│              │
                      │ (UQ)        │              │
                      └─────────────┘              │
                                                   ▼
                                          ┌─────────────────┐
                                          │   JudgeBatch    │
                                          ├─────────────────┤
                                          │ id (PK)         │
                                          │ event_idFK      │
                                          │ judge_idFK      │
                                          │ track_idFK      │
                                          │ assignment_idFK │
                                          │ started_at      │
                                          │ completed_at    │
                                          │ is_complete     │
                                          └─────────────────┘
```

## Core Tables (T1)

### users
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Unique identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL, INDEX | User email |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hash |
| full_name | VARCHAR(255) | | Display name |
| role | VARCHAR(50) | NOT NULL, DEFAULT 'visitor' | visitor/participant/judge/organizer/admin |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update |

### events
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Unique identifier |
| name | VARCHAR(255) | NOT NULL | Event name |
| slug | VARCHAR(100) | UNIQUE, NOT NULL, INDEX | URL-friendly identifier |
| description | TEXT | | Event description |
| submissions_open_at | TIMESTAMPTZ | NOT NULL | When submissions open |
| submissions_close_at | TIMESTAMPTZ | NOT NULL | **Deadline - enforced in backend** |
| voting_open_at | TIMESTAMPTZ | | Community voting opens |
| voting_close_at | TIMESTAMPTZ | | Community voting closes |
| results_published_at | TIMESTAMPTZ | | Results become public |
| is_active | BOOLEAN | DEFAULT true | Event visibility |
| prizes | JSONB | DEFAULT '[]', NOT NULL | Configurable prizes [{place, title, amount, description}] |
| created_by | UUID | FK → users.id | Organizer who created |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

### tracks
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | Parent event |
| name | VARCHAR(255) | NOT NULL | Track name |
| description | TEXT | | Track description |
| display_order | INTEGER | DEFAULT 0 | Sort order |

### teams
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | Parent event |
| name | VARCHAR(255) | NOT NULL | Team name |
| invite_code | VARCHAR(50) | UNIQUE, NOT NULL, INDEX | Join code |
| max_members | INTEGER | DEFAULT 4 | Team size limit |
| created_by | UUID | FK → users.id | Creator |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

### team_members
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| team_id | UUID | FK → teams.id, CASCADE, INDEX | |
| user_id | UUID | FK → users.id, CASCADE, INDEX | |
| joined_at | TIMESTAMPTZ | DEFAULT NOW() | |
| **UNIQUE** | (team_id, user_id) | | Prevent duplicates |

### projects
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | Parent event |
| team_id | UUID | FK → teams.id, CASCADE, INDEX | Owning team |
| track_id | UUID | FK → tracks.id, SET NULL, INDEX | Category |
| title | VARCHAR(255) | NOT NULL | Project name |
| summary | TEXT | | One-line description |
| description | TEXT | | Full description |
| repo_url | VARCHAR(500) | | Git repository |
| demo_url | VARCHAR(500) | | Live demo |
| video_url | VARCHAR(500) | | Demo video |
| submitted_at | TIMESTAMPTZ | | When submitted (null = draft) |
| is_draft | BOOLEAN | DEFAULT true | Draft vs submitted |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

## Judging Tables (T2)

### judging_criteria
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | Parent event |
| name | VARCHAR(100) | NOT NULL | Criteria name |
| description | TEXT | | Description |
| weight | DECIMAL(5,2) | DEFAULT 1.00 | Percentage weight |
| min_score | INTEGER | DEFAULT 1 | Minimum score |
| max_score | INTEGER | DEFAULT 5 | Maximum score |
| display_order | INTEGER | DEFAULT 0 | Sort order |

### judge_assignments
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | Parent event |
| judge_id | UUID | FK → users.id, CASCADE, INDEX | Assigned judge |
| track_id | UUID | FK → tracks.id, CASCADE, INDEX | Assigned track |
| assigned_by | UUID | FK → users.id | Organizer who assigned |
| assigned_at | TIMESTAMPTZ | DEFAULT NOW() | |
| **UNIQUE** | (judge_id, track_id) | | One assignment per track |

### scores
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | Parent event |
| judge_id | UUID | FK → users.id, CASCADE, INDEX | Scoring judge |
| project_id | UUID | FK → projects.id, CASCADE, INDEX | Scored project |
| criteria_id | UUID | FK → judging_criteria.id, CASCADE, INDEX | Criteria scored |
| score | INTEGER | NOT NULL | 1-5 or custom range |
| comment | TEXT | | Judge feedback |
| submitted_at | TIMESTAMPTZ | DEFAULT NOW() | |
| **UNIQUE** | (judge_id, project_id, criteria_id) | | One score per criteria |

### judge_batches
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | |
| judge_id | UUID | FK → users.id, CASCADE, INDEX | |
| track_id | UUID | FK → tracks.id, CASCADE, INDEX | |
| assignment_id | UUID | FK → judge_assignments.id, CASCADE | |
| started_at | TIMESTAMPTZ | DEFAULT NOW() | Batch started |
| completed_at | TIMESTAMPTZ | | Batch completed |
| is_complete | BOOLEAN | DEFAULT false | All assigned scored |

## Public Voting Tables (T3)

### community_votes
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | |
| project_id | UUID | FK → projects.id, CASCADE, INDEX | |
| voter_email | VARCHAR(255) | NOT NULL | Voter identifier |
| voter_ip | INET | | For abuse detection |
| vote_token | UUID | UNIQUE, DEFAULT gen_random_uuid() | Single-use token |
| score | INTEGER | NOT NULL | Vote value (1-5) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| **UNIQUE** | (event_id, project_id, voter_email) | | One vote per person |

### project_comments
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | |
| project_id | UUID | FK → projects.id, CASCADE, INDEX | |
| user_id | UUID | FK → users.id, SET NULL | Authenticated author |
| author_name | VARCHAR(255) | | Anonymous name |
| author_email | VARCHAR(255) | | Anonymous email |
| content | TEXT | NOT NULL | Comment text |
| is_approved | BOOLEAN | DEFAULT false | Moderation |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

### vote_audit_log
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | |
| project_id | UUID | FK → projects.id, CASCADE, INDEX | |
| action | VARCHAR(50) | NOT NULL | vote_cast/rejected/rate_limited/duplicate |
| voter_ip | INET | | |
| voter_email | VARCHAR(255) | | |
| user_agent | TEXT | | Browser fingerprint |
| details | JSONB | | Additional context |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

## Stretch Tables (T4)

### api_keys
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | |
| name | VARCHAR(255) | NOT NULL | Key name |
| key_hash | VARCHAR(255) | NOT NULL | Hashed key |
| key_prefix | VARCHAR(20) | NOT NULL | First chars for display |
| permissions | JSONB | DEFAULT '[]' | Scope array |
| created_by | UUID | FK → users.id | |
| last_used_at | TIMESTAMPTZ | | Analytics |
| expires_at | TIMESTAMPTZ | | Expiration |

### webhooks
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | |
| url | VARCHAR(500) | NOT NULL | Target URL |
| secret | VARCHAR(255) | NOT NULL | HMAC secret |
| events | JSONB | DEFAULT '[]' | Subscribed events |
| is_active | BOOLEAN | DEFAULT true | Enable/disable |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

### certificates
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | |
| recipient_type | VARCHAR(50) | NOT NULL | participant/judge/organizer |
| recipient_id | UUID | NOT NULL, INDEX | User/project/team ID |
| certificate_type | VARCHAR(50) | NOT NULL | participation/winner/judge_service |
| title | VARCHAR(255) | NOT NULL | Display title |
| description | TEXT | | |
| metadata | JSONB | | Extra data |
| signature | VARCHAR(500) | | Ed25519 signature |
| public_key | VARCHAR(500) | | Verification key |
| issued_at | TIMESTAMPTZ | DEFAULT NOW() | |
| verified_at | TIMESTAMPTZ | | Verification time |

### bulk_jobs
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| event_id | UUID | FK → events.id, CASCADE, INDEX | |
| job_type | VARCHAR(50) | NOT NULL | import/export |
| status | VARCHAR(50) | DEFAULT 'pending' | pending/processing/completed/failed |
| file_path | VARCHAR(500) | | Storage path |
| records_total | INTEGER | DEFAULT 0 | Total records |
| records_processed | INTEGER | DEFAULT 0 | Completed |
| records_failed | INTEGER | DEFAULT 0 | Errors |
| error_log | JSONB | | Error details |
| created_by | UUID | FK → users.id | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| completed_at | TIMESTAMPTZ | | |

### project_embeddings
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| project_id | UUID | PK, FK → projects.id, CASCADE | |
| embedding | VECTOR(1536) | | pgvector embedding |
| content_hash | VARCHAR(64) | | Change detection |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| **INDEX** | ivfflat (embedding vector_cosine_ops) | lists=100 | Similarity search |

## Indexes

### Primary Indexes
- All PKs are indexed automatically

### Foreign Key Indexes
- `users.email` (unique)
- `events.slug` (unique)
- `teams.invite_code` (unique)
- `team_members(team_id, user_id)` (unique)
- `projects(event_id, is_draft)`
- `scores(judge_id, event_id)`
- `judge_assignments(judge_id, track_id)` (unique)
- `community_votes(event_id, project_id, voter_email)` (unique)
- `vote_audit_log(event_id, created_at)`

### Vector Index
```sql
CREATE INDEX ON project_embeddings 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);
```

## Import/Export Formats

### CSV Export (Results)
Columns: Project, Team, Track, [Criteria Scores], Raw Total, Normalized Total, Rank

### JSON Import (Bulk)
```json
{
  "projects": [
    {
      "title": "Project Name",
      "summary": "One line",
      "description": "Full description",
      "repo_url": "https://github.com/...",
      "track": "track_slug",
      "team": "team_name"
    }
  ],
  "teams": [...],
  "judges": [...]
}
```

## Migration Strategy

- **Tool**: Alembic (included in backend)
- **Command**: `alembic revision --autogenerate -m "description"`
- **Apply**: `alembic upgrade head` (runs on container startup)
- **Rollback**: `alembic downgrade -1`

## Seed Data

The `fixtures.json` file (provided by spec) contains:
- 1 event (submissions_close in the past for checker)
- 8 tracks
- 30 judges
- 40 teams
- 41 projects (1 duplicate for testing)
- ~200 scores across multiple criteria

Run seed: `python seed.py` (automatic on `docker compose up`)