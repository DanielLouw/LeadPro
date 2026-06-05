# LeadPro

A locally-run lead generation tool that finds US local businesses with web presence gaps (no website, missing HTTPS, low PageSpeed scores, etc.), scores them, and presents them in a reviewable dashboard.

## Prerequisites

- Python 3.11+
- Node.js 20+
- Google Places API key
- Google PageSpeed Insights API key

## Setup

### Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
copy .env.example .env          # Windows
# cp .env.example .env          # macOS/Linux
# Edit .env and fill in your API keys
```

### Frontend

```bash
cd frontend
npm install
```

## Running locally

### Start the backend

```bash
cd backend
.venv\Scripts\activate
python main.py
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Start the frontend

```bash
cd frontend
npm run dev
```

The dashboard will be available at `http://localhost:5173`.

## Project structure

```
backend/
  app/
    gap_analyzer/     # URL → gap signals + score
    places_scraper/   # Google Places queries → raw business records
    lead_pipeline/    # Orchestrates scraping + analysis for a Run
    api/              # FastAPI HTTP layer
  models.py           # SQLAlchemy ORM models (Runs, Leads, GapSignals, Notes)
  database.py         # DB session and init
  config.py           # Settings from .env
  main.py             # Uvicorn entry point
frontend/
  src/
    pages/
      ConfigBuilder.tsx   # Build and trigger runs
      LeadResults.tsx     # Review and manage leads
```

## Database

SQLite, stored at `backend/leadpro.db`. Created automatically on first run.
