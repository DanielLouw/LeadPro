"""
API tests for Gap Signal enrichment — issue #0011.

Covers:
  - `service` field: correct value per signal type for all 10 signals
  - `sales_copy` field: non-empty string for all 10 signals
  - Both fields appear on every gap signal object in GET /leads/run/:id
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.main import app
from app.database import get_db
from app.models import Base, Run, Lead, GapSignal


# ---------------------------------------------------------------------------
# Database isolation fixture
# ---------------------------------------------------------------------------

@pytest.fixture
def test_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestingSession
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(test_db):
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_run_with_signal(test_db, signal_type: str, is_hard: bool = True) -> int:
    """Insert a run + lead + single gap signal, return run_id."""
    db = test_db()
    try:
        run = Run(config_yaml="queries:\n  - test\n", status="completed")
        db.add(run)
        db.flush()
        lead = Lead(
            run_id=run.id,
            external_id=f"place_{signal_type}",
            name="Test Business",
            gap_score=10.0,
            status="new",
        )
        db.add(lead)
        db.flush()
        db.add(GapSignal(
            lead_id=lead.id,
            signal_type=signal_type,
            is_hard=is_hard,
            description=f"Description for {signal_type}",
        ))
        db.commit()
        return run.id
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Tracer bullet: no_website → "Website Build"
# ---------------------------------------------------------------------------

class TestServiceField:
    def test_no_website_maps_to_website_build(self, client, test_db):
        """no_website signal type maps to service='Website Build'."""
        run_id = _seed_run_with_signal(test_db, "no_website", is_hard=True)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        leads = resp.json()
        assert len(leads) == 1
        signals = leads[0]["gap_signals"]
        assert len(signals) == 1
        assert signals[0]["service"] == "Website Build"

    def test_broken_website_maps_to_website_build(self, client, test_db):
        """broken_website signal type maps to service='Website Build'."""
        run_id = _seed_run_with_signal(test_db, "broken_website", is_hard=True)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert signal["service"] == "Website Build"

    def test_no_https_maps_to_website_build(self, client, test_db):
        """no_https signal type maps to service='Website Build'."""
        run_id = _seed_run_with_signal(test_db, "no_https", is_hard=True)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert signal["service"] == "Website Build"

    def test_low_pagespeed_maps_to_website_modernisation(self, client, test_db):
        """low_pagespeed signal type maps to service='Website Modernisation'."""
        run_id = _seed_run_with_signal(test_db, "low_pagespeed", is_hard=True)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert signal["service"] == "Website Modernisation"

    def test_no_viewport_tag_maps_to_website_modernisation(self, client, test_db):
        """no_viewport_tag signal type maps to service='Website Modernisation'."""
        run_id = _seed_run_with_signal(test_db, "no_viewport_tag", is_hard=False)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert signal["service"] == "Website Modernisation"

    def test_missing_meta_title_maps_to_seo_package(self, client, test_db):
        """missing_meta_title signal type maps to service='SEO Package'."""
        run_id = _seed_run_with_signal(test_db, "missing_meta_title", is_hard=False)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert signal["service"] == "SEO Package"

    def test_missing_meta_description_maps_to_seo_package(self, client, test_db):
        """missing_meta_description signal type maps to service='SEO Package'."""
        run_id = _seed_run_with_signal(test_db, "missing_meta_description", is_hard=False)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert signal["service"] == "SEO Package"

    def test_no_sitemap_maps_to_seo_package(self, client, test_db):
        """no_sitemap signal type maps to service='SEO Package'."""
        run_id = _seed_run_with_signal(test_db, "no_sitemap", is_hard=False)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert signal["service"] == "SEO Package"

    def test_no_robots_txt_maps_to_seo_package(self, client, test_db):
        """no_robots_txt signal type maps to service='SEO Package'."""
        run_id = _seed_run_with_signal(test_db, "no_robots_txt", is_hard=False)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert signal["service"] == "SEO Package"

    def test_no_schema_markup_maps_to_seo_package(self, client, test_db):
        """no_schema_markup signal type maps to service='SEO Package'."""
        run_id = _seed_run_with_signal(test_db, "no_schema_markup", is_hard=False)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert signal["service"] == "SEO Package"

    def test_slow_lcp_maps_to_website_modernisation(self, client, test_db):
        """slow_lcp signal type maps to service='Website Modernisation'."""
        run_id = _seed_run_with_signal(test_db, "slow_lcp", is_hard=False)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert signal["service"] == "Website Modernisation"

    def test_high_cls_maps_to_website_modernisation(self, client, test_db):
        """high_cls signal type maps to service='Website Modernisation'."""
        run_id = _seed_run_with_signal(test_db, "high_cls", is_hard=False)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert signal["service"] == "Website Modernisation"

    def test_slow_inp_maps_to_website_modernisation(self, client, test_db):
        """slow_inp signal type maps to service='Website Modernisation'."""
        run_id = _seed_run_with_signal(test_db, "slow_inp", is_hard=False)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert signal["service"] == "Website Modernisation"


# ---------------------------------------------------------------------------
# sales_copy: non-empty for all 10 signal types
# ---------------------------------------------------------------------------

ALL_SIGNAL_TYPES = [
    ("no_website", True),
    ("broken_website", True),
    ("no_https", True),
    ("low_pagespeed", True),
    ("no_viewport_tag", False),
    ("missing_meta_title", False),
    ("missing_meta_description", False),
    ("no_sitemap", False),
    ("no_robots_txt", False),
    ("no_schema_markup", False),
    ("slow_lcp", False),
    ("high_cls", False),
    ("slow_inp", False),
]


class TestSalesCopyField:
    @pytest.mark.parametrize("signal_type,is_hard", ALL_SIGNAL_TYPES)
    def test_sales_copy_non_empty(self, client, test_db, signal_type, is_hard):
        """sales_copy is a non-empty string for every signal type."""
        run_id = _seed_run_with_signal(test_db, signal_type, is_hard=is_hard)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert "sales_copy" in signal
        assert isinstance(signal["sales_copy"], str)
        assert len(signal["sales_copy"]) > 0

    @pytest.mark.parametrize("signal_type,is_hard", ALL_SIGNAL_TYPES)
    def test_service_present(self, client, test_db, signal_type, is_hard):
        """service field is present and non-empty for every signal type."""
        run_id = _seed_run_with_signal(test_db, signal_type, is_hard=is_hard)
        resp = client.get(f"/leads/run/{run_id}")
        assert resp.status_code == 200
        signal = resp.json()[0]["gap_signals"][0]
        assert "service" in signal
        assert signal["service"] in {"Website Build", "Website Modernisation", "SEO Package"}
