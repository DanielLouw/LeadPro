import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from jose import jwt
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30


class LoginRequest(BaseModel):
    password: str


def create_access_token() -> str:
    exp = datetime.now(tz=timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": "user", "exp": exp}, settings.AUTH_SECRET, algorithm=ALGORITHM)


@router.post("/login")
def login(body: LoginRequest) -> dict:
    if not secrets.compare_digest(body.password, settings.AUTH_PASSWORD):
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"access_token": create_access_token()}
