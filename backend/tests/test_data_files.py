"""
Tests for backend/app/data/counties.py and backend/app/data/search_terms.py.
Verifies structural correctness of static data files — not implementation details.
"""

from app.data.counties import COUNTIES
from app.data.search_terms import SEARCH_TERMS

# ---------------------------------------------------------------------------
# Authoritative list of business type labels from frontend/src/data/businessTypes.ts
# Keep in sync if that file changes.
# ---------------------------------------------------------------------------
EXPECTED_BUSINESS_TYPES = [
    "plumbers",
    "HVAC companies",
    "electricians",
    "roofers",
    "general contractors",
    "pest control companies",
    "landscaping companies",
    "house cleaning services",
    "chiropractors",
    "physical therapists",
    "dentists",
    "optometrists",
    "massage therapists",
    "personal trainers",
    "restaurants",
    "catering companies",
    "food trucks",
    "bakeries",
    "coffee shops",
    "bars and nightclubs",
    "accountants",
    "lawyers",
    "insurance agents",
    "financial advisors",
    "marketing agencies",
    "IT consulting firms",
    "auto repair shops",
    "car dealerships",
    "auto body shops",
    "tire shops",
    "car detailing services",
]

ALL_US_STATE_ABBREVIATIONS = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
}


# ---------------------------------------------------------------------------
# COUNTIES tests
# ---------------------------------------------------------------------------

class TestCounties:
    def test_all_50_state_abbreviations_present(self):
        missing = ALL_US_STATE_ABBREVIATIONS - set(COUNTIES.keys())
        assert not missing, f"Missing states: {sorted(missing)}"

    def test_no_extra_keys_beyond_50_states(self):
        extra = set(COUNTIES.keys()) - ALL_US_STATE_ABBREVIATIONS
        assert not extra, f"Unexpected keys: {sorted(extra)}"

    def test_no_state_has_empty_county_list(self):
        empty = [state for state, counties in COUNTIES.items() if not counties]
        assert not empty, f"States with empty county lists: {empty}"

    def test_total_county_count_at_least_3100(self):
        total = sum(len(counties) for counties in COUNTIES.values())
        assert total >= 3100, f"Expected >= 3100 counties, got {total}"

    def test_county_names_are_strings(self):
        for state, counties in COUNTIES.items():
            for name in counties:
                assert isinstance(name, str) and name, (
                    f"Non-string or empty county name in {state}: {name!r}"
                )

    def test_county_names_contain_official_suffix(self):
        """Every name should include an official US county-equivalent suffix."""
        suffixes = (
            "County", "Parish", "Borough", "Census Area",
            "Municipality", "City and Borough", "District", "city", "City",
        )
        for state, counties in COUNTIES.items():
            for name in counties:
                assert any(s in name for s in suffixes), (
                    f"County name in {state} missing expected suffix: {name!r}"
                )


# ---------------------------------------------------------------------------
# SEARCH_TERMS tests
# ---------------------------------------------------------------------------

class TestSearchTerms:
    def test_all_business_types_present(self):
        missing = [bt for bt in EXPECTED_BUSINESS_TYPES if bt not in SEARCH_TERMS]
        assert not missing, f"Missing business types in SEARCH_TERMS: {missing}"

    def test_no_entry_has_fewer_than_3_synonyms(self):
        short = {k: v for k, v in SEARCH_TERMS.items() if len(v) < 3}
        assert not short, f"Entries with fewer than 3 synonyms: {short}"

    def test_base_label_is_first_synonym(self):
        for bt in EXPECTED_BUSINESS_TYPES:
            if bt in SEARCH_TERMS:
                synonyms = SEARCH_TERMS[bt]
                assert synonyms[0] == bt, (
                    f"First synonym for {bt!r} should be the base label, "
                    f"got {synonyms[0]!r}"
                )

    def test_all_synonyms_are_non_empty_strings(self):
        for bt, synonyms in SEARCH_TERMS.items():
            for s in synonyms:
                assert isinstance(s, str) and s, (
                    f"Non-string or empty synonym for {bt!r}: {s!r}"
                )
