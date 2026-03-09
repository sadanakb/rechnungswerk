"""
Quote (Angebot) PDF Generator — Generates a professional PDF for quotes.

Uses weasyprint for HTML-to-PDF conversion, same pattern as zugferd_generator.
No XML embedding (quotes don't need ZUGFeRD/XRechnung compliance).
"""
import base64
import html
import logging
import os
from typing import Dict, Optional

logger = logging.getLogger(__name__)


def _resolve_logo_quote(logo_url: Optional[str]) -> Optional[str]:
    """Resolve logo to a data URI for use in quote PDFs.

    Always converts to data: URI to stay compatible with the SSRF-safe URL fetcher.
    Returns None if logo cannot be loaded — PDF generation continues without logo.
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
        logger.warning("Logo (Quote) konnte nicht geladen werden: %s — PDF wird ohne Logo generiert", e)
        return None


_QUOTE_HTML_TEMPLATE = """\
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

  /* ── Parties ── */
  .parties {{ display: flex; gap: 20px; margin-bottom: 35px; }}
  .party {{ flex: 1; background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 18px 20px; }}
  .party-label {{ font-size: 7.5pt; text-transform: uppercase; color: #a8a29e; letter-spacing: 1.5px; margin-bottom: 8px; font-weight: 600; }}
  .party p {{ margin: 2px 0; color: #44403c; }}
  .party strong {{ color: #1c1917; font-size: 10.5pt; }}

  /* ── Intro text ── */
  .intro-text {{ margin-bottom: 25px; padding: 14px 16px; background: #f7fee7; border-left: 3px solid #84CC16; border-radius: 0 6px 6px 0; color: #44403c; }}

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

  /* ── Closing text ── */
  .closing-text {{ margin-top: 30px; padding: 14px 16px; background: #f7fee7; border-left: 3px solid #84CC16; border-radius: 0 6px 6px 0; color: #44403c; }}

  /* ── Payment ── */
  .payment {{ margin-top: 25px; padding: 18px 20px; background: #f7fee7; border: 1px solid #bef264; border-radius: 8px; page-break-inside: avoid; }}
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
      <div class="doc-type">ANGEBOT</div>
      <div class="doc-number">{quote_number}</div>
      <div class="doc-meta">
        Datum: {quote_date}<br>
        {valid_until_line}
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">Anbieter</div>
      <p><strong>{seller_name}</strong></p>
      <p>{seller_address_html}</p>
      {seller_vat_line}
    </div>
    <div class="party">
      <div class="party-label">Empf&auml;nger</div>
      <p><strong>{buyer_name}</strong></p>
      <p>{buyer_address_html}</p>
      {buyer_vat_line}
    </div>
  </div>

  {intro_text_html}

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

  {closing_text_html}

  {payment_html}

  <div class="footer">
    Erstellt mit RechnungsKern &middot; Dieses Angebot ist freibleibend.
  </div>

</body>
</html>
"""


def generate_quote_pdf(quote_data: Dict, output_path: str) -> str:
    """
    Generate a PDF for a quote (Angebot).

    Args:
        quote_data: Quote field dictionary (may include logo_url)
        output_path: Where to save the PDF

    Returns:
        Path to generated PDF file
    """
    html_content = _render_quote_html(quote_data)
    pdf_bytes = _html_to_pdf(html_content)

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(pdf_bytes)

    logger.info("Quote PDF generated: %s", output_path)
    return output_path


def _render_quote_html(data: Dict) -> str:
    """Render quote data to HTML template."""
    currency = html.escape(data.get("currency", "EUR"))

    # Logo
    resolved = _resolve_logo_quote(data.get("logo_url"))
    if resolved:
        logo_html = (
            f'<img src="{resolved}" style="max-height:48px;max-width:180px;object-fit:contain;">'
            f'<div class="seller-compact">{html.escape(data.get("seller_name", ""))}</div>'
        )
    else:
        logo_html = f'<div class="seller-name-only">{html.escape(data.get("seller_name", ""))}</div>'

    # Line items HTML — escape all user-provided descriptions
    line_items = data.get("line_items") or []
    items_html = ""
    for i, item in enumerate(line_items, 1):
        qty = item.get("quantity", 1)
        price = item.get("unit_price", 0)
        net = item.get("net_amount", float(qty) * float(price))
        desc = html.escape(item.get("description", "Leistung"))
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

    # Valid until date
    valid_until = data.get("valid_until")
    valid_until_line = f"G&uuml;ltig bis: {html.escape(str(valid_until))}" if valid_until else ""

    # Seller VAT
    seller_vat = data.get("seller_vat_id")
    seller_vat_line = f"<p>USt-IdNr.: {html.escape(seller_vat)}</p>" if seller_vat else ""

    # Buyer VAT
    buyer_vat = data.get("buyer_vat_id")
    buyer_vat_line = f"<p>USt-IdNr.: {html.escape(buyer_vat)}</p>" if buyer_vat else ""

    # Intro text
    intro_text = data.get("intro_text")
    intro_text_html = f'<div class="intro-text">{html.escape(intro_text)}</div>' if intro_text else ""

    # Closing text
    closing_text = data.get("closing_text")
    closing_text_html = f'<div class="closing-text">{html.escape(closing_text)}</div>' if closing_text else ""

    # Payment — escape all user-provided values
    iban_raw = data.get("iban")
    payment_html = ""
    if iban_raw:
        iban = html.escape(iban_raw)
        bic = html.escape(data.get("bic", ""))
        account_name = html.escape(data.get("payment_account_name", ""))
        payment_html = '<div class="payment"><h3>Zahlungsinformationen</h3>'
        payment_html += f'<p>IBAN: <strong>{iban}</strong></p>'
        if bic:
            payment_html += f'<p>BIC: {bic}</p>'
        if account_name:
            payment_html += f'<p>Kontoinhaber: {account_name}</p>'
        payment_html += '</div>'

    # Addresses — escape FIRST, then replace newlines
    seller_addr = html.escape(data.get("seller_address") or "").replace("\n", "<br>")
    buyer_addr = html.escape(data.get("buyer_address") or "").replace("\n", "<br>")

    # Escape remaining user-provided fields
    quote_number = html.escape(data.get("quote_number", ""))
    buyer_name = html.escape(data.get("buyer_name", ""))

    return _QUOTE_HTML_TEMPLATE.format(
        logo_html=logo_html,
        quote_number=quote_number,
        quote_date=html.escape(str(data.get("quote_date", ""))),
        valid_until_line=valid_until_line,
        seller_name=html.escape(data.get("seller_name", "")),
        seller_address_html=seller_addr,
        seller_vat_line=seller_vat_line,
        buyer_name=buyer_name,
        buyer_address_html=buyer_addr,
        buyer_vat_line=buyer_vat_line,
        intro_text_html=intro_text_html,
        line_items_html=items_html,
        net_amount=f'{float(data.get("net_amount", 0)):.2f}',
        tax_rate=data.get("tax_rate", 19),
        tax_amount=f'{float(data.get("tax_amount", 0)):.2f}',
        gross_amount=f'{float(data.get("gross_amount", 0)):.2f}',
        currency=currency,
        closing_text_html=closing_text_html,
        payment_html=payment_html,
    )


def _deny_external_fetcher(url, **kwargs):
    """Block external URL fetches to prevent SSRF via weasyprint.

    Only allow data: and file: URIs (needed for embedded resources like logos).
    Logo URLs are pre-fetched and converted to data: URIs by _resolve_logo_quote().
    """
    if url.startswith('data:') or url.startswith('file:'):
        from weasyprint import default_url_fetcher
        return default_url_fetcher(url, **kwargs)
    raise ValueError(f"External URL blocked: {url}")


def _html_to_pdf(html_content: str) -> bytes:
    """Convert HTML to PDF bytes using weasyprint."""
    try:
        from weasyprint import HTML
        return HTML(string=html_content, url_fetcher=_deny_external_fetcher).write_pdf()
    except ImportError:
        logger.error("weasyprint not installed — cannot generate quote PDF")
        raise ImportError(
            "weasyprint ist nicht installiert. "
            "Installieren mit: pip install weasyprint>=62.0"
        )
