import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Lead, LeadStatus, Note

router = APIRouter(prefix="/leads", tags=["leads"])

VALID_STATUSES = {s.value for s in LeadStatus}


class GapSignalResponse(BaseModel):
    id: int
    signal_type: str
    is_hard: bool
    description: str

    model_config = {"from_attributes": True}


class NoteResponse(BaseModel):
    content: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class LeadResponse(BaseModel):
    id: int
    run_id: int
    place_id: str
    name: str
    phone: str | None
    address: str | None
    city: str | None
    state: str | None
    email: str | None
    website_url: str | None
    maps_url: str | None
    gap_score: float
    status: str
    gap_signals: list[GapSignalResponse]
    note: NoteResponse | None

    model_config = {"from_attributes": True}


class UpdateStatusRequest(BaseModel):
    status: str


class UpdateNoteRequest(BaseModel):
    content: str


def _lead_options():
    return [selectinload(Lead.gap_signals), selectinload(Lead.note)]


@router.get("/run/{run_id}", response_model=list[LeadResponse])
def get_leads_for_run(run_id: int, db: Session = Depends(get_db)):
    return (
        db.query(Lead)
        .options(*_lead_options())
        .filter(Lead.run_id == run_id)
        .order_by(Lead.gap_score.desc())
        .all()
    )


@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = (
        db.query(Lead)
        .options(*_lead_options())
        .filter(Lead.id == lead_id)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.patch("/{lead_id}/status", response_model=LeadResponse)
def update_lead_status(lead_id: int, body: UpdateStatusRequest, db: Session = Depends(get_db)):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Must be one of: {sorted(VALID_STATUSES)}")
    lead = db.query(Lead).options(*_lead_options()).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead.status = body.status
    db.commit()
    db.refresh(lead)
    return lead


def _upsert_note(lead_id: int, content: str, db: Session) -> Lead:
    """Shared logic for creating or updating a lead's note."""
    lead = db.query(Lead).options(*_lead_options()).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.note:
        lead.note.content = content
    else:
        db.add(Note(lead_id=lead_id, content=content))
    db.commit()
    db.refresh(lead)
    return lead


@router.put("/{lead_id}/note", response_model=LeadResponse)
def upsert_lead_note(lead_id: int, body: UpdateNoteRequest, db: Session = Depends(get_db)):
    return _upsert_note(lead_id, body.content, db)


@router.patch("/{lead_id}/notes", response_model=LeadResponse)
def patch_lead_notes(lead_id: int, body: UpdateNoteRequest, db: Session = Depends(get_db)):
    return _upsert_note(lead_id, body.content, db)


@router.get("/run/{run_id}/export/csv")
def export_leads_csv(run_id: int, db: Session = Depends(get_db)):
    leads = (
        db.query(Lead)
        .options(*_lead_options())
        .filter(Lead.run_id == run_id)
        .order_by(Lead.gap_score.desc())
        .all()
    )

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["name", "address", "city", "state", "phone", "email", "gap_score", "gap_signals", "status", "notes"],
    )
    writer.writeheader()
    for lead in leads:
        signals_str = "; ".join(s.description for s in lead.gap_signals)
        writer.writerow(
            {
                "name": lead.name,
                "address": lead.address or "",
                "city": lead.city or "",
                "state": lead.state or "",
                "phone": lead.phone or "",
                "email": lead.email or "",
                "gap_score": lead.gap_score,
                "gap_signals": signals_str,
                "status": lead.status,
                "notes": lead.note.content if lead.note else "",
            }
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=leads_run_{run_id}.csv"},
    )
