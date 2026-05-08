"""JWT authentication for the Rule Engine.

Tokens are issued by the Incident Service and verified here using the
same SECRET_KEY.  This module only decodes — it never issues tokens or
manages users.
"""
from __future__ import annotations

import os
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

_SECRET_KEY: str = os.environ.get("SECRET_KEY", "change-me-in-production-use-a-long-random-string")
_ALGORITHM = "HS256"

_bearer = HTTPBearer(auto_error=False)


class UserInfo(BaseModel):
    username: str
    role: str


def _decode_token(token: str) -> UserInfo:
    try:
        payload = jwt.decode(token, _SECRET_KEY, algorithms=[_ALGORITHM])
        return UserInfo(username=payload["sub"], role=payload["role"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> UserInfo:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _decode_token(credentials.credentials)


CurrentUser = Annotated[UserInfo, Depends(get_current_user)]
