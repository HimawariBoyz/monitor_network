from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AuditLog, User
from ..security import require_role
from ..serializers import user_out

router = APIRouter(tags=["admin"])


@router.get("/audit-logs")
def audit_logs(limit: int = Query(200, le=1000), db: Session = Depends(get_db),
               _: User = Depends(require_role("admin"))):
    rows = db.query(AuditLog).order_by(AuditLog.at.desc()).limit(limit)
    return [{"id": a.id, "at": a.at, "username": a.username, "action": a.action,
             "target": a.target, "detail": a.detail} for a in rows]


@router.get("/users")
def users(db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    return [user_out(u) for u in db.query(User).order_by(User.id)]
