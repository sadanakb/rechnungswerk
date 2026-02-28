"""Tests for enhanced DATEVExporter (Phase 10)."""
import io
import zipfile
import pytest
from app.export.datev_export import DATEVExporter


class TestDATEVFormatter:

    def _sample_invoice(self, skr03_account="4930", seller_name="Papier GmbH"):
        return {
            "invoice_number": "RE-2024-001",
            "invoice_date": "2024-01-15",
            "seller_name": seller_name,
            "buyer_name": "Musterfirma GmbH",
            "net_amount": 1000.0,
            "tax_rate": 19.0,
            "tax_amount": 190.0,
            "gross_amount": 1190.0,
            "currency": "EUR",
            "skr03_account": skr03_account,
        }

    def test_meta_header_contains_berater_nr(self):
        """_build_meta_header() should embed berater_nr and mandant_nr."""
        exporter = DATEVExporter()
        header = exporter._build_meta_header(berater_nr="12345", mandant_nr="67890")
        assert header[9] == "12345"
        assert header[10] == "67890"

    def test_meta_header_defaults_to_empty(self):
        """Without berater_nr/mandant_nr, header fields should be empty string."""
        exporter = DATEVExporter()
        header = exporter._build_meta_header()
        assert header[9] == ""
        assert header[10] == ""

    def test_export_buchungsstapel_uses_skr03_account(self):
        """When invoice has skr03_account, use it as Konto field instead of default."""
        exporter = DATEVExporter()
        inv = self._sample_invoice(skr03_account="4930")
        csv_str = exporter.export_buchungsstapel([inv], berater_nr="12345", mandant_nr="00001")
        lines = csv_str.strip().split("\n")
        booking_line = lines[2]  # Line 0: header, Line 1: columns, Line 2: first booking
        assert "4930" in booking_line

    def test_decimal_comma_formatting(self):
        """Amounts must use comma as decimal separator (German DATEV format)."""
        exporter = DATEVExporter()
        result = exporter._format_amount(1190.0)
        assert result == "1190,00"

    def test_format_stammdaten_returns_csv(self):
        """format_stammdaten() should return CSV with Konto, Kontobeschriftung, Sprachkennung."""
        exporter = DATEVExporter()
        contacts = [
            {"account_nr": "70001", "name": "Papier GmbH"},
            {"account_nr": "70002", "name": "Tech AG"},
        ]
        csv_str = exporter.format_stammdaten(contacts)
        assert "70001" in csv_str
        assert "Papier GmbH" in csv_str
        assert "Konto" in csv_str

    def test_export_zip_contains_two_files(self):
        """export_zip() should return bytes of a ZIP with exactly 2 CSV files."""
        exporter = DATEVExporter()
        invoices = [self._sample_invoice()]
        contacts = [{"account_nr": "70001", "name": "Papier GmbH"}]
        zip_bytes = exporter.export_zip(
            invoices, contacts,
            berater_nr="12345", mandant_nr="00001",
            from_month="2024-01", to_month="2024-12",
        )
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
        assert len(names) == 2
        assert any("Buchungsstapel" in n for n in names)
        assert any("Stammdaten" in n for n in names)

    def test_organization_has_datev_fields(self):
        """Organization model must have datev_berater_nr, datev_mandant_nr, steuerberater_email."""
        from app.models import Organization
        org = Organization()
        assert hasattr(org, "datev_berater_nr")
        assert hasattr(org, "datev_mandant_nr")
        assert hasattr(org, "steuerberater_email")
