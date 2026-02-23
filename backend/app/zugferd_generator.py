"""
ZUGFeRD PDF/A-3 Generator — Embeds XRechnung XML into a PDF invoice.

Uses the factur-x library (already in requirements.txt) to create
EN 16931-compliant ZUGFeRD 2.2 / Factur-X PDF/A-3 files.

Flow:
  1. Generate visual PDF invoice using weasyprint
  2. Generate XRechnung XML
  3. Embed XML into PDF as ZUGFeRD attachment
  4. Output PDF/A-3 compliant file
"""
import logging
import os
import tempfile
from typing import Dict, Optional

logger = logging.getLogger(__name__)


# HTML template for visual invoice PDF
_INVOICE_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  @page {{ size: A4; margin: 2cm; }}
  body {{ font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1a1a2e; line-height: 1.5; }}
  .header {{ display: flex; justify-content: space-between; margin-bottom: 30px; }}
  .brand {{ font-size: 18pt; font-weight: bold; color: #1d4ed8; }}
  .meta {{ text-align: right; font-size: 9pt; color: #64748b; }}
  .parties {{ display: flex; gap: 40px; margin-bottom: 25px; }}
  .party {{ flex: 1; }}
  .party h3 {{ font-size: 8pt; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; margin-bottom: 5px; }}
  .party p {{ margin: 2px 0; }}
  .invoice-info {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin-bottom: 25px; }}
  .invoice-info table {{ width: 100%; }}
  .invoice-info td {{ padding: 3px 10px; }}
  .invoice-info td:first-child {{ font-weight: 600; color: #334155; width: 180px; }}
  table.items {{ width: 100%; border-collapse: collapse; margin-bottom: 25px; }}
  table.items th {{ background: #1d4ed8; color: white; padding: 8px 12px; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; }}
  table.items th:last-child, table.items td:last-child {{ text-align: right; }}
  table.items td {{ padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }}
  table.items tr:nth-child(even) {{ background: #f8fafc; }}
  .totals {{ float: right; width: 250px; }}
  .totals table {{ width: 100%; }}
  .totals td {{ padding: 4px 8px; }}
  .totals td:last-child {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .totals tr.total {{ font-weight: bold; font-size: 12pt; border-top: 2px solid #1d4ed8; }}
  .payment {{ clear: both; margin-top: 40px; padding: 15px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; }}
  .payment h3 {{ font-size: 9pt; color: #047857; margin-bottom: 5px; }}
  .footer {{ margin-top: 40px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; text-align: center; }}
  .zugferd-badge {{ display: inline-block; background: #dbeafe; color: #1d4ed8; padding: 2px 8px; border-radius: 4px; font-size: 7pt; font-weight: 600; }}
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">RECHNUNG</div>
      <span class="zugferd-badge">ZUGFeRD 2.2 / XRechnung 3.0.2</span>
    </div>
    <div class="meta">
      <strong>{invoice_number}</strong><br>
      Datum: {invoice_date}<br>
      {due_date_line}
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Rechnungssteller</h3>
      <p><strong>{seller_name}</strong></p>
      <p>{seller_address_html}</p>
      <p>USt-IdNr.: {seller_vat_id}</p>
    </div>
    <div class="party">
      <h3>Rechnungsempfaenger</h3>
      <p><strong>{buyer_name}</strong></p>
      <p>{buyer_address_html}</p>
      {buyer_vat_line}
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Pos.</th>
        <th>Beschreibung</th>
        <th>Menge</th>
        <th>Einzelpreis</th>
        <th>Netto</th>
      </tr>
    </thead>
    <tbody>
      {line_items_html}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Nettobetrag</td><td>{net_amount} {currency}</td></tr>
      <tr><td>MwSt {tax_rate}%</td><td>{tax_amount} {currency}</td></tr>
      <tr class="total"><td>Gesamtbetrag</td><td>{gross_amount} {currency}</td></tr>
    </table>
  </div>

  {payment_html}

  <div class="footer">
    Erstellt mit RechnungsWerk &middot; EN 16931 / XRechnung 3.0.2 konform &middot; ZUGFeRD 2.2 PDF/A-3
  </div>
</body>
</html>
"""


class ZUGFeRDGenerator:
    """Generate ZUGFeRD 2.2 PDF/A-3 files with embedded XRechnung XML."""

    def generate(
        self,
        invoice_data: Dict,
        xml_content: str,
        output_path: str,
    ) -> str:
        """
        Generate a ZUGFeRD PDF/A-3 file.

        Args:
            invoice_data: Invoice field dictionary
            xml_content: XRechnung UBL XML string
            output_path: Where to save the PDF

        Returns:
            Path to generated PDF file
        """
        # Step 1: Generate visual HTML invoice
        html = self._render_html(invoice_data)

        # Step 2: Convert HTML to PDF using weasyprint
        pdf_bytes = self._html_to_pdf(html)

        # Step 3: Embed XML into PDF using factur-x
        zugferd_pdf = self._embed_xml(pdf_bytes, xml_content)

        # Step 4: Save
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(zugferd_pdf)

        logger.info("ZUGFeRD PDF generated: %s", output_path)
        return output_path

    def _render_html(self, data: Dict) -> str:
        """Render invoice data to HTML template."""
        currency = data.get("currency", "EUR")

        # Line items HTML
        line_items = data.get("line_items") or []
        items_html = ""
        for i, item in enumerate(line_items, 1):
            qty = item.get("quantity", 1)
            price = item.get("unit_price", 0)
            net = item.get("net_amount", qty * price)
            items_html += (
                f'<tr><td>{i}</td>'
                f'<td>{item.get("description", "Leistung")}</td>'
                f'<td>{qty}</td>'
                f'<td>{float(price):.2f} {currency}</td>'
                f'<td>{float(net):.2f} {currency}</td></tr>\n'
            )

        if not items_html:
            items_html = (
                f'<tr><td>1</td><td>Leistung</td><td>1</td>'
                f'<td>{float(data.get("net_amount", 0)):.2f} {currency}</td>'
                f'<td>{float(data.get("net_amount", 0)):.2f} {currency}</td></tr>'
            )

        # Due date
        due_date = data.get("due_date")
        due_date_line = f"Faellig: {due_date}" if due_date else ""

        # Buyer VAT
        buyer_vat = data.get("buyer_vat_id")
        buyer_vat_line = f"<p>USt-IdNr.: {buyer_vat}</p>" if buyer_vat else ""

        # Payment
        iban = data.get("iban")
        payment_html = ""
        if iban:
            bic = data.get("bic", "")
            account_name = data.get("payment_account_name", "")
            payment_html = f"""
            <div class="payment">
              <h3>Zahlungsinformationen</h3>
              <p>IBAN: <strong>{iban}</strong></p>
              {"<p>BIC: " + bic + "</p>" if bic else ""}
              {"<p>Kontoinhaber: " + account_name + "</p>" if account_name else ""}
            </div>
            """

        # Addresses
        seller_addr = (data.get("seller_address") or "").replace("\n", "<br>")
        buyer_addr = (data.get("buyer_address") or "").replace("\n", "<br>")

        return _INVOICE_HTML_TEMPLATE.format(
            invoice_number=data.get("invoice_number", ""),
            invoice_date=data.get("invoice_date", ""),
            due_date_line=due_date_line,
            seller_name=data.get("seller_name", ""),
            seller_address_html=seller_addr,
            seller_vat_id=data.get("seller_vat_id", ""),
            buyer_name=data.get("buyer_name", ""),
            buyer_address_html=buyer_addr,
            buyer_vat_line=buyer_vat_line,
            line_items_html=items_html,
            net_amount=f'{float(data.get("net_amount", 0)):.2f}',
            tax_rate=data.get("tax_rate", 19),
            tax_amount=f'{float(data.get("tax_amount", 0)):.2f}',
            gross_amount=f'{float(data.get("gross_amount", 0)):.2f}',
            currency=currency,
            payment_html=payment_html,
        )

    def _html_to_pdf(self, html: str) -> bytes:
        """Convert HTML to PDF bytes using weasyprint."""
        try:
            from weasyprint import HTML
            return HTML(string=html).write_pdf()
        except ImportError:
            logger.error("weasyprint not installed — cannot generate ZUGFeRD PDF")
            raise ImportError(
                "weasyprint ist nicht installiert. "
                "Installieren mit: pip install weasyprint>=62.0"
            )

    def _embed_xml(self, pdf_bytes: bytes, xml_content: str) -> bytes:
        """Embed XRechnung XML into PDF using factur-x library."""
        try:
            from facturx import generate_from_binary

            zugferd_pdf, _ = generate_from_binary(
                pdf_bytes,
                xml_content.encode("utf-8"),
                flavor="factur-x",
                level="en16931",
            )
            return zugferd_pdf
        except ImportError:
            logger.error("factur-x not installed")
            raise ImportError(
                "factur-x ist nicht installiert. "
                "Installieren mit: pip install factur-x>=3.1.0"
            )
        except Exception as e:
            logger.error("factur-x embedding failed: %s", e)
            raise ValueError(f"ZUGFeRD-Einbettung fehlgeschlagen: {e}")
