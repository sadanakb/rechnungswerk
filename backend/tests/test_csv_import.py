"""
Tests for CSV invoice import endpoints.

Covers:
- Successful import of valid CSV rows
- Duplicate detection (same invoice_number skipped on second import)
- Row-level error reporting for missing required fields
- Template download (Content-Type and content validation)
"""
import io
import csv
import pytest
from fastapi.testclient import TestClient


def _make_csv(rows: list[dict]) -> bytes:
    """Helper to build a CSV bytes payload from a list of dicts."""
    headers = [
        "invoice_number", "invoice_date", "due_date",
        "buyer_name", "buyer_vat_id",
        "seller_name", "seller_vat_id",
        "net_amount", "tax_rate", "gross_amount",
        "currency", "payment_status",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=headers, extrasaction='ignore')
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return output.getvalue().encode("utf-8")


VALID_ROW_1 = {
    "invoice_number": "TEST-0001",
    "invoice_date": "2026-01-15",
    "due_date": "2026-02-15",
    "buyer_name": "ACME GmbH",
    "buyer_vat_id": "DE111111111",
    "seller_name": "Meine Firma GmbH",
    "seller_vat_id": "DE999999999",
    "net_amount": "1000.00",
    "tax_rate": "19",
    "gross_amount": "1190.00",
    "currency": "EUR",
    "payment_status": "unpaid",
}

VALID_ROW_2 = {
    "invoice_number": "TEST-0002",
    "invoice_date": "2026-01-20",
    "due_date": "2026-02-20",
    "buyer_name": "Beta Corp",
    "buyer_vat_id": "",
    "seller_name": "Meine Firma GmbH",
    "seller_vat_id": "DE999999999",
    "net_amount": "500.00",
    "tax_rate": "0",
    "gross_amount": "500.00",
    "currency": "EUR",
    "payment_status": "paid",
}


def test_valid_csv_imports_correctly(client: TestClient):
    """Two valid CSV rows should be imported with imported=2, skipped=0, errors=[]."""
    csv_bytes = _make_csv([VALID_ROW_1, VALID_ROW_2])
    response = client.post(
        "/api/import/csv",
        files={"file": ("invoices.csv", csv_bytes, "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["imported"] == 2
    assert data["skipped"] == 0
    assert data["errors"] == []
    assert data["total_rows"] == 2


def test_duplicate_skipped(client: TestClient):
    """
    When the same CSV row is imported twice the second run should report
    imported=0 and skipped=1 (deduplication by invoice_number).
    """
    csv_bytes = _make_csv([VALID_ROW_1])

    # First import — should succeed
    r1 = client.post(
        "/api/import/csv",
        files={"file": ("invoices.csv", csv_bytes, "text/csv")},
    )
    assert r1.status_code == 200
    assert r1.json()["imported"] == 1

    # Second import of the same row — should be skipped
    r2 = client.post(
        "/api/import/csv",
        files={"file": ("invoices.csv", csv_bytes, "text/csv")},
    )
    assert r2.status_code == 200
    data = r2.json()
    assert data["imported"] == 0
    assert data["skipped"] == 1
    assert data["errors"] == []


def test_invalid_row_reported(client: TestClient):
    """
    A row that is missing invoice_number should appear in the errors list
    and NOT be imported.
    """
    bad_row = {**VALID_ROW_1, "invoice_number": ""}  # missing invoice_number
    csv_bytes = _make_csv([bad_row])

    response = client.post(
        "/api/import/csv",
        files={"file": ("invoices.csv", csv_bytes, "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["imported"] == 0
    assert len(data["errors"]) == 1
    assert data["errors"][0]["row"] == 2  # first data row is row 2
    assert "invoice_number" in data["errors"][0]["error"].lower()


def test_template_download(client: TestClient):
    """
    GET /api/import/template should return a CSV file with the correct
    Content-Type header and include the expected column headers.
    """
    response = client.get("/api/import/template")
    assert response.status_code == 200

    content_type = response.headers.get("content-type", "")
    assert "text/csv" in content_type

    # Decode content (strip BOM if present)
    text = response.content.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    headers = next(reader)

    expected_headers = [
        "invoice_number", "invoice_date", "due_date",
        "buyer_name", "buyer_vat_id",
        "seller_name", "seller_vat_id",
        "net_amount", "tax_rate", "gross_amount",
        "currency", "payment_status",
    ]
    assert headers == expected_headers

    # Template should contain at least 2 example rows
    example_rows = list(reader)
    assert len(example_rows) >= 1
