# Architecture Documentation

## System Overview

DOGFOOD 2026 is a self-hostable hackathon submission and judging platform built with a modern, decoupled architecture.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Docker Compose                                │
├─────────────────┬─────────────────────┬─────────────────────────────┤
│   PostgreSQL    │     FastAPI         │      Next.js 14             │
│   + pgvector    │     Backend         │      Frontend               │
│   (Port 5432)   │     (Port 8000)     │      (Port 3000)            │
└─────────────────┴─────────────────────┴─────────────────────────────┘
```

## Service Boundaries

### PostgreSQL (Database Layer)
- **Role**: Single source of truth, persistence, vector search
- **Technology**: PostgreSQL 16 with pgvector extension
- **Key Features**:
  - ACID transactions for data integrity
  - pgvector for semantic search embeddings
  - JSONB for flexible metadata
  - Row-level security ready for multi-tenancy

### FastAPI Backend (API Layer)
- **Role**: Business logic, authentication, API endpoints
- **Technology**: FastAPI with async SQLAlchemy 2.0
- **Key Features**:
  - Async request handling for high concurrency
  - Automatic OpenAPI/Swagger documentation
  - Pydantic validation for request/response
  - Dependency injection for clean separation
  - JWT authentication with httpOnly cookies

### Next.js Frontend (Presentation Layer)
- **Role**: User interface, state management, API consumption
- **Technology**: Next.js 14 App Router, React 18, TypeScript, Tailwind CSS
- **Key Features**:
  - Server-side rendering for SEO and performance
  - React Server Components where applicable
  - Client-side state with Zustand
  - Type-safe API calls with generated types

## Data Flow

### Authentication Flow
```
User → Frontend (login form) → Backend (/api/auth/login)
                                    ↓
                            Verify credentials
                                    ↓
                            Create JWT tokens
                                    ↓
                            Set httpOnly cookie
                                    ↓
                            Return user profile
                                    ↓
                            Frontend stores user in context
```

### Project Submission Flow
```
Participant → Frontend (project form) → Backend (POST /api/events/{id}/projects)
                                                ↓
                                        Validate deadline (server-side)
                                                ↓
                                        Check team membership
                                                ↓
                                        Create project (draft)
                                                ↓
                                        Return project data
                                                ↓
                                        Frontend shows success
```

### Judging Flow
```
Judge → Frontend (score form) → Backend (POST /api/judge/scores/{project_id})
                                        ↓
                                Verify judge assignment
                                        ↓
                                Validate criteria & score range
                                        ↓
                                Upsert scores
                                        ↓
                                Return updated scores
                                        ↓
                                Frontend updates UI
```

### Checker Verification Flow
```
run.py → .dogfood.toml (config) → Portal (base_url)
                                    ↓
                            Make HTTP requests with auth headers
                                    ↓
                            Verify responses match expectations
                                    ↓
                            Print PASS/FAIL report
```

## Security Model

### Authentication
- **JWT Tokens**: Short-lived access tokens (30 min), long-lived refresh tokens (7 days)
- **httpOnly Cookies**: Prevents XSS token theft
- **CSRF Protection**: SameSite=Lax cookies, Origin validation
- **Password Hashing**: bcrypt with cost factor 12

### Authorization
- **Role-Based Access Control**: visitor < participant < judge < organizer < admin
- **Backend Enforcement**: All authorization checks in API layer, never just frontend
- **Judge Isolation**: Critical middleware ensures judges only see their own scores

### Data Protection
- **SQL Injection Prevention**: Parameterized queries via SQLAlchemy ORM
- **Input Validation**: Pydantic schemas on all endpoints
- **Rate Limiting**: On auth endpoints and voting (planned)

## Scalability Considerations

### Horizontal Scaling
- **Stateless Backend**: Multiple FastAPI workers behind load balancer
- **Database**: Read replicas for query-heavy operations (gallery, results)
- **Caching**: Redis for session data and frequently accessed data (planned)

### Performance
- **Async I/O**: FastAPI + asyncpg for non-blocking database operations
- **Connection Pooling**: SQLAlchemy async pool (default 5-10 connections)
- **Pagination**: All list endpoints support pagination (default 20, max 100)
- **Indexes**: Database indexes on foreign keys and frequently queried columns

## Deployment Architecture

### Development
```
docker compose up
├── postgres (pgvector/pgvector:pg16)
├── backend (FastAPI + seed + uvicorn --reload)
└── frontend (Next.js dev server)
```

### Production (Planned)
```
Load Balancer
├── Frontend (Next.js static export + CDN)
├── Backend (FastAPI + Gunicorn + Uvicorn workers x N)
└── Database (PostgreSQL primary + read replicas)
    ├── pgvector for semantic search
    └── Automated backups
```

## Technology Choices Rationale

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Backend Framework | FastAPI | Async, type-safe, auto OpenAPI, great DX |
| Frontend Framework | Next.js 14 | SSR, React ecosystem, App Router, TypeScript |
| Database | PostgreSQL + pgvector | Single DB, ACID, vector search, offline-capable |
| ORM | SQLAlchemy 2.0 | Async, mature, flexible, type-safe |
| Auth | JWT + httpOnly cookies | Checker compatible, secure, stateless |
| Styling | Tailwind CSS | Utility-first, small bundle, responsive |
| State Management | Zustand | Lightweight, TypeScript-friendly |
| Containerization | Docker Compose | Single command, offline, reproducible |

## Multi-Tenancy Ready

The schema includes `event_id` on all major tables, enabling:
- Multiple hackathons in single deployment
- Event-level data isolation
- Per-event configuration (tracks, criteria, dates)
- Shared user base across events