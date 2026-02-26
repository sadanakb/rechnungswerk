"""GoBD compliance report router."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth_jwt import get_current_user
from app.models import Organization, OrganizationMember
from app.gobd_report import generate_gobd_report

router = APIRouter(prefix="/api/gobd", tags=["gobd"])


@router.get("/report")
def get_report(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate and return a GoBD Verfahrensdokumentation PDF.

    Requires authentication. Uses the authenticated user's organization
    name to personalize the compliance report.
    """
    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == int(current_user["user_id"]))
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")

    org = (
        db.query(Organization)
        .filter(Organization.id == member.organization_id)
        .first()
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organisation nicht gefunden")

    pdf_bytes = generate_gobd_report(org.name)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Verfahrensdokumentation_{org.slug}.pdf"',
        },
    )
