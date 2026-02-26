"""GoBD Verfahrensdokumentation PDF Generator.

Generates a professional compliance report documenting the invoice
processing procedures in accordance with GoBD (Grundsaetze zur
ordnungsmaessigen Fuehrung und Aufbewahrung von Buechern, Aufzeichnungen
und Unterlagen in elektronischer Form sowie zum Datenzugriff).
"""
import io
from datetime import date
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors


def generate_gobd_report(org_name: str) -> bytes:
    """Generate a GoBD Verfahrensdokumentation as PDF bytes.

    Args:
        org_name: Name of the organization for the report.

    Returns:
        PDF file content as bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
    )
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Title"],
        fontSize=18,
        spaceAfter=20,
    )
    heading_style = ParagraphStyle(
        "CustomHeading",
        parent=styles["Heading2"],
        fontSize=14,
        spaceAfter=10,
        spaceBefore=15,
    )

    story = []

    # Title
    story.append(Paragraph("Verfahrensdokumentation", title_style))
    story.append(Paragraph(
        f"gemaess GoBD fuer {org_name}",
        styles["Heading3"],
    ))
    story.append(Paragraph(
        f"Stand: {date.today().strftime('%d.%m.%Y')}",
        styles["Normal"],
    ))
    story.append(Spacer(1, 30))

    # Section 1: Systembeschreibung
    story.append(Paragraph("1. Systembeschreibung", heading_style))
    story.append(Paragraph(
        f"{org_name} nutzt RechnungsWerk zur elektronischen Rechnungsverarbeitung. "
        "Das System unterstuetzt die Formate XRechnung (UBL 2.1) und ZUGFeRD 2.3.3 "
        "gemaess EN 16931. Die Verarbeitung erfolgt automatisiert mit KI-gestuetzter "
        "Texterkennung (OCR) und regelbasierter Validierung.",
        styles["Normal"],
    ))
    story.append(Spacer(1, 10))

    # Section 2: Archivierungsverfahren
    story.append(Paragraph("2. Archivierungsverfahren", heading_style))
    story.append(Paragraph(
        "Alle Rechnungen werden revisionssicher archiviert. Die Aufbewahrungsfrist "
        "betraegt 10 Jahre gemaess Par. 147 AO. Aenderungen an archivierten Dokumenten "
        "werden protokolliert (Audit Trail). Jedes Dokument erhaelt einen eindeutigen "
        "Hashwert (SHA-256) zur Integritaetspruefung.",
        styles["Normal"],
    ))
    story.append(Spacer(1, 10))

    # Section 3: Zugriffskontrollen
    story.append(Paragraph("3. Zugriffskontrollen", heading_style))
    access_data = [
        ["Rolle", "Lesen", "Schreiben", "Loeschen", "Export"],
        ["Inhaber (Owner)", "Ja", "Ja", "Ja", "Ja"],
        ["Administrator", "Ja", "Ja", "Nein", "Ja"],
        ["Mitarbeiter", "Ja", "Nein", "Nein", "Nein"],
    ]
    table = Table(access_data, colWidths=[4 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.059, 0.094, 0.165)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
        ("GRID", (0, 0), (-1, -1), 1, colors.grey),
    ]))
    story.append(table)
    story.append(Spacer(1, 10))

    # Section 4: Aufbewahrungsfristen
    story.append(Paragraph("4. Aufbewahrungsfristen", heading_style))
    story.append(Paragraph(
        "Gemaess Par. 147 AO und Par. 257 HGB gelten folgende Aufbewahrungsfristen:",
        styles["Normal"],
    ))
    retention_data = [
        ["Dokumenttyp", "Frist", "Rechtsgrundlage"],
        ["Rechnungen (Ein-/Ausgang)", "10 Jahre", "Par. 147 Abs. 1 Nr. 1 AO"],
        ["Buchungsbelege", "10 Jahre", "Par. 147 Abs. 1 Nr. 4 AO"],
        ["Handelsbriefe", "6 Jahre", "Par. 257 Abs. 1 Nr. 2 HGB"],
        ["Verfahrensdokumentation", "10 Jahre", "GoBD Tz. 151"],
    ]
    table2 = Table(retention_data, colWidths=[5 * cm, 3 * cm, 6 * cm])
    table2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.059, 0.094, 0.165)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 1, colors.grey),
    ]))
    story.append(table2)
    story.append(Spacer(1, 10))

    # Section 5: Datensicherung
    story.append(Paragraph("5. Datensicherung und Notfallkonzept", heading_style))
    story.append(Paragraph(
        "Taegliche automatische Backups der Datenbank (PostgreSQL). "
        "Redundante Speicherung auf Hetzner-Servern in Deutschland (DSGVO-konform). "
        "Disaster Recovery mit RPO 24h, RTO 4h.",
        styles["Normal"],
    ))

    doc.build(story)
    return buffer.getvalue()
