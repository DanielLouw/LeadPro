"""
Settings API routes (issue #0021).

GET  /settings  — returns the single settings row
PATCH /settings — updates one or both budget fields (positive floats only)
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Settings

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsResponse(BaseModel):
    google_places_monthly_budget_usd: float
    apify_monthly_budget_usd: float

    model_config = {"from_attributes": True}


class SettingsPatchRequest(BaseModel):
    google_places_monthly_budget_usd: float | None = None
    apify_monthly_budget_usd: float | None = None

    @field_validator("google_places_monthly_budget_usd", "apify_monthly_budget_usd", mode="before")
    @classmethod
    def must_be_positive(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("Budget must be a positive value")
        return v


def _get_settings_row(db: Session) -> Settings:
    row = db.query(Settings).first()
    if row is None:
        raise HTTPException(status_code=500, detail="Settings row not found")
    return row


@router.get("", response_model=SettingsResponse)
def get_settings(db: Session = Depends(get_db)) -> SettingsResponse:
    """Return the current budget settings."""
    return _get_settings_row(db)


@router.patch("", response_model=SettingsResponse)
def patch_settings(body: SettingsPatchRequest, db: Session = Depends(get_db)) -> SettingsResponse:
    """Partially update budget settings. Only provided fields are updated."""
    row = _get_settings_row(db)
    if body.google_places_monthly_budget_usd is not None:
        row.google_places_monthly_budget_usd = body.google_places_monthly_budget_usd
    if body.apify_monthly_budget_usd is not None:
        row.apify_monthly_budget_usd = body.apify_monthly_budget_usd
    db.commit()
    db.refresh(row)
    return row
