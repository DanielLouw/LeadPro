"""
Places scraper: given a list of query strings, fetches business records from the
Google Places Text Search API. Returns raw business data — gap analysis is handled
by the gap_analyzer module.
"""

from dataclasses import dataclass

import httpx

from app.config import settings

PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


@dataclass
class RawBusiness:
    place_id: str
    name: str
    address: str | None
    city: str | None
    state: str | None
    phone: str | None
    website_url: str | None
    maps_url: str | None


async def scrape_queries(queries: list[str], max_results: int = 500) -> list[RawBusiness]:
    """Fetch raw business records for a list of search queries."""
    results: list[RawBusiness] = []
    seen_place_ids: set[str] = set()

    async with httpx.AsyncClient(timeout=30.0) as client:
        for query in queries:
            if len(results) >= max_results:
                break
            businesses = await _fetch_query(client, query, max_results - len(results))
            for biz in businesses:
                if biz.place_id not in seen_place_ids:
                    seen_place_ids.add(biz.place_id)
                    results.append(biz)

    return results


async def _fetch_query(client: httpx.AsyncClient, query: str, limit: int) -> list[RawBusiness]:
    params = {
        "query": query,
        "key": settings.GOOGLE_PLACES_API_KEY,
    }
    results: list[RawBusiness] = []
    next_page_token: str | None = None

    while len(results) < limit:
        if next_page_token:
            params["pagetoken"] = next_page_token
        else:
            params.pop("pagetoken", None)

        try:
            resp = await client.get(PLACES_TEXT_SEARCH_URL, params=params)
            data = resp.json()
        except Exception:
            break

        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            break

        for place in data.get("results", []):
            if len(results) >= limit:
                break
            details = await _fetch_details(client, place["place_id"])
            city, state = _parse_city_state(place.get("formatted_address", ""))
            results.append(
                RawBusiness(
                    place_id=place["place_id"],
                    name=place.get("name", ""),
                    address=place.get("formatted_address"),
                    city=city,
                    state=state,
                    phone=details.get("formatted_phone_number"),
                    website_url=details.get("website"),
                    maps_url=f"https://www.google.com/maps/place/?q=place_id:{place['place_id']}",
                )
            )

        next_page_token = data.get("next_page_token")
        if not next_page_token:
            break

    return results


async def _fetch_details(client: httpx.AsyncClient, place_id: str) -> dict:
    try:
        resp = await client.get(
            PLACES_DETAILS_URL,
            params={
                "place_id": place_id,
                "fields": "formatted_phone_number,website",
                "key": settings.GOOGLE_PLACES_API_KEY,
            },
        )
        return resp.json().get("result", {})
    except Exception:
        return {}


def _parse_city_state(formatted_address: str) -> tuple[str | None, str | None]:
    """Best-effort extraction of city and state from a formatted address string."""
    parts = [p.strip() for p in formatted_address.split(",")]
    # Typical US format: "123 Main St, City, ST 12345, USA"
    if len(parts) >= 3:
        city = parts[-3] if len(parts) >= 3 else None
        state_zip = parts[-2].strip() if len(parts) >= 2 else ""
        state = state_zip.split()[0] if state_zip else None
        return city, state
    return None, None
