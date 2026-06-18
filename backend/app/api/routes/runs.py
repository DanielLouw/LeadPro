import csv
import io
from datetime import date

import yaml
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from app.budget import estimate_run_cost as _estimate_cost, get_monthly_spend
from app.config import (
    DEFAULT_MAX_RESULTS_PER_RUN,
    PLACES_RESULTS_PER_REQUEST,
)
from app.data.counties import COUNTIES
from app.database import get_db
from app.lead_pipeline.adapters import ADAPTER_REGISTRY
from app.lead_pipeline.pipeline import execute_run
from app.models import Lead, Run, SearchSlot, Settings

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


class RunEstimateResponse(BaseModel):
    query_count: int
    estimated_results: int
    estimated_cost_usd: float


class RunProgressResponse(BaseModel):
    status: str
    queries_completed: int
    queries_total: int
    leads_found: int

    model_config = {"from_attributes": True}


class SpendGroupResponse(BaseModel):
    spent_usd: float
    budget_usd: float
    remaining_usd: float


class MonthlySpendResponse(BaseModel):
    google_places: SpendGroupResponse
    apify: SpendGroupResponse


class CountyCoverageResponse(BaseModel):
    total_counties: int
    searched_counties: int


@router.get("/county-coverage", response_model=CountyCoverageResponse)
def get_county_coverage(
    state: str = Query(..., min_length=2, max_length=2),
    industry: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> CountyCoverageResponse:
    state = state.upper()
    total = len(COUNTIES.get(state, []))
    q = (
        db.query(SearchSlot.county)
        .filter(SearchSlot.state == state, SearchSlot.search_count > 0)
    )
    if industry is not None:
        q = q.filter(SearchSlot.industry == industry)
    searched = q.distinct().count()
    return CountyCoverageResponse(total_counties=total, searched_counties=searched)


@router.get("/monthly-spend", response_model=MonthlySpendResponse)
def get_monthly_spend_summary(db: Session = Depends(get_db)) -> MonthlySpendResponse:
    """Return current calendar month spend and remaining budget for each source group."""
    settings = db.query(Settings).first()
    if settings is None:
        raise HTTPException(status_code=404, detail="Settings not found")

    today = date.today()

    gp_spent = get_monthly_spend(db, "google_places", today)
    gp_budget = settings.google_places_monthly_budget_usd

    apify_spent = get_monthly_spend(db, "apify", today)
    apify_budget = settings.apify_monthly_budget_usd

    return MonthlySpendResponse(
        google_places=SpendGroupResponse(
            spent_usd=gp_spent,
            budget_usd=gp_budget,
            remaining_usd=gp_budget - gp_spent,
        ),
        apify=SpendGroupResponse(
            spent_usd=apify_spent,
            budget_usd=apify_budget,
            remaining_usd=apify_budget - apify_spent,
        ),
    )


@router.post("/estimate", response_model=RunEstimateResponse)
def get_run_estimate(body: CreateRunRequest) -> RunEstimateResponse:
    """Return a cost estimate for a run without executing it."""
    try:
        config = yaml.safe_load(body.config_yaml)
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {exc}") from exc

    if not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="Config must be a YAML mapping")

    source: str = config.get("source", "google_places")
    max_results: int = config.get("max_results_per_run", DEFAULT_MAX_RESULTS_PER_RUN)

    if source == "google_places":
        source_config: dict = config.get("source_config") or {}
        is_cycling = "industry" in source_config or "state" in source_config

        if is_cycling:
            industry = source_config.get("industry")
            state = source_config.get("state")
            if not industry:
                raise HTTPException(status_code=400, detail="Cycling config must include a non-empty 'industry'")
            if not state:
                raise HTTPException(status_code=400, detail="Cycling config must include a non-empty 'state'")
            slots_per_run: int = source_config.get("slots_per_run", 3)
            if not isinstance(slots_per_run, int) or slots_per_run < 1:
                raise HTTPException(status_code=400, detail="'slots_per_run' must be a positive integer")
            query_count = slots_per_run
            estimated_results = slots_per_run * max_results
        else:
            queries = source_config.get("queries") or config.get("queries", [])
            if not isinstance(queries, list) or not queries:
                raise HTTPException(status_code=400, detail="Config must include at least one query")
            query_count = len(queries)
            # Each query yields at most one page of results, capped by max_results_per_run.
            estimated_results = min(query_count * PLACES_RESULTS_PER_REQUEST, max_results)
    else:
        query_count = 1
        estimated_results = max_results

    estimated_cost_usd = _estimate_cost(source, estimated_results)

    return RunEstimateResponse(
        query_count=query_count,
        estimated_results=estimated_results,
        estimated_cost_usd=estimated_cost_usd,
    )


@router.post("/", response_model=RunResponse, status_code=201)
async def create_run(body: CreateRunRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        config = yaml.safe_load(body.config_yaml)
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {exc}") from exc
    if not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="Config must be a YAML mapping")

    source: str = config.get("source", "google_places")
    if source not in ADAPTER_REGISTRY:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown source '{source}'. Must be one of: {sorted(ADAPTER_REGISTRY)}",
        )
    run = Run(config_yaml=body.config_yaml, status="pending", total_leads=0, source=source)
    db.add(run)
    db.commit()
    db.refresh(run)

    background_tasks.add_task(_run_pipeline, run.id)
    return run


@router.get("/", response_model=list[RunResponse])
def list_runs(db: Session = Depends(get_db)):
    return db.query(Run).order_by(Run.created_at.desc()).all()


@router.get("/{run_id}/progress", response_model=RunProgressResponse)
def get_run_progress(run_id: int, db: Session = Depends(get_db)):
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunProgressResponse(
        status=run.status,
        queries_completed=run.queries_completed,
        queries_total=run.queries_total,
        leads_found=run.total_leads,
    )


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
