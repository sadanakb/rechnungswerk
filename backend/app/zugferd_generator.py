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
import base64
import logging
import os
import tempfile
from typing import Dict, Optional

logger = logging.getLogger(__name__)


def _resolve_logo(logo_url: Optional[str]) -> Optional[str]:
    """Resolve logo to a data URI usable by weasyprint.

    Returns None if logo cannot be loaded — PDF generation continues without logo.
    Converts all sources (storage keys, http URLs) to data: URIs for maximum
    compatibility with weasyprint URL fetchers.
    """
    if not logo_url:
        return None
    try:
        if logo_url.startswith(('http://', 'https://')):
            import urllib.request
            req = urllib.request.Request(logo_url, headers={'User-Agent': 'RechnungsKern-PDF/1.0'})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = resp.read()
                content_type = resp.headers.get('Content-Type', 'image/png')
                mime = content_type.split(';')[0].strip() or 'image/png'
        else:
            # Storage key → bytes
            from app.storage import get_storage
            storage = get_storage()
            data = storage.read(logo_url)
            ext = logo_url.rsplit('.', 1)[-1].lower()
            mime = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'svg': 'image/svg+xml',
            }.get(ext, 'image/png')
        return f"data:{mime};base64,{base64.b64encode(data).decode()}"
    except Exception as e:
        logger.warning("Logo konnte nicht geladen werden: %s — PDF wird ohne Logo generiert", e)
        return None


# HTML template for visual invoice PDF
_INVOICE_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  @page {{ size: A4; margin: 2cm; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1c1917; line-height: 1.5; margin: 0; }}

  /* ── Header ── */
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }}
  .header-left {{ display: flex; flex-direction: column; gap: 6px; max-width: 55%; }}
  .header-left img {{ max-height: 48px; max-width: 180px; object-fit: contain; display: block; }}
  .seller-compact {{ font-size: 10pt; color: #78716c; margin-top: 2px; }}
  .seller-name-only {{ font-size: 16pt; font-weight: bold; color: #1c1917; }}
  .header-right {{ text-align: right; }}
  .doc-type {{ font-size: 22pt; font-weight: bold; color: #4d7c0f; letter-spacing: -0.3px; line-height: 1.1; }}
  .doc-number {{ font-size: 11pt; font-weight: 600; color: #1c1917; margin-top: 4px; }}
  .doc-meta {{ font-size: 9pt; color: #78716c; margin-top: 3px; }}
  .zugferd-badge {{ display: inline-block; background: #ecfccb; color: #4d7c0f; padding: 2px 8px; border-radius: 4px; font-size: 7pt; font-weight: 600; margin-top: 6px; }}

  /* ── Parties ── */
  .parties {{ display: flex; gap: 20px; margin-bottom: 35px; }}
  .party {{ flex: 1; background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 18px 20px; }}
  .party-label {{ font-size: 7.5pt; text-transform: uppercase; color: #a8a29e; letter-spacing: 1.5px; margin-bottom: 8px; font-weight: 600; }}
  .party p {{ margin: 2px 0; color: #44403c; }}
  .party strong {{ color: #1c1917; font-size: 10.5pt; }}

  /* ── Invoice info box ── */
  .invoice-info {{ background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 14px 20px; margin-bottom: 35px; }}
  .invoice-info table {{ width: 100%; border-collapse: collapse; }}
  .invoice-info td {{ padding: 3px 0; }}
  .invoice-info td:first-child {{ font-size: 8pt; font-weight: 600; color: #78716c; text-transform: uppercase; letter-spacing: 0.5px; width: 200px; }}
  .invoice-info td:last-child {{ color: #44403c; font-size: 9.5pt; }}

  /* ── Items table ── */
  table.items {{ width: 100%; border-collapse: collapse; margin-bottom: 10px; page-break-inside: auto; }}
  table.items thead {{ display: table-header-group; }}
  table.items tr {{ page-break-inside: avoid; }}
  table.items th {{ background: #4d7c0f; color: white; padding: 9px 10px; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }}
  table.items th.num {{ text-align: right; }}
  table.items td {{ padding: 8px 10px; border-bottom: 1px solid #e7e5e4; vertical-align: top; color: #44403c; }}
  table.items td.desc {{ word-wrap: break-word; word-break: break-word; }}
  table.items td.num {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }}
  table.items tr:nth-child(even) {{ background: #fafaf9; }}
  .col-pos {{ width: 8%; }}
  .col-qty {{ width: 10%; }}
  .col-price {{ width: 16%; }}
  .col-net {{ width: 16%; }}

  /* ── Totals ── */
  .totals-wrap {{ display: flex; justify-content: flex-end; margin-bottom: 30px; page-break-inside: avoid; }}
  .totals {{ width: 270px; }}
  .totals table {{ width: 100%; border-collapse: collapse; }}
  .totals td {{ padding: 5px 8px; color: #44403c; }}
  .totals td:last-child {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .totals tr.vat td {{ border-top: 1px solid #e7e5e4; color: #78716c; font-size: 9.5pt; }}
  .totals tr.total td {{ border-top: 2px solid #84CC16; font-weight: bold; font-size: 12pt; color: #1c1917; padding-top: 8px; }}

  /* ── Payment ── */
  .payment {{ margin-top: 35px; padding: 18px 20px; background: #f7fee7; border: 1px solid #bef264; border-radius: 8px; page-break-inside: avoid; }}
  .payment h3 {{ font-size: 8pt; text-transform: uppercase; letter-spacing: 1px; color: #4d7c0f; margin: 0 0 10px 0; font-weight: 700; }}
  .payment p {{ margin: 3px 0; color: #44403c; font-size: 9.5pt; }}

  /* ── Footer ── */
  .footer {{ margin-top: 40px; padding-top: 14px; border-top: 1px solid #e7e5e4; font-size: 7.5pt; color: #a8a29e; text-align: center; }}
</style>
</head>
<body>

  <div class="header">
    <div class="header-left">
      {logo_html}
    </div>
    <div class="header-right">
      <div class="doc-type">RECHNUNG</div>
      <div class="doc-number">{invoice_number}</div>
      <div class="doc-meta">
        Datum: {invoice_date}<br>
        {due_date_line}
      </div>
      <div><span class="zugferd-badge">ZUGFeRD 2.2 / XRechnung 3.0.2</span></div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">Von</div>
      <p><strong>{seller_name}</strong></p>
      <p>{seller_address_html}</p>
      <p>USt-IdNr.: {seller_vat_id}</p>
    </div>
    <div class="party">
      <div class="party-label">An</div>
      <p><strong>{buyer_name}</strong></p>
      <p>{buyer_address_html}</p>
      {buyer_vat_line}
    </div>
  </div>

  {invoice_info_html}

  <table class="items">
    <thead>
      <tr>
        <th class="col-pos">Pos.</th>
        <th>Beschreibung</th>
        <th class="num col-qty">Menge</th>
        <th class="num col-price">Einzelpreis</th>
        <th class="num col-net">Netto</th>
      </tr>
    </thead>
    <tbody>
      {line_items_html}
    </tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals">
      <table>
        <tr><td>Nettobetrag</td><td>{net_amount} {currency}</td></tr>
        <tr class="vat"><td>MwSt. {tax_rate}&#160;%</td><td>{tax_amount} {currency}</td></tr>
        <tr class="total"><td>Gesamtbetrag</td><td>{gross_amount} {currency}</td></tr>
      </table>
    </div>
  </div>

  {payment_html}

  <div class="footer">
    Erstellt mit RechnungsKern &middot; EN 16931 / XRechnung 3.0.2 konform &middot; ZUGFeRD 2.2 PDF/A-3
  </div>

</body>
</html>
"""


_CREDIT_NOTE_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  @page {{ size: A4; margin: 2cm; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1c1917; line-height: 1.5; margin: 0; }}

  /* ── Header ── */
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }}
  .header-left {{ display: flex; flex-direction: column; gap: 6px; max-width: 55%; }}
  .header-left img {{ max-height: 48px; max-width: 180px; object-fit: contain; display: block; }}
  .seller-compact {{ font-size: 10pt; color: #78716c; margin-top: 2px; }}
  .seller-name-only {{ font-size: 16pt; font-weight: bold; color: #1c1917; }}
  .header-right {{ text-align: right; }}
  .doc-type {{ font-size: 22pt; font-weight: bold; color: #b91c1c; letter-spacing: -0.3px; line-height: 1.1; }}
  .doc-number {{ font-size: 11pt; font-weight: 600; color: #1c1917; margin-top: 4px; }}
  .doc-meta {{ font-size: 9pt; color: #78716c; margin-top: 3px; }}
  .zugferd-badge {{ display: inline-block; background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 4px; font-size: 7pt; font-weight: 600; margin-top: 6px; }}

  /* ── Reference box ── */
  .reference {{ background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 14px 20px; margin-bottom: 20px; }}
  .reference-label {{ font-size: 7.5pt; text-transform: uppercase; color: #f43f5e; letter-spacing: 1px; font-weight: 700; margin-bottom: 6px; }}
  .reference p {{ margin: 2px 0; color: #44403c; }}
  .reference strong {{ color: #1c1917; }}

  /* ── Reason box ── */
  .reason-box {{ background: #fafaf9; border-left: 3px solid #b91c1c; padding: 12px 16px; margin-bottom: 25px; border-radius: 0 6px 6px 0; }}
  .reason-label {{ font-size: 8pt; font-weight: 700; color: #78716c; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }}
  .reason-text {{ color: #44403c; font-size: 10pt; }}

  /* ── Parties ── */
  .parties {{ display: flex; gap: 20px; margin-bottom: 35px; }}
  .party {{ flex: 1; background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 18px 20px; }}
  .party-label {{ font-size: 7.5pt; text-transform: uppercase; color: #a8a29e; letter-spacing: 1.5px; margin-bottom: 8px; font-weight: 600; }}
  .party p {{ margin: 2px 0; color: #44403c; }}
  .party strong {{ color: #1c1917; font-size: 10.5pt; }}

  /* ── Items table ── */
  table.items {{ width: 100%; border-collapse: collapse; margin-bottom: 10px; page-break-inside: auto; }}
  table.items thead {{ display: table-header-group; }}
  table.items tr {{ page-break-inside: avoid; }}
  table.items th {{ background: #b91c1c; color: white; padding: 9px 10px; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }}
  table.items th.num {{ text-align: right; }}
  table.items td {{ padding: 8px 10px; border-bottom: 1px solid #e7e5e4; vertical-align: top; color: #44403c; }}
  table.items td.desc {{ word-wrap: break-word; word-break: break-word; }}
  table.items td.num {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }}
  table.items tr:nth-child(even) {{ background: #fafaf9; }}
  .col-pos {{ width: 8%; }}
  .col-qty {{ width: 10%; }}
  .col-price {{ width: 16%; }}
  .col-net {{ width: 16%; }}

  /* ── Totals ── */
  .totals-wrap {{ display: flex; justify-content: flex-end; margin-bottom: 30px; page-break-inside: avoid; }}
  .totals {{ width: 270px; }}
  .totals table {{ width: 100%; border-collapse: collapse; }}
  .totals td {{ padding: 5px 8px; color: #44403c; }}
  .totals td:last-child {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .totals tr.vat td {{ border-top: 1px solid #e7e5e4; color: #78716c; font-size: 9.5pt; }}
  .totals tr.total td {{ border-top: 2px solid #b91c1c; font-weight: bold; font-size: 12pt; color: #1c1917; padding-top: 8px; }}

  /* ── Payment ── */
  .payment {{ margin-top: 35px; padding: 18px 20px; background: #f7fee7; border: 1px solid #bef264; border-radius: 8px; page-break-inside: avoid; }}
  .payment h3 {{ font-size: 8pt; text-transform: uppercase; letter-spacing: 1px; color: #4d7c0f; margin: 0 0 10px 0; font-weight: 700; }}
  .payment p {{ margin: 3px 0; color: #44403c; font-size: 9.5pt; }}

  /* ── Footer ── */
  .footer {{ margin-top: 40px; padding-top: 14px; border-top: 1px solid #e7e5e4; font-size: 7.5pt; color: #a8a29e; text-align: center; }}
</style>
</head>
<body>

  <div class="header">
    <div class="header-left">
      {logo_html}
    </div>
    <div class="header-right">
      <div class="doc-type">GUTSCHRIFT</div>
      <div class="doc-number">{credit_note_number}</div>
      <div class="doc-meta">Datum: {credit_note_date}</div>
      <div><span class="zugferd-badge">ZUGFeRD 2.2 / XRechnung 3.0.2</span></div>
    </div>
  </div>

  <div class="reference">
    <div class="reference-label">Gutschrift</div>
    <p>Bezug auf Rechnung: <strong>{original_invoice_number}</strong></p>
  </div>

  {reason_html}

  <div class="parties">
    <div class="party">
      <div class="party-label">Gutschrift von</div>
      <p><strong>{seller_name}</strong></p>
      <p>{seller_address_html}</p>
      <p>USt-IdNr.: {seller_vat_id}</p>
    </div>
    <div class="party">
      <div class="party-label">Gutschrift an</div>
      <p><strong>{buyer_name}</strong></p>
      <p>{buyer_address_html}</p>
      {buyer_vat_line}
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th class="col-pos">Pos.</th>
        <th>Beschreibung</th>
        <th class="num col-qty">Menge</th>
        <th class="num col-price">Einzelpreis</th>
        <th class="num col-net">Netto</th>
      </tr>
    </thead>
    <tbody>
      {line_items_html}
    </tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals">
      <table>
        <tr><td>Nettobetrag</td><td>{net_amount} {currency}</td></tr>
        <tr class="vat"><td>MwSt. {tax_rate}&#160;%</td><td>{tax_amount} {currency}</td></tr>
        <tr class="total"><td>Gutschriftbetrag</td><td>{gross_amount} {currency}</td></tr>
      </table>
    </div>
  </div>

  {payment_html}

  <div class="footer">
    Erstellt mit RechnungsKern &middot; EN 16931 / XRechnung 3.0.2 konform &middot; ZUGFeRD 2.2 PDF/A-3
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
            invoice_data: Invoice field dictionary (may include logo_url)
            xml_content: XRechnung UBL XML string
            output_path: Where to save the PDF

        Returns:
            Path to generated PDF file
        """
        html = self._render_html(invoice_data)
        pdf_bytes = self._html_to_pdf(html)
        zugferd_pdf = self._embed_xml(pdf_bytes, xml_content)

        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(zugferd_pdf)

        logger.info("ZUGFeRD PDF generated: %s", output_path)
        return output_path

    def _render_html(self, data: Dict) -> str:
        """Render invoice data to HTML template."""
        currency = data.get("currency", "EUR")

        # Logo
        resolved = _resolve_logo(data.get("logo_url"))
        if resolved:
            logo_html = (
                f'<img src="{resolved}" style="max-height:48px;max-width:180px;object-fit:contain;">'
                f'<div class="seller-compact">{data.get("seller_name", "")}</div>'
            )
        else:
            logo_html = f'<div class="seller-name-only">{data.get("seller_name", "")}</div>'

        # Line items
        line_items = data.get("line_items") or []
        items_html = ""
        for i, item in enumerate(line_items, 1):
            qty = item.get("quantity", 1)
            price = item.get("unit_price", 0)
            net = item.get("net_amount", float(qty) * float(price))
            desc = item.get("description", "Leistung")
            items_html += (
                f'<tr>'
                f'<td>{i}</td>'
                f'<td class="desc">{desc}</td>'
                f'<td class="num">{qty}</td>'
                f'<td class="num">{float(price):.2f}&#160;{currency}</td>'
                f'<td class="num">{float(net):.2f}&#160;{currency}</td>'
                f'</tr>\n'
            )

        if not items_html:
            net_amt = float(data.get("net_amount", 0))
            items_html = (
                f'<tr>'
                f'<td>1</td><td class="desc">Leistung</td><td class="num">1</td>'
                f'<td class="num">{net_amt:.2f}&#160;{currency}</td>'
                f'<td class="num">{net_amt:.2f}&#160;{currency}</td>'
                f'</tr>'
            )

        # Due date — only if present
        due_date = data.get("due_date")
        due_date_line = f"F&auml;llig: {due_date}" if due_date else ""

        # Buyer VAT — only if present
        buyer_vat = data.get("buyer_vat_id")
        buyer_vat_line = f"<p>USt-IdNr.: {buyer_vat}</p>" if buyer_vat else ""

        # Invoice info box — only if buyer_reference or leitweg-id present
        buyer_reference = data.get("buyer_reference")
        show_ref = buyer_reference and buyer_reference.lower() not in ("", "n/a", "none")
        if show_ref:
            invoice_info_html = f"""
            <div class="invoice-info">
              <table>
                <tr>
                  <td>Leitweg-ID / Buyer Reference</td>
                  <td>{buyer_reference}</td>
                </tr>
              </table>
            </div>
            """
        else:
            invoice_info_html = ""

        # Payment block
        iban = data.get("iban")
        payment_html = ""
        if iban:
            bic = data.get("bic", "")
            account_name = data.get("payment_account_name", "")
            payment_html = '<div class="payment"><h3>Zahlungsinformationen</h3>'
            payment_html += f'<p>IBAN: <strong>{iban}</strong></p>'
            if bic:
                payment_html += f'<p>BIC: {bic}</p>'
            if account_name:
                payment_html += f'<p>Kontoinhaber: {account_name}</p>'
            payment_html += '</div>'

        seller_addr = (data.get("seller_address") or "").replace("\n", "<br>")
        buyer_addr = (data.get("buyer_address") or "").replace("\n", "<br>")

        return _INVOICE_HTML_TEMPLATE.format(
            logo_html=logo_html,
            invoice_number=data.get("invoice_number", ""),
            invoice_date=data.get("invoice_date", ""),
            due_date_line=due_date_line,
            seller_name=data.get("seller_name", ""),
            seller_address_html=seller_addr,
            seller_vat_id=data.get("seller_vat_id", ""),
            buyer_name=data.get("buyer_name", ""),
            buyer_address_html=buyer_addr,
            buyer_vat_line=buyer_vat_line,
            invoice_info_html=invoice_info_html,
            line_items_html=items_html,
            net_amount=f'{float(data.get("net_amount", 0)):.2f}',
            tax_rate=data.get("tax_rate", 19),
            tax_amount=f'{float(data.get("tax_amount", 0)):.2f}',
            gross_amount=f'{float(data.get("gross_amount", 0)):.2f}',
            currency=currency,
            payment_html=payment_html,
        )

    def generate_credit_note(
        self,
        credit_note_data: Dict,
        xml_content: str,
        output_path: str,
    ) -> str:
        """Generate a ZUGFeRD PDF/A-3 file for a credit note."""
        html = self._render_credit_note_html(credit_note_data)
        pdf_bytes = self._html_to_pdf(html)
        zugferd_pdf = self._embed_xml(pdf_bytes, xml_content)
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(zugferd_pdf)
        logger.info("ZUGFeRD CreditNote PDF generated: %s", output_path)
        return output_path

    def _render_credit_note_html(self, data: Dict) -> str:
        """Render credit note data to HTML template."""
        currency = data.get("currency", "EUR")

        # Logo
        resolved = _resolve_logo(data.get("logo_url"))
        if resolved:
            logo_html = (
                f'<img src="{resolved}" style="max-height:48px;max-width:180px;object-fit:contain;">'
                f'<div class="seller-compact">{data.get("seller_name", "")}</div>'
            )
        else:
            logo_html = f'<div class="seller-name-only">{data.get("seller_name", "")}</div>'

        # Line items
        line_items = data.get("line_items") or []
        items_html = ""
        for i, item in enumerate(line_items, 1):
            qty = item.get("quantity", 1)
            price = item.get("unit_price", 0)
            net = item.get("net_amount", float(qty) * float(price))
            desc = item.get("description", "Gutschrift")
            items_html += (
                f'<tr>'
                f'<td>{i}</td>'
                f'<td class="desc">{desc}</td>'
                f'<td class="num">{qty}</td>'
                f'<td class="num">{float(price):.2f}&#160;{currency}</td>'
                f'<td class="num">{float(net):.2f}&#160;{currency}</td>'
                f'</tr>\n'
            )

        if not items_html:
            net_amt = float(data.get("net_amount", 0))
            items_html = (
                f'<tr>'
                f'<td>1</td><td class="desc">Gutschrift</td><td class="num">1</td>'
                f'<td class="num">{net_amt:.2f}&#160;{currency}</td>'
                f'<td class="num">{net_amt:.2f}&#160;{currency}</td>'
                f'</tr>'
            )

        buyer_vat = data.get("buyer_vat_id")
        buyer_vat_line = f"<p>USt-IdNr.: {buyer_vat}</p>" if buyer_vat else ""

        # Reason block — only if reason present
        reason = data.get("reason", "")
        if reason:
            reason_html = f"""
            <div class="reason-box">
              <div class="reason-label">Grund der Gutschrift</div>
              <div class="reason-text">{reason}</div>
            </div>
            """
        else:
            reason_html = ""

        # Payment block
        iban = data.get("iban")
        payment_html = ""
        if iban:
            bic = data.get("bic", "")
            account_name = data.get("payment_account_name", "")
            payment_html = '<div class="payment"><h3>Zahlungsinformationen</h3>'
            payment_html += f'<p>IBAN: <strong>{iban}</strong></p>'
            if bic:
                payment_html += f'<p>BIC: {bic}</p>'
            if account_name:
                payment_html += f'<p>Kontoinhaber: {account_name}</p>'
            payment_html += '</div>'

        seller_addr = (data.get("seller_address") or "").replace("\n", "<br>")
        buyer_addr = (data.get("buyer_address") or "").replace("\n", "<br>")

        return _CREDIT_NOTE_HTML_TEMPLATE.format(
            logo_html=logo_html,
            credit_note_number=data.get("credit_note_number", ""),
            credit_note_date=data.get("credit_note_date", ""),
            original_invoice_number=data.get("original_invoice_number", ""),
            reason_html=reason_html,
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
