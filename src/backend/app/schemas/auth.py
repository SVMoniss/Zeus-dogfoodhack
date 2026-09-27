from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.models.enums import UserRole
import re


def validate_email(value: str) -> str:
    """Custom email validator that allows local domains like dogfood.local"""
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', value):
        raise ValueError('Invalid email format')
    return value


class UserRegister(BaseModel):
    email: str = Field(..., pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: str = Field(..., pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    role: UserRole
    created_at: datetime

    class Config:
        from_attributes = True


class UserMe(UserResponse):
    pass