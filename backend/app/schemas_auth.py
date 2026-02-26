"""Auth request/response schemas."""
from pydantic import BaseModel, EmailStr, field_validator
import re


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    organization_name: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Passwort muss mindestens 8 Zeichen lang sein")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Passwort muss mindestens einen Grossbuchstaben enthalten")
        if not re.search(r"[0-9]", v):
            raise ValueError("Passwort muss mindestens eine Zahl enthalten")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None

    class Config:
        from_attributes = True


class OrganizationResponse(BaseModel):
    id: int
    name: str
    slug: str
    plan: str

    class Config:
        from_attributes = True


class RegisterResponse(BaseModel):
    user: UserResponse
    organization: OrganizationResponse
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: int
    email: str
    full_name: str | None
    organization: OrganizationResponse
    role: str
