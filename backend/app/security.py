import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .models import ROLES, AuditLog, User

_ITERATIONS = 200_000
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return "pbkdf2$%d$%s$%s" % (
        _ITERATIONS,
        base64.b64encode(salt).decode(),
        base64.b64encode(digest).decode(),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt_b64, digest_b64 = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), base64.b64decode(salt_b64), int(iterations)
    )
    return hmac.compare_digest(digest, base64.b64decode(digest_b64))


def create_token(user: User) -> str:
    payload = {
        "sub": user.username,
        "role": user.role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=config.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "ต้องเข้าสู่ระบบ")
    try:
        payload = jwt.decode(creds.credentials, config.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token ไม่ถูกต้องหรือหมดอายุ")
    user = db.query(User).filter_by(username=payload.get("sub"), is_active=True).first()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "ไม่พบผู้ใช้")
    return user


def require_role(minimum: str):
    """Roles are ordered viewer < engineer < admin."""
    rank = ROLES.index(minimum)

    def checker(user: User = Depends(current_user)) -> User:
        if ROLES.index(user.role) < rank:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "สิทธิ์ไม่เพียงพอ")
        return user

    return checker


def audit(db: Session, user: User | str, action: str, target: str, detail: str = "") -> None:
    username = user if isinstance(user, str) else user.username
    db.add(AuditLog(username=username, action=action, target=target, detail=detail))
