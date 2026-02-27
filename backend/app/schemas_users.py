"""User profile request/response schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class OrganizationInfo(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class UserProfileResponse(BaseModel):
    id: int
    email: str
    full_name: str | None
    is_verified: bool
    created_at: datetime | None
    organization: OrganizationInfo | None

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None
