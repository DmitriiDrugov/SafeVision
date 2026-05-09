"""JWT authentication for the Incident Service.

Users are defined via the AUTH_USERS environment variable:
    AUTH_USERS="username:password:role,..."

    Roles: operator | supervisor | admin

SECRET_KEY must be set to a long random string in production.
Tokens expire after JWT_EXPIRE_HOURS hours (default 24).
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

_SECRET_KEY: str = os.environ.get("SECRET_KEY", "change-me-in-production-use-a-long-random-string")
_ALGORITHM = "HS256"
_TOKEN_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "24"))

_bearer = HTTPBearer(auto_error=False)


class UserInfo(BaseModel):
    username: str
    role: str


def _hash_password(password: str) -> bytes:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt())


def _verify_password(password: str, hashed: bytes) -> bool:
    return bcrypt.checkpw(password.encode(), hashed)


def _load_users() -> dict[str, tuple[bytes, str]]:
    """Return {username: (bcrypt_hash, role)} from AUTH_USERS env var."""
    raw = os.environ.get("AUTH_USERS", "admin:changeme:admin")
    users: dict[str, tuple[bytes, str]] = {}
    for entry in raw.split(","):
        parts = entry.strip().split(":", 2)
        if len(parts) == 3:
            username, password, role = parts
            users[username.strip()] = (
                _hash_password(password.strip()),
                role.strip(),
            )
    return users


_USERS: dict[str, tuple[bytes, str]] = _load_users()


def authenticate_user(username: str, password: str) -> UserInfo | None:
    entry = _USERS.get(username)
    if entry is None:
        return None
    hashed, role = entry
    if not _verify_password(password, hashed):
        return None
    return UserInfo(username=username, role=role)


def create_token(user: UserInfo) -> str:
    payload = {
        "sub": user.username,
        "role": user.role,
        "exp": datetime.now(tz=timezone.utc) + timedelta(hours=_TOKEN_EXPIRE_HOURS),
        "iat": datetime.now(tz=timezone.utc),
    }
    return jwt.encode(payload, _SECRET_KEY, algorithm=_ALGORITHM)


def _decode_token(token: str) -> UserInfo:
    try:
        payload = jwt.decode(token, _SECRET_KEY, algorithms=[_ALGORITHM])
        return UserInfo(username=payload["sub"], role=payload["role"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )


async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(_bearer)
    ],
) -> UserInfo:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _decode_token(credentials.credentials)


CurrentUser = Annotated[UserInfo, Depends(get_current_user)]
