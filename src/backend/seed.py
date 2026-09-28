#!/usr/bin/env python3
"""Seed script for DOGFOOD 2026 - loads fixtures.json and creates test users."""

import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from passlib.context import CryptContext

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.core.config import settings
from app.core.database import Base
from app.models import (
    User, Event, Track, Team, TeamMember, Project,
    JudgingCriteria, JudgeAssignment, Score, JudgeBatch,
)
from app.models.enums import UserRole
from app.core.security import create_access_token

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Fixed tokens for DOGFOOD checker - these must match .dogfood.toml
FIXED_TOKENS = {
    "organizer": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoib3JnYW5pemVyIn0.FCyT9q74wMT0sDnAb1myVS6avfTN7xz_Uq_wMPucJ-Q",
    "judge_a": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDIiLCJyb2xlIjoianVkZ2VfYSJ9.nktXSu9YKPdDU4nVV8ruMLyQg7skqJp0Oi3hQXOtHts",
    "judge_b": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDMiLCJyb2xlIjoianVkZ2VfYiJ9.TXESY5s_0440V6xgcNejSSaS00-PXkmouGLg5KNoMFk",
    "participant": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDQiLCJyb2xlIjoicGFydGljaXBhbnQifQ.U-xspw4Ap3lruhb5nL253Gb9MAyDSjTdWOcSViTipYY",
}

# Fixed user IDs to match the token subjects - must be valid UUIDs
FIXED_USER_IDS = {
    "organizer": "00000000-0000-0000-0000-000000000001",
    "judge_a": "00000000-0000-0000-0000-000000000002",
    "judge_b": "00000000-0000-0000-0000-000000000003",
    "participant": "00000000-0000-0000-0000-000000000004",
}


async def get_or_create(model, db, **kwargs):
    """Get existing record or create new one."""
    pk_columns = [c.name for c in model.__table__.primary_key.columns]
    filters = {k: v for k, v in kwargs.items() if k in pk_columns}
    
    if not filters:
        filters = kwargs
    
    result = await db.execute(select(model).filter_by(**filters))
    instance = result.scalar_one_or_none()
    
    if instance:
        return instance, False
    
    instance = model(**kwargs)
    db.add(instance)
    return instance, True


async def seed():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with AsyncSessionLocal() as db:
        # Load fixtures
        fixtures_path = os.getenv("FIXTURES_PATH", "fixtures.json")
        if not os.path.exists(fixtures_path):
            print(f"Fixtures file not found at {fixtures_path}")
            return
        
        with open(fixtures_path, "r") as f:
            fixtures = json.load(f)
        
        print("Loading fixtures...")
        
        # Create test users with FIXED tokens for checker
        test_users = {
            "organizer": {
                "id": uuid.UUID(FIXED_USER_IDS["organizer"]),
                "email": "organizer@dogfood.local",
                "password": "testpass123",
                "full_name": "Test Organizer",
                "role": UserRole.ORGANIZER,
            },
            "judge_a": {
                "id": uuid.UUID(FIXED_USER_IDS["judge_a"]),
                "email": "judge_a@dogfood.local",
                "password": "testpass123",
                "full_name": "Test Judge A",
                "role": UserRole.JUDGE,
            },
            "judge_b": {
                "id": uuid.UUID(FIXED_USER_IDS["judge_b"]),
                "email": "judge_b@dogfood.local",
                "password": "testpass123",
                "full_name": "Test Judge B",
                "role": UserRole.JUDGE,
            },
            "participant": {
                "id": uuid.UUID(FIXED_USER_IDS["participant"]),
                "email": "participant@dogfood.local",
                "password": "testpass123",
                "full_name": "Test Participant",
                "role": UserRole.PARTICIPANT,
            },
        }
        
        user_map = {}
        for key, data in test_users.items():
            existing = await db.execute(select(User).where(User.email == data["email"]))
            existing_user = existing.scalar_one_or_none()
            if existing_user:
                # Update in place: NEVER delete test users. Scores, judge
                # assignments and certificates FK-reference them, and deleting
                # nullifies those FKs, crashing the seed on NOT NULL constraints.
                existing_user.password_hash = pwd_context.hash(data["password"])
                existing_user.full_name = data["full_name"]
                existing_user.role = data["role"]
                if str(existing_user.id) != str(data["id"]):
                    print(f"  WARNING: {data['email']} has id {existing_user.id}, expected {data['id']} - .dogfood.toml tokens may mismatch")
                user_map[key] = existing_user
                print(f"  Updated user: {data['email']} (role: {data['role'].value})")
            else:
                user = User(
                    id=data["id"],
                    email=data["email"],
                    password_hash=pwd_context.hash(data["password"]),
                    full_name=data["full_name"],
                    role=data["role"],
                )
                db.add(user)
                user_map[key] = user
                print(f"  Created user: {data['email']} (role: {data['role'].value})")
        
        await db.commit()
        
        # Print FIXED tokens for .dogfood.toml (these must match FIXED_TOKENS above)
        print("\n" + "="*60)
        print("TEST LOGINS (for .dogfood.toml):")
        print("="*60)
        for key in ["organizer", "judge_a", "judge_b", "participant"]:
            token = FIXED_TOKENS[key]
            print(f'  {key}: Cookie: session={token}')
        print("="*60)
        
        # Load event
        event_data = fixtures.get("event", {})
        event_id_str = event_data.get("id", str(uuid.uuid4()))
        try:
            event_id = uuid.UUID(event_id_str)
        except ValueError:
            event_id = uuid.uuid5(uuid.NAMESPACE_DNS, event_id_str)
        
        event, created = await get_or_create(Event, db, id=event_id)
        if created:
            event.name = event_data.get("name", "Sample Hack 2026")
            event.slug = event_data.get("slug", "sample-hack-2026")
            event.submissions_open_at = datetime.fromisoformat(event_data.get("submissions_open", "2026-02-01T00:00:00Z").replace("Z", "+00:00"))
            event.submissions_close_at = datetime.fromisoformat(event_data.get("submissions_close", "2026-03-01T18:00:00Z").replace("Z", "+00:00"))
            event.voting_open_at = datetime.fromisoformat(event_data.get("voting_open", "2026-03-02T00:00:00Z").replace("Z", "+00:00")) if event_data.get("voting_open") else None
            event.voting_close_at = datetime.fromisoformat(event_data.get("voting_close", "2026-03-15T18:00:00Z").replace("Z", "+00:00")) if event_data.get("voting_close") else None
            event.results_published_at = datetime.fromisoformat(event_data.get("results_published", "2026-03-20T18:00:00Z").replace("Z", "+00:00")) if event_data.get("results_published") else None
            event.is_active = True
            event.created_by = user_map["organizer"].id
            print("Created event")
        else:
            # Backfill columns added after the event row was first created
            if event.created_by is None:
                event.created_by = user_map["organizer"].id
            if getattr(event, "prizes", None) is None:
                event.prizes = []
            print("Event already exists")
        
        await db.flush()
        
        # Load tracks
        track_map = {}
        for track_data in fixtures.get("tracks", []):
            track_id_str = track_data["id"]
            try:
                track_id = uuid.UUID(track_id_str)
            except ValueError:
                track_id = uuid.uuid5(uuid.NAMESPACE_DNS, track_id_str)
            
            track, created = await get_or_create(Track, db, id=track_id)
            if created:
                track.event_id = event.id
                track.name = track_data["name"]
                track.description = track_data.get("description", "")
                track.display_order = track_data.get("display_order", 0)
                track.event_id = event.id
            track_map[track_data["id"]] = track
        
        await db.commit()
        
        # Load judges from fixtures
        judge_map = {}
        for judge_data in fixtures.get("judges", []):
            judge_id_str = judge_data["id"]
            try:
                judge_id = uuid.UUID(judge_id_str)
            except ValueError:
                judge_id = uuid.uuid5(uuid.NAMESPACE_DNS, judge_id_str)
            
            judge_user, created = await get_or_create(User, db, id=judge_id)
            if created:
                judge_user.email = judge_data["email"]
                judge_user.password_hash = pwd_context.hash("judgepass123")
                judge_user.full_name = judge_data["name"]
                judge_user.role = UserRole.JUDGE
            judge_map[judge_data["id"]] = judge_user
        
        await db.commit()
        
        # Load teams
        team_map = {}
        for team_data in fixtures.get("teams", []):
            team_id_str = team_data["id"]
            try:
                team_id = uuid.UUID(team_id_str)
            except ValueError:
                team_id = uuid.uuid5(uuid.NAMESPACE_DNS, team_id_str)
            
            team, created = await get_or_create(Team, db, id=team_id)
            if created:
                team.event_id = event.id
                team.name = team_data["name"]
                team.invite_code = uuid.uuid4().hex[:8].upper()
                team.max_members = 4
                team.created_by = user_map["organizer"].id
            elif team.created_by is None:
                # Backfill rows created before created_by was populated
                team.created_by = user_map["organizer"].id
            
            team_map[team_data["id"]] = team
            
            # Add members
            for member_email in team_data.get("members", []):
                result = await db.execute(select(User).where(User.email == member_email))
                member = result.scalar_one_or_none()
                if not member:
                    member = User(
                        email=member_email,
                        password_hash=pwd_context.hash("memberpass123"),
                        full_name=member_email.split("@")[0],
                        role=UserRole.PARTICIPANT,
                    )
                    db.add(member)
                    await db.flush()
                team_member, _ = await get_or_create(TeamMember, db, team_id=team.id, user_id=member.id)
        
        await db.commit()
        
        # Load projects
        project_map = {}
        for proj_data in fixtures.get("projects", []):
            project_id_str = proj_data["id"]
            try:
                project_id = uuid.UUID(project_id_str)
            except ValueError:
                project_id = uuid.uuid5(uuid.NAMESPACE_DNS, project_id_str)
            
            team_id_str = proj_data["team"]
            try:
                team_id = uuid.UUID(team_id_str)
            except ValueError:
                team_id = uuid.uuid5(uuid.NAMESPACE_DNS, team_id_str)
            
            track_id_str = proj_data["track"]
            try:
                track_id = uuid.UUID(track_id_str)
            except ValueError:
                track_id = uuid.uuid5(uuid.NAMESPACE_DNS, track_id_str)
            
            project, created = await get_or_create(Project, db, id=project_id)
            if created:
                project.event_id = event.id
                project.team_id = team_id
                project.track_id = track_id
                project.title = proj_data["title"]
                project.summary = proj_data.get("summary", "")
                project.description = proj_data.get("description", "")
                project.repo_url = proj_data.get("repo_url", "")
                project.demo_url = proj_data.get("demo_url", "")
                project.video_url = proj_data.get("video_url", "")
                project.submitted_at = datetime.fromisoformat(proj_data["submitted_at"].replace("Z", "+00:00")) if proj_data.get("submitted_at") else None
                project.is_draft = False
            project_map[proj_data["id"]] = project
        
        await db.commit()
        
        # Create default judging criteria
        criteria_list = [
            {"name": "Functionality", "description": "Does it work?", "weight": 40, "min_score": 1, "max_score": 5, "display_order": 1},
            {"name": "Quality", "description": "Code quality and design", "weight": 30, "min_score": 1, "max_score": 5, "display_order": 2},
            {"name": "Innovation", "description": "Novelty and creativity", "weight": 30, "min_score": 1, "max_score": 5, "display_order": 3},
        ]
        
        criteria_map = {}
        for i, c in enumerate(criteria_list):
            criteria, created = await get_or_create(
                JudgingCriteria, db, event_id=event.id, name=c["name"]
            )
            if created:
                criteria.description = c["description"]
                criteria.weight = Decimal(str(c["weight"]))
                criteria.min_score = c["min_score"]
                criteria.max_score = c["max_score"]
                criteria.display_order = c["display_order"]
            criteria_map[c["name"]] = criteria
        
        await db.commit()
        
        # Load scores from fixtures
        for score_data in fixtures.get("scores", []):
            criteria_name = "Functionality"  # Default
            criteria = criteria_map.get(criteria_name)
            if criteria:
                judge_id_str = score_data["judge"]
                try:
                    judge_id = uuid.UUID(judge_id_str)
                except ValueError:
                    judge_id = uuid.uuid5(uuid.NAMESPACE_DNS, judge_id_str)
                
                project_id_str = score_data["project"]
                try:
                    project_id = uuid.UUID(project_id_str)
                except ValueError:
                    project_id = uuid.uuid5(uuid.NAMESPACE_DNS, project_id_str)
                
                score, created = await get_or_create(
                    Score, db,
                    event_id=event.id,
                    judge_id=judge_id,
                    project_id=project_id,
                    criteria_id=criteria.id
                )
                if created:
                    score.score = score_data.get("criteria", {}).get("functionality", 3)
                    score.comment = score_data.get("comment", "")
        
        await db.commit()
        print("Seeding complete!")

        # Persistent open demo event (see gaps register #8): the fixture
        # event above must stay CLOSED for the checker, so live create/submit
        # demos use this always-open event. Windows are relative to seed time
        # and refreshed on every boot so the demo never goes stale.
        # Idempotent: stable uuid5 ids, never touches the fixture event.
        now = datetime.now(event.submissions_open_at.tzinfo)
        demo_id = uuid.uuid5(uuid.NAMESPACE_DNS, "demo-open-event")
        demo, demo_created = await get_or_create(Event, db, id=demo_id)
        if demo_created:
            demo.name = "Open Demo Day"
            demo.slug = "demo-open"
            demo.description = "Always-open demo event for live create/submit walkthroughs."
            demo.submissions_open_at = now - timedelta(days=1)
            demo.submissions_close_at = now + timedelta(days=30)
            demo.voting_open_at = None
            demo.voting_close_at = None
            demo.results_published_at = None
            demo.is_active = True
            demo.created_by = user_map["organizer"].id
            if getattr(demo, "prizes", None) is None:
                demo.prizes = []
            print("Created open demo event (demo-open)")
        else:
            # Refresh a stale window so the demo stays usable across reseeds.
            if demo.submissions_close_at < now:
                demo.submissions_open_at = now - timedelta(days=1)
                demo.submissions_close_at = now + timedelta(days=30)
                print("Refreshed open demo event window (demo-open)")
            else:
                print("Open demo event already exists (demo-open)")

        await db.flush()

        demo_tracks = [
            {"name": "General", "description": "Anything goes", "display_order": 1},
            {"name": "Web", "description": "Web apps and sites", "display_order": 2},
            {"name": "Data & AI", "description": "Data pipelines and models", "display_order": 3},
        ]
        for t in demo_tracks:
            tid = uuid.uuid5(uuid.NAMESPACE_DNS, f"demo-open-track-{t['name']}")
            track, t_created = await get_or_create(Track, db, id=tid)
            if t_created:
                track.event_id = demo.id
                track.name = t["name"]
                track.description = t["description"]
                track.display_order = t["display_order"]

        for i, c in enumerate(criteria_list):
            crit, c_created = await get_or_create(
                JudgingCriteria, db, event_id=demo.id, name=c["name"]
            )
            if c_created:
                crit.description = c["description"]
                crit.weight = Decimal(str(c["weight"]))
                crit.min_score = c["min_score"]
                crit.max_score = c["max_score"]
                crit.display_order = c["display_order"]

        await db.commit()

        # Print summary
        print(f"\nEvent: {event.name} ({event.slug})")
        print(f"  Tracks: {len(track_map)}")
        print(f"  Judges: {len(judge_map)}")
        print(f"  Teams: {len(team_map)}")
        print(f"  Projects: {len(project_map)}")
        print(f"  Criteria: {len(criteria_list)}")


if __name__ == "__main__":
    asyncio.run(seed())