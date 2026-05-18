"""Authentication endpoints for the Incident Service."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from incident import ratelimit
from incident.auth import CurrentUser, UserInfo, authenticate_user, create_token

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str


@router.post("/login", response_model=TokenResponse)
def login(body: LoginBody) -> TokenResponse:
    if not ratelimit.is_allowed(body.username):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again later.",
            headers={"Retry-After": "60"},
        )
    user = authenticate_user(body.username, body.password)
    if user is None:
        ratelimit.record_failure(body.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    ratelimit.reset(body.username)
    token = create_token(user)
    return TokenResponse(
        access_token=token,
        username=user.username,
        role=user.role,
    )


@router.get("/me", response_model=UserInfo)
def me(user: CurrentUser) -> UserInfo:
    return user
