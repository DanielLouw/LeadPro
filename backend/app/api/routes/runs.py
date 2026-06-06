import csv
import io

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.lead_pipeline.pipeline import execute_run
from app.models import Lead, Run

router = APIRouter(prefix="/runs", tags=["runs"])


class CreateRunRequest(BaseModel):
    config_yaml: str


class RunResponse(BaseModel):
    id: int
    status: str
    total_leads: int
    error_message: str | None
    config_yaml: str

    model_config = {"from_attributes": True}


@router.post("/", response_model=RunResponse, status_code=201)
async def create_run(body: CreateRunRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    run = Run(config_yaml=body.config_yaml, status="pending", total_leads=0)
    db.add(run)
    db.commit()
    db.refresh(run)

    background_tasks.add_task(_run_pipeline, run.id)
    return run


@router.get("/", response_model=list[RunResponse])
def list_runs(db: Session = Depends(get_db)):
    return db.query(Run).order_by(Run.created_at.desc()).all()


@router.get("/{run_id}", response_model=RunResponse)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/{run_id}/leads/export")
def export_leads_csv(
    run_id: int,
    status: str | None = Query(default=None),
    min_gap_score: float | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Export the lead list for a run as a CSV file download.

    Accepts optional query parameters to filter the results:
    - ``status``: only include leads with this status value
    - ``min_gap_score``: only include leads with gap_score >= this value
    """
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    query = (
        db.query(Lead)
        .options(selectinload(Lead.gap_signals), selectinload(Lead.note))
        .filter(Lead.run_id == run_id)
    )
    if status is not None:
        query = query.filter(Lead.status == status)
    if min_gap_score is not None:
        query = query.filter(Lead.gap_score >= min_gap_score)

    leads = query.order_by(Lead.gap_score.desc()).all()

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["name", "address", "phone", "email", "gap_score", "gap_signals", "status", "notes"],
    )
    writer.writeheader()
    for lead in leads:
        signals_str = ", ".join(s.description for s in lead.gap_signals)
        writer.writerow(
            {
                "name": lead.name,
                "address": lead.address or "",
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


async def _run_pipeline(run_id: int) -> None:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        await execute_run(run_id, db)
    finally:
        db.close()
