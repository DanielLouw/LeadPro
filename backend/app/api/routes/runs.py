import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.lead_pipeline.pipeline import execute_run
from app.models import Run

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


async def _run_pipeline(run_id: int) -> None:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        await execute_run(run_id, db)
    finally:
        db.close()
