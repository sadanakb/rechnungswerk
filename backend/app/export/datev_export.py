"""
DATEV Export — Generate DATEV-compatible CSV/ASCII files.

Supports:
- DATEV Buchungsstapel (CSV format for import into DATEV)
- SKR03/SKR04 account mapping based on invoice type
- Proper German date/number formatting for DATEV
"""
import csv
import io
import logging
from datetime import datetime
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# SKR03 default account mappings
SKR03_ACCOUNTS = {
    "revenue": "8400",          # Erloese 19% USt
    "revenue_7": "8300",        # Erloese 7% USt
    "revenue_0": "8100",        # Steuerfreie Erloese
    "input_tax": "1576",        # Vorsteuer 19%
    "input_tax_7": "1571",      # Vorsteuer 7%
    "accounts_receivable": "1400",  # Forderungen aus L+L
    "accounts_payable": "1600",     # Verbindlichkeiten aus L+L
    "bank": "1200",             # Bank
}

# SKR04 default account mappings
SKR04_ACCOUNTS = {
    "revenue": "4400",
    "revenue_7": "4300",
    "revenue_0": "4100",
    "input_tax": "1406",
    "input_tax_7": "1401",
    "accounts_receivable": "1200",
    "accounts_payable": "3300",
    "bank": "1800",
}

# DATEV CSV header (Buchungsstapel format)
DATEV_HEADER_FIELDS = [
    "Umsatz (ohne Soll/Haben-Kz)",
    "Soll/Haben-Kennzeichen",
    "WKZ Umsatz",
    "Kurs",
    "Basis-Umsatz",
    "WKZ Basis-Umsatz",
    "Konto",
    "Gegenkonto (ohne BU-Schluessel)",
    "BU-Schluessel",
    "Belegdatum",
    "Belegfeld 1",
    "Belegfeld 2",
    "Skonto",
    "Buchungstext",
    "Postensperre",
    "Diverse Adressnummer",
    "Geschaeftspartnerbank",
    "Sachverhalt",
    "Zinssperre",
    "Beleglink",
    "Beleginfo - Art 1",
    "Beleginfo - Inhalt 1",
    "Beleginfo - Art 2",
    "Beleginfo - Inhalt 2",
]


class DATEVExporter:
    """Generate DATEV-compatible export files."""

    def __init__(self, kontenrahmen: str = "SKR03"):
        self.kontenrahmen = kontenrahmen.upper()
        self.accounts = SKR03_ACCOUNTS if self.kontenrahmen == "SKR03" else SKR04_ACCOUNTS

    def export_buchungsstapel(self, invoices: List[Dict]) -> str:
        """
        Generate DATEV Buchungsstapel CSV.

        Args:
            invoices: List of invoice dictionaries

        Returns:
            CSV string in DATEV format
        """
        output = io.StringIO()
        writer = csv.writer(output, delimiter=";", quoting=csv.QUOTE_MINIMAL)

        # DATEV file header (meta row)
        writer.writerow(self._build_meta_header())

        # Column headers
        writer.writerow(DATEV_HEADER_FIELDS)

        # Data rows
        for inv in invoices:
            rows = self._invoice_to_rows(inv)
            for row in rows:
                writer.writerow(row)

        return output.getvalue()

    def _build_meta_header(self) -> List[str]:
        """Build DATEV meta header row."""
        now = datetime.now()
        return [
            "EXTF",  # DATEV format identifier
            "700",   # Version
            "21",    # Kategorie: Buchungsstapel
            "Buchungsstapel",
            "13",    # Formatversion
            str(now.year * 10000 + now.month * 100 + now.day),
            "",      # Herkunft
            "",      # Exportiert von
            "",      # Importiert von
            "",      # Berater
            "",      # Mandant
            str(now.year * 10000 + 101),  # WJ-Beginn (01.01.YYYY)
            "4",     # Sachkontennummernlaenge
            str(now.year * 10000 + now.month * 100 + 1),  # Datum von
            str(now.year * 10000 + now.month * 100 + now.day),  # Datum bis
            "",      # Bezeichnung
            "",      # Diktatkuerzel
            "1",     # Buchungstyp: 1=Finanzbuchfuehrung
            "0",     # Rechnungslegungszweck
            "",      # Festschreibung
            self.kontenrahmen,  # Kontenrahmen
        ]

    def _invoice_to_rows(self, invoice: Dict) -> List[List[str]]:
        """Convert a single invoice to DATEV booking rows."""
        rows = []

        gross = float(invoice.get("gross_amount", 0))
        tax_rate = float(invoice.get("tax_rate", 19))
        invoice_date = invoice.get("invoice_date", "")
        invoice_number = invoice.get("invoice_number", "")
        seller_name = invoice.get("seller_name", "")
        buyer_name = invoice.get("buyer_name", "")

        # Format date for DATEV (DDMM)
        datev_date = self._format_datev_date(invoice_date)

        # Determine account based on tax rate
        if tax_rate == 19:
            revenue_account = self.accounts["revenue"]
            bu_key = "3"  # BU-Schluessel fuer 19% USt
        elif tax_rate == 7:
            revenue_account = self.accounts["revenue_7"]
            bu_key = "2"  # BU-Schluessel fuer 7% USt
        else:
            revenue_account = self.accounts["revenue_0"]
            bu_key = ""

        # Outgoing invoice: Debit receivables, Credit revenue
        booking_text = f"RE {invoice_number} {buyer_name}"[:60]

        row = [""] * len(DATEV_HEADER_FIELDS)
        row[0] = self._format_amount(gross)          # Umsatz
        row[1] = "S"                                   # Soll
        row[2] = invoice.get("currency", "EUR")        # WKZ
        row[6] = self.accounts["accounts_receivable"]  # Konto (Forderungen)
        row[7] = revenue_account                       # Gegenkonto (Erloese)
        row[8] = bu_key                                # BU-Schluessel
        row[9] = datev_date                            # Belegdatum
        row[10] = invoice_number[:12]                  # Belegfeld 1
        row[13] = booking_text                         # Buchungstext
        row[20] = "Rechnungsnummer"                    # Beleginfo Art 1
        row[21] = invoice_number                       # Beleginfo Inhalt 1
        row[22] = "Lieferant"                          # Beleginfo Art 2
        row[23] = seller_name[:36]                     # Beleginfo Inhalt 2

        rows.append(row)
        return rows

    def _format_datev_date(self, date_str: str) -> str:
        """Format date string to DATEV format (DDMM or DDMMYYYY)."""
        if not date_str:
            return ""
        try:
            if "-" in date_str:
                dt = datetime.strptime(str(date_str), "%Y-%m-%d")
            elif "." in date_str:
                dt = datetime.strptime(date_str, "%d.%m.%Y")
            else:
                return date_str[:4]
            return dt.strftime("%d%m")
        except ValueError:
            return ""

    def _format_amount(self, amount: float) -> str:
        """Format amount for DATEV (German decimal format: comma as separator)."""
        return f"{amount:.2f}".replace(".", ",")

    def export_csv_simple(self, invoices: List[Dict]) -> str:
        """
        Export invoices as a simple CSV for generic accounting import.

        Columns: Rechnungsnummer, Datum, Verkaeufer, Kaeufer, Netto, MwSt, Brutto, Waehrung, IBAN
        """
        output = io.StringIO()
        writer = csv.writer(output, delimiter=";")

        writer.writerow([
            "Rechnungsnummer", "Datum", "Faellig", "Verkaeufer", "Kaeufer",
            "Netto", "MwSt-Satz", "MwSt-Betrag", "Brutto", "Waehrung",
            "IBAN", "BIC", "Quelle", "Status",
        ])

        for inv in invoices:
            writer.writerow([
                inv.get("invoice_number", ""),
                inv.get("invoice_date", ""),
                inv.get("due_date", ""),
                inv.get("seller_name", ""),
                inv.get("buyer_name", ""),
                self._format_amount(float(inv.get("net_amount", 0))),
                f'{float(inv.get("tax_rate", 19)):.0f}%',
                self._format_amount(float(inv.get("tax_amount", 0))),
                self._format_amount(float(inv.get("gross_amount", 0))),
                inv.get("currency", "EUR"),
                inv.get("iban", ""),
                inv.get("bic", ""),
                inv.get("source_type", ""),
                inv.get("validation_status", ""),
            ])

        return output.getvalue()
