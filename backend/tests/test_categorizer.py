"""
Tests für den /api/invoices/{id}/categorize Endpoint und den InvoiceCategorizer.

Da InvoiceCategorizer Ollama (externe Abhängigkeit) nutzt, wird der
httpx.AsyncClient.post-Call gemockt. Zusätzlich wird das Keyword-Fallback
ohne Mock getestet (Ollama-Fehler → Keyword-Matching greift).
"""
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from app.ai.categorizer import InvoiceCategorizer


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _make_ollama_response(category: str, skr03: str, skr04: str, confidence: float = 0.9) -> MagicMock:
    """Erstellt einen Mock für eine erfolgreiche Ollama-Antwort."""
    body = json.dumps({
        "category": category,
        "skr03_account": skr03,
        "skr04_account": skr04,
        "confidence": confidence,
        "reasoning": f"KI erkannte: {category}",
    })
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"response": body}
    mock_resp.raise_for_status = MagicMock()
    return mock_resp


def _make_ollama_error_response() -> MagicMock:
    """Erstellt einen Mock der raise_for_status eine Exception wirft."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status.side_effect = Exception("Ollama nicht erreichbar")
    return mock_resp


# ---------------------------------------------------------------------------
# Unit Tests: InvoiceCategorizer direkt
# ---------------------------------------------------------------------------

class TestInvoiceCategorizerUnit:
    """Direkte Tests des InvoiceCategorizer ohne HTTP-Layer."""

    @pytest.mark.asyncio
    async def test_categorize_with_ollama_success(self):
        """Ollama antwortet korrekt → Ergebnis wird zurückgegeben."""
        mock_resp = _make_ollama_response(
            category="IT/Software",
            skr03="4964",
            skr04="6830",
            confidence=0.95,
        )
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
            categorizer = InvoiceCategorizer()
            result = await categorizer.categorize({
                "seller_name": "Microsoft Deutschland GmbH",
                "line_items": [{"description": "Microsoft 365 Lizenz"}],
                "net_amount": 120.0,
            })

        assert result["category"] == "IT/Software"
        assert result["skr03_account"] == "4964"
        assert result["skr04_account"] == "6830"
        assert result["confidence"] == pytest.approx(0.95)
        assert "reasoning" in result

    @pytest.mark.asyncio
    async def test_categorize_falls_back_on_ollama_error(self):
        """Ollama nicht erreichbar → Keyword-Matching Fallback."""
        with patch("httpx.AsyncClient.post", side_effect=Exception("Connection refused")):
            categorizer = InvoiceCategorizer()
            result = await categorizer.categorize({
                "seller_name": "Vodafone GmbH",
                "line_items": [{"description": "Telefon-Flatrate"}],
                "net_amount": 49.99,
            })

        # Keyword "telefon" wird erkannt
        assert result["category"] == "Telefon/Internet"
        assert result["skr03_account"] == "4920"
        assert result["skr04_account"] == "6805"
        assert result["confidence"] > 0.0

    @pytest.mark.asyncio
    async def test_categorize_keyword_miete(self):
        """Keyword-Matching für Miete."""
        with patch("httpx.AsyncClient.post", side_effect=Exception("offline")):
            categorizer = InvoiceCategorizer()
            result = await categorizer.categorize({
                "seller_name": "Immobilien GmbH",
                "line_items": [{"description": "Büromiete März 2026"}],
                "net_amount": 1200.0,
            })

        assert result["category"] == "Miete"
        assert result["skr03_account"] == "4210"

    @pytest.mark.asyncio
    async def test_categorize_keyword_buero(self):
        """Keyword-Matching für Büromaterial."""
        with patch("httpx.AsyncClient.post", side_effect=Exception("offline")):
            categorizer = InvoiceCategorizer()
            result = await categorizer.categorize({
                "seller_name": "Staples GmbH",
                "line_items": [{"description": "Bürobedarf: Toner und Papier"}],
                "net_amount": 85.0,
            })

        assert result["category"] == "Büromaterial"
        assert result["skr03_account"] == "4930"

    @pytest.mark.asyncio
    async def test_categorize_keyword_versicherung(self):
        """Keyword-Matching für Versicherung."""
        with patch("httpx.AsyncClient.post", side_effect=Exception("offline")):
            categorizer = InvoiceCategorizer()
            result = await categorizer.categorize({
                "seller_name": "Allianz Versicherung AG",
                "line_items": [{"description": "Betriebshaftpflicht Prämie"}],
                "net_amount": 300.0,
            })

        assert result["category"] == "Versicherung"
        assert result["skr03_account"] == "4360"

    @pytest.mark.asyncio
    async def test_categorize_fallback_unknown(self):
        """Kein Keyword trifft → Sonstige Aufwendungen."""
        with patch("httpx.AsyncClient.post", side_effect=Exception("offline")):
            categorizer = InvoiceCategorizer()
            result = await categorizer.categorize({
                "seller_name": "XYZ Unbekannt GmbH",
                "line_items": [{"description": "Sehr spezielle Sonderleistung zzz"}],
                "net_amount": 999.0,
            })

        assert result["category"] == "Sonstige Aufwendungen"
        assert result["confidence"] == pytest.approx(0.1)
        assert "Standardkonto" in result["reasoning"]

    @pytest.mark.asyncio
    async def test_categorize_invalid_ollama_json_falls_back(self):
        """Ollama gibt ungültiges JSON zurück → Keyword-Fallback."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"response": "Das ist kein JSON !!!"}
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
            categorizer = InvoiceCategorizer()
            result = await categorizer.categorize({
                "seller_name": "Deutsche Post AG",
                "line_items": [{"description": "Porto und Versand"}],
                "net_amount": 15.0,
            })

        # Keyword "porto" oder "versand" trifft → Porto-Kategorie
        assert result["category"] in ("Porto", "Sonstige Aufwendungen")

    @pytest.mark.asyncio
    async def test_categorize_incomplete_ollama_response_falls_back(self):
        """Ollama-Antwort fehlen Pflichtfelder → Keyword-Fallback."""
        body = json.dumps({
            "category": "IT/Software",
            # skr03_account und skr04_account fehlen
            "confidence": 0.9,
        })
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"response": body}
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
            categorizer = InvoiceCategorizer()
            result = await categorizer.categorize({
                "seller_name": "Software AG",
                "line_items": [{"description": "Softwarelizenz"}],
                "net_amount": 200.0,
            })

        # Muss irgendetwas zurückgeben (Fallback)
        assert "category" in result
        assert "skr03_account" in result

    @pytest.mark.asyncio
    async def test_confidence_clamped_to_valid_range(self):
        """Konfidenzwert über 1.0 wird auf 1.0 begrenzt."""
        body = json.dumps({
            "category": "Beratung",
            "skr03_account": "4900",
            "skr04_account": "6300",
            "confidence": 99.0,
            "reasoning": "Übertriebener Wert",
        })
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"response": body}
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
            categorizer = InvoiceCategorizer()
            result = await categorizer.categorize({
                "seller_name": "Steuerberater Müller",
                "line_items": [{"description": "Steuerberatung"}],
                "net_amount": 500.0,
            })

        assert result["confidence"] <= 1.0


# ---------------------------------------------------------------------------
# Unit Tests: _build_description und _extract_amount
# ---------------------------------------------------------------------------

class TestCategorizerHelpers:
    """Tests für statische Hilfsmethoden."""

    def test_build_description_combines_fields(self):
        data = {
            "seller_name": "Lieferant GmbH",
            "line_items": [{"description": "Position 1"}, {"description": "Position 2"}],
            "invoice_number": "RE-2026-001",
        }
        desc = InvoiceCategorizer._build_description(data)
        assert "Lieferant GmbH" in desc
        assert "Position 1" in desc
        assert "Position 2" in desc
        assert "RE-2026-001" in desc

    def test_build_description_empty_data(self):
        desc = InvoiceCategorizer._build_description({})
        assert desc == "Keine Beschreibung verfügbar"

    def test_build_description_no_line_items(self):
        data = {"seller_name": "Nur Name GmbH"}
        desc = InvoiceCategorizer._build_description(data)
        assert "Nur Name GmbH" in desc

    def test_extract_amount_from_net_amount(self):
        data = {"net_amount": 1500.0, "gross_amount": 1785.0}
        amount = InvoiceCategorizer._extract_amount(data)
        assert amount == 1500.0

    def test_extract_amount_fallback_to_gross(self):
        data = {"gross_amount": 1785.0}
        amount = InvoiceCategorizer._extract_amount(data)
        assert amount == 1785.0

    def test_extract_amount_empty_returns_zero(self):
        amount = InvoiceCategorizer._extract_amount({})
        assert amount == 0.0

    def test_extract_amount_invalid_value_returns_zero(self):
        amount = InvoiceCategorizer._extract_amount({"net_amount": "nicht_eine_zahl"})
        assert amount == 0.0


# ---------------------------------------------------------------------------
# Integrationstests: /api/invoices/{id}/categorize Endpoint
# ---------------------------------------------------------------------------

class TestCategorizeEndpoint:
    """POST /api/invoices/{id}/categorize via HTTP-Layer."""

    @pytest.fixture()
    def sample_invoice_data(self) -> dict:
        return {
            "invoice_number": "RE-2026-TEST-001",
            "invoice_date": "2026-02-23",
            "due_date": "2026-03-23",
            "seller_name": "Software Lösungen AG",
            "seller_vat_id": "DE111111111",
            "seller_address": "Techstraße 10, 80333 München",
            "buyer_name": "Käufer GmbH",
            "buyer_vat_id": "DE222222222",
            "buyer_address": "Hauptstraße 5, 10115 Berlin",
            "line_items": [
                {
                    "description": "Software-Lizenz Microsoft 365",
                    "quantity": 5.0,
                    "unit_price": 20.0,
                    "net_amount": 100.0,
                    "tax_rate": 19.0,
                }
            ],
            "tax_rate": 19.0,
            "iban": "DE89370400440532013000",
            "bic": "COBADEFFXXX",
            "payment_account_name": "Software Lösungen AG",
            "currency": "EUR",
        }

    @pytest.fixture()
    def created_invoice(self, client, sample_invoice_data) -> dict:
        resp = client.post("/api/invoices", json=sample_invoice_data)
        assert resp.status_code == 200
        return resp.json()

    def test_categorize_nonexistent_invoice_returns_404(self, client):
        resp = client.post("/api/invoices/INV-20260223-00000000/categorize")
        assert resp.status_code == 404

    def test_categorize_with_ollama_mock(self, client, created_invoice):
        """Ollama antwortet → Endpoint gibt KI-Ergebnis zurück."""
        invoice_id = created_invoice["invoice_id"]
        mock_resp = _make_ollama_response(
            category="IT/Software",
            skr03="4964",
            skr04="6830",
            confidence=0.92,
        )
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
            resp = client.post(f"/api/invoices/{invoice_id}/categorize")

        assert resp.status_code == 200
        data = resp.json()
        assert data["invoice_id"] == invoice_id
        assert "invoice_number" in data
        assert data["category"] == "IT/Software"
        assert data["skr03_account"] == "4964"
        assert data["skr04_account"] == "6830"
        assert "confidence" in data
        assert "reasoning" in data

    def test_categorize_with_ollama_unavailable_uses_keyword_fallback(
        self, client, created_invoice
    ):
        """Ollama offline → Keyword-Fallback, Endpoint trotzdem 200."""
        invoice_id = created_invoice["invoice_id"]
        with patch("httpx.AsyncClient.post", side_effect=Exception("Connection refused")):
            resp = client.post(f"/api/invoices/{invoice_id}/categorize")

        assert resp.status_code == 200
        data = resp.json()
        assert data["invoice_id"] == invoice_id
        # "software" oder "microsoft" im Seller/Line-Item → IT/Software
        assert data["category"] in ("IT/Software", "Sonstige Aufwendungen")
        assert "skr03_account" in data
        assert "skr04_account" in data
        assert "confidence" in data

    def test_categorize_response_has_all_required_keys(self, client, created_invoice):
        """Response enthält alle Pflichtfelder."""
        invoice_id = created_invoice["invoice_id"]
        with patch("httpx.AsyncClient.post", side_effect=Exception("offline")):
            resp = client.post(f"/api/invoices/{invoice_id}/categorize")

        assert resp.status_code == 200
        data = resp.json()
        required_keys = {
            "invoice_id",
            "invoice_number",
            "category",
            "skr03_account",
            "skr04_account",
            "confidence",
            "reasoning",
        }
        missing = required_keys - set(data.keys())
        assert not missing, f"Fehlende Keys in Response: {missing}"

    def test_categorize_beratung_invoice(self, client, sample_invoice_data):
        """Rechnung mit Keyword 'Beratung' → Kategorie Beratung."""
        sample_invoice_data["seller_name"] = "Unternehmensberatung Müller GmbH"
        sample_invoice_data["invoice_number"] = "RE-2026-BERAT-001"
        sample_invoice_data["seller_vat_id"] = "DE333444555"
        sample_invoice_data["line_items"] = [
            {
                "description": "Strategieberatung",
                "quantity": 10.0,
                "unit_price": 200.0,
                "net_amount": 2000.0,
                "tax_rate": 19.0,
            }
        ]
        create_resp = client.post("/api/invoices", json=sample_invoice_data)
        assert create_resp.status_code == 200
        invoice_id = create_resp.json()["invoice_id"]

        with patch("httpx.AsyncClient.post", side_effect=Exception("offline")):
            resp = client.post(f"/api/invoices/{invoice_id}/categorize")

        assert resp.status_code == 200
        data = resp.json()
        assert data["category"] == "Beratung"
        assert data["skr03_account"] == "4900"

    def test_categorize_miete_invoice(self, client, sample_invoice_data):
        """Rechnung mit Keyword 'Miete' → Kategorie Miete."""
        sample_invoice_data["seller_name"] = "Immobilien Frankfurt GmbH"
        sample_invoice_data["invoice_number"] = "RE-2026-MIETE-001"
        sample_invoice_data["seller_vat_id"] = "DE666777888"
        sample_invoice_data["line_items"] = [
            {
                "description": "Büromiete April 2026",
                "quantity": 1.0,
                "unit_price": 1500.0,
                "net_amount": 1500.0,
                "tax_rate": 19.0,
            }
        ]
        create_resp = client.post("/api/invoices", json=sample_invoice_data)
        assert create_resp.status_code == 200
        invoice_id = create_resp.json()["invoice_id"]

        with patch("httpx.AsyncClient.post", side_effect=Exception("offline")):
            resp = client.post(f"/api/invoices/{invoice_id}/categorize")

        assert resp.status_code == 200
        data = resp.json()
        assert data["category"] == "Miete"
        assert data["skr03_account"] == "4210"
