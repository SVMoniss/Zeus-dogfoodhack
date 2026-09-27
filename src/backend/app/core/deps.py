from typing import Optional
from fastapi import Depends, HTTPException, status, Request, Cookie
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models import User
from app.models.enums import UserRole


async def get_current_user(
    request: Request,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = session
    
    # Also check Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


def require_role(*allowed_roles: UserRole):
    async def role_checker(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user
    return role_checker


require_participant = require_role(UserRole.PARTICIPANT, UserRole.JUDGE, UserRole.ORGANIZER, UserRole.ADMIN)
require_judge = require_role(UserRole.JUDGE, UserRole.ORGANIZER, UserRole.ADMIN)
require_organizer = require_role(UserRole.ORGANIZER, UserRole.ADMIN)
require_admin = require_role(UserRole.ADMIN)