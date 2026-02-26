# Phase 1: Marktreife — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform RechnungsWerk from a functional prototype into a deployable SaaS with auth, payments, landing page, and legal compliance — ready for first paying customers.

**Architecture:** Better Auth for JWT + multi-tenant auth, Stripe + SEPA for payments, Coolify on Hetzner CX22 for deployment. Frontend gets design refresh (Navy + Teal palette, Geist Sans font) and PWA support via Serwist. Landing page as SSG route.

**Tech Stack:** Next.js 16.1 + React 19 + Tailwind v4.2, FastAPI 0.133 + SQLAlchemy 2.0.47 + PostgreSQL 17, Better Auth, Stripe, Serwist, Brevo, PostHog, Coolify

**Timeline:** 4 weeks (Woche 1-4, Maerz 2026)

**Pre-Requisites:**
- Hetzner Cloud Account (hetzner.com/cloud)
- Stripe Account (stripe.com) — beantragen dauert 1-3 Tage
- Domain rechnungswerk.de registrieren
- Brevo Account (brevo.com)

---

## Woche 1-2: Auth + Multi-Tenant + Infra + Design

---

### Task 1: Upgrade Backend Dependencies

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/config.py`

**Step 1: Update requirements.txt**

Add/update these lines in `backend/requirements.txt`:

```
fastapi[standard]==0.133.1
sqlalchemy==2.0.47
psycopg2-binary==2.9.9
alembic==1.14.1
pydantic-settings==2.7.1
```

**Step 2: Install and verify**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pip install -r requirements.txt
```
Expected: All packages install without errors.

**Step 3: Run existing tests to check for breakage**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pytest tests/ -q --tb=short
```
Expected: All 174 tests pass. If FastAPI 0.133 JSON Content-Type enforcement breaks tests, add `headers={"Content-Type": "application/json"}` to failing test requests.

**Step 4: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add backend/requirements.txt
git commit -m "chore: upgrade FastAPI to 0.133, SQLAlchemy to 2.0.47"
```

---

### Task 2: Add User + Organization Models (Multi-Tenant)

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/xxxx_add_user_org_models.py` (via alembic)
- Test: `backend/tests/test_models.py`

**Step 1: Write the failing test**

Create `backend/tests/test_models.py`:

```python
"""Tests for User and Organization models."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base, User, Organization, OrganizationMember, Invoice


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        yield session
    Base.metadata.drop_all(bind=engine)


class TestOrganization:
    def test_create_organization(self, db):
        org = Organization(
            name="Test GmbH",
            slug="test-gmbh",
            vat_id="DE123456789",
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        assert org.id is not None
        assert org.slug == "test-gmbh"

    def test_organization_slug_unique(self, db):
        org1 = Organization(name="A", slug="same-slug")
        org2 = Organization(name="B", slug="same-slug")
        db.add(org1)
        db.commit()
        db.add(org2)
        with pytest.raises(Exception):
            db.commit()


class TestUser:
    def test_create_user(self, db):
        user = User(
            email="test@example.com",
            hashed_password="hashed",
            full_name="Max Mustermann",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        assert user.id is not None
        assert user.email == "test@example.com"

    def test_user_email_unique(self, db):
        u1 = User(email="same@example.com", hashed_password="h1")
        u2 = User(email="same@example.com", hashed_password="h2")
        db.add(u1)
        db.commit()
        db.add(u2)
        with pytest.raises(Exception):
            db.commit()


class TestOrganizationMember:
    def test_add_member_to_org(self, db):
        org = Organization(name="Org", slug="org")
        user = User(email="u@test.de", hashed_password="h")
        db.add_all([org, user])
        db.commit()

        member = OrganizationMember(
            user_id=user.id,
            organization_id=org.id,
            role="owner",
        )
        db.add(member)
        db.commit()
        assert member.role == "owner"


class TestInvoiceOrgRelation:
    def test_invoice_has_organization_id(self, db):
        org = Organization(name="Org", slug="org")
        db.add(org)
        db.commit()

        invoice = Invoice(
            invoice_number="INV-001",
            seller_name="Seller",
            buyer_name="Buyer",
            organization_id=org.id,
        )
        db.add(invoice)
        db.commit()
        assert invoice.organization_id == org.id
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pytest tests/test_models.py -v
```
Expected: FAIL — `ImportError: cannot import name 'User' from 'app.models'`

**Step 3: Add models to models.py**

Add these classes to `backend/app/models.py` (after existing imports, before Invoice class):

```python
class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    vat_id = Column(String(20))
    address = Column(Text)
    logo_url = Column(String(500))
    plan = Column(String(20), default="free")  # free, starter, professional
    stripe_customer_id = Column(String(100))
    stripe_subscription_id = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    members = relationship("OrganizationMember", back_populates="organization")
    invoices = relationship("Invoice", back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(200))
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    memberships = relationship("OrganizationMember", back_populates="user")


class OrganizationMember(Base):
    __tablename__ = "organization_members"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    role = Column(String(20), default="member")  # owner, admin, member
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="memberships")
    organization = relationship("Organization", back_populates="members")
```

And add `organization_id` to the existing `Invoice` model:

```python
# Add to Invoice class (after existing columns):
organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
organization = relationship("Organization", back_populates="invoices")
```

Also add necessary imports if missing: `Boolean`, `ForeignKey`, `relationship`.

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pytest tests/test_models.py -v
```
Expected: All 5 tests PASS.

**Step 5: Run ALL existing tests to check nothing broke**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pytest tests/ -q --tb=short
```
Expected: All 174 + 5 = 179 tests pass. The `organization_id` column is nullable, so existing Invoice tests remain valid.

**Step 6: Generate Alembic migration**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
alembic revision --autogenerate -m "add user organization models"
alembic upgrade head
```

**Step 7: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add backend/app/models.py backend/tests/test_models.py backend/alembic/versions/
git commit -m "feat: add User, Organization, OrganizationMember models with multi-tenant"
```

---

### Task 3: Auth Endpoints (Register, Login, Me)

**Files:**
- Create: `backend/app/routers/auth.py`
- Modify: `backend/app/main.py` (add router)
- Modify: `backend/app/auth_jwt.py` (activate)
- Create: `backend/app/schemas_auth.py`
- Test: `backend/tests/test_auth.py`

**Step 1: Write the failing tests**

Create `backend/tests/test_auth.py`:

```python
"""Tests for auth endpoints: register, login, me."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Base
from app.database import get_db
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestRegister:
    def test_register_success(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "test@example.com",
            "password": "SecurePass123!",
            "full_name": "Max Mustermann",
            "organization_name": "Test GmbH",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["user"]["email"] == "test@example.com"
        assert data["organization"]["name"] == "Test GmbH"
        assert "access_token" in data

    def test_register_duplicate_email(self, client):
        payload = {
            "email": "dup@example.com",
            "password": "SecurePass123!",
            "full_name": "Test",
            "organization_name": "Org",
        }
        client.post("/api/auth/register", json=payload)
        resp = client.post("/api/auth/register", json=payload)
        assert resp.status_code == 409

    def test_register_weak_password(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "test@example.com",
            "password": "123",
            "full_name": "Test",
            "organization_name": "Org",
        })
        assert resp.status_code == 422


class TestLogin:
    def test_login_success(self, client):
        # Register first
        client.post("/api/auth/register", json={
            "email": "login@test.de",
            "password": "SecurePass123!",
            "full_name": "Test",
            "organization_name": "Org",
        })
        # Login
        resp = client.post("/api/auth/login", json={
            "email": "login@test.de",
            "password": "SecurePass123!",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client):
        client.post("/api/auth/register", json={
            "email": "wrong@test.de",
            "password": "SecurePass123!",
            "full_name": "Test",
            "organization_name": "Org",
        })
        resp = client.post("/api/auth/login", json={
            "email": "wrong@test.de",
            "password": "WrongPassword",
        })
        assert resp.status_code == 401


class TestMe:
    def test_get_current_user(self, client):
        # Register
        reg = client.post("/api/auth/register", json={
            "email": "me@test.de",
            "password": "SecurePass123!",
            "full_name": "Max",
            "organization_name": "Org",
        })
        token = reg.json()["access_token"]

        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "me@test.de"
        assert data["organization"]["name"] == "Org"

    def test_me_without_token(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pytest tests/test_auth.py -v
```
Expected: FAIL — Router not found, 404 errors.

**Step 3: Create auth schemas**

Create `backend/app/schemas_auth.py`:

```python
"""Auth request/response schemas."""
from pydantic import BaseModel, EmailStr, field_validator
import re


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    organization_name: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Passwort muss mindestens 8 Zeichen lang sein")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Passwort muss mindestens einen Grossbuchstaben enthalten")
        if not re.search(r"[0-9]", v):
            raise ValueError("Passwort muss mindestens eine Zahl enthalten")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None

    class Config:
        from_attributes = True


class OrganizationResponse(BaseModel):
    id: int
    name: str
    slug: str
    plan: str

    class Config:
        from_attributes = True


class RegisterResponse(BaseModel):
    user: UserResponse
    organization: OrganizationResponse
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: int
    email: str
    full_name: str | None
    organization: OrganizationResponse
    role: str
```

**Step 4: Create auth router**

Create `backend/app/routers/auth.py`:

```python
"""Auth router: register, login, me, refresh."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import re

from app.database import get_db
from app.models import User, Organization, OrganizationMember
from app.auth_jwt import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
)
from app.schemas_auth import (
    RegisterRequest,
    LoginRequest,
    RegisterResponse,
    TokenResponse,
    MeResponse,
    UserResponse,
    OrganizationResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


@router.post("/register", response_model=RegisterResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    # Check duplicate email
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="E-Mail bereits registriert")

    # Create user
    user = User(
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
    )
    db.add(user)
    db.flush()

    # Create organization
    base_slug = _slugify(req.organization_name)
    slug = base_slug
    counter = 1
    while db.query(Organization).filter(Organization.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    org = Organization(name=req.organization_name, slug=slug)
    db.add(org)
    db.flush()

    # Add user as owner
    member = OrganizationMember(
        user_id=user.id,
        organization_id=org.id,
        role="owner",
    )
    db.add(member)
    db.commit()
    db.refresh(user)
    db.refresh(org)

    access_token = create_access_token(
        data={"sub": str(user.id), "org_id": org.id, "role": "owner"}
    )
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    return RegisterResponse(
        user=UserResponse.model_validate(user),
        organization=OrganizationResponse.model_validate(org),
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Ungueltige Anmeldedaten")

    # Get first organization membership
    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .first()
    )
    org_id = member.organization_id if member else None
    role = member.role if member else "member"

    access_token = create_access_token(
        data={"sub": str(user.id), "org_id": org_id, "role": role}
    )
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.get("/me", response_model=MeResponse)
def get_me(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == int(current_user["user_id"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .first()
    )
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()

    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        organization=OrganizationResponse.model_validate(org),
        role=member.role,
    )
```

**Step 5: Update auth_jwt.py with hash_password and verify_password**

Ensure `backend/app/auth_jwt.py` exports these functions. The file already has JWT logic. Add if missing:

```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
```

**Step 6: Register router in main.py**

Add to `backend/app/main.py`:

```python
from app.routers import auth as auth_router
app.include_router(auth_router.router)
```

**Step 7: Run tests**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pytest tests/test_auth.py -v
```
Expected: All 7 tests PASS.

**Step 8: Run ALL tests**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pytest tests/ -q --tb=short
```
Expected: All tests pass (179 + 7 = 186).

**Step 9: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add backend/app/routers/auth.py backend/app/schemas_auth.py backend/app/auth_jwt.py backend/app/main.py backend/tests/test_auth.py
git commit -m "feat: add auth endpoints — register, login, me with JWT + multi-tenant"
```

---

### Task 4: Tenant Isolation Middleware

**Files:**
- Create: `backend/app/middleware/tenant.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_tenant_isolation.py`

**Step 1: Write the failing test**

Create `backend/tests/test_tenant_isolation.py`:

```python
"""Tests that tenant isolation works — users can only see their own org data."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base
from app.database import get_db


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def register_and_get_token(client, email, org_name):
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Test User",
        "organization_name": org_name,
    })
    return resp.json()["access_token"]


class TestTenantIsolation:
    def test_user_sees_only_own_invoices(self, client):
        token_a = register_and_get_token(client, "a@test.de", "Org A")
        token_b = register_and_get_token(client, "b@test.de", "Org B")

        # User A creates an invoice
        client.post(
            "/api/invoices",
            json={
                "invoice_number": "A-001",
                "seller_name": "Seller A",
                "buyer_name": "Buyer A",
                "line_items": [{"description": "Test", "quantity": 1, "unit_price": 100, "net_amount": 100, "tax_rate": 19}],
            },
            headers={"Authorization": f"Bearer {token_a}"},
        )

        # User B lists invoices — should see 0
        resp = client.get(
            "/api/invoices",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 0

    def test_user_sees_own_invoices(self, client):
        token_a = register_and_get_token(client, "own@test.de", "My Org")

        client.post(
            "/api/invoices",
            json={
                "invoice_number": "OWN-001",
                "seller_name": "Seller",
                "buyer_name": "Buyer",
                "line_items": [{"description": "Test", "quantity": 1, "unit_price": 100, "net_amount": 100, "tax_rate": 19}],
            },
            headers={"Authorization": f"Bearer {token_a}"},
        )

        resp = client.get(
            "/api/invoices",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pytest tests/test_tenant_isolation.py -v
```
Expected: FAIL — invoices endpoint doesn't filter by organization.

**Step 3: Add tenant filtering to invoices router**

Modify `backend/app/routers/invoices.py`:

1. Add import: `from app.auth_jwt import get_current_user`
2. Add `Optional` dependency to invoice endpoints:

```python
from fastapi import Depends
from app.auth_jwt import get_current_user
from typing import Optional

# For the list endpoint, add org filtering:
@router.get("/api/invoices")
def list_invoices(
    skip: int = 0,
    limit: int = 50,
    current_user: Optional[dict] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    query = db.query(Invoice)
    if current_user and current_user.get("org_id"):
        query = query.filter(Invoice.organization_id == current_user["org_id"])
    return query.offset(skip).limit(limit).all()
```

Create a helper `get_current_user_optional` that returns None if no auth header is present (backwards-compatible with existing API-key auth).

3. For create endpoint, auto-set `organization_id`:

```python
@router.post("/api/invoices")
def create_invoice(
    data: InvoiceCreate,
    current_user: Optional[dict] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    invoice = Invoice(**data.model_dump())
    if current_user and current_user.get("org_id"):
        invoice.organization_id = current_user["org_id"]
    db.add(invoice)
    db.commit()
    # ... rest of existing logic
```

**Step 4: Run tests**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pytest tests/test_tenant_isolation.py -v
```
Expected: All 2 tests PASS.

**Step 5: Run ALL tests**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pytest tests/ -q --tb=short
```
Expected: All tests pass. Existing tests still work because `get_current_user_optional` returns None when no auth header.

**Step 6: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add backend/app/routers/invoices.py backend/tests/test_tenant_isolation.py
git commit -m "feat: add tenant isolation — invoices filtered by organization_id"
```

---

### Task 5: Frontend Design Refresh — Color Palette + Typography

**Files:**
- Modify: `frontend/app/globals.css`
- Modify: `frontend/components/design-system/tokens.ts`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/package.json` (add Geist font)

**Step 1: Install Geist font**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/frontend
npm install geist
```

**Step 2: Update globals.css with new color palette**

Replace the CSS custom properties in `frontend/app/globals.css` — the `:root` (light) and `[data-theme="dark"]` sections:

Light mode:
```css
:root {
  --background: 248 250 252;      /* slate-50 */
  --foreground: 15 23 42;          /* slate-900 */
  --card: 255 255 255;
  --card-foreground: 15 23 42;
  --primary: 20 184 166;           /* teal-500 */
  --primary-foreground: 255 255 255;
  --accent: 241 245 249;           /* slate-100 */
  --accent-foreground: 15 23 42;
  --destructive: 244 63 94;        /* rose-500 */
  --warning: 245 158 11;           /* amber-500 */
  --border: 226 232 240;           /* slate-200 */
  --input: 226 232 240;
  --sidebar-bg: 255 255 255;
  --sidebar-border: 226 232 240;
  --sidebar-active: 20 184 166;
}
```

Dark mode:
```css
[data-theme="dark"] {
  --background: 15 23 42;          /* slate-900 */
  --foreground: 241 245 249;       /* slate-100 */
  --card: 30 41 59;                /* slate-800 */
  --card-foreground: 241 245 249;
  --primary: 20 184 166;           /* teal-500 */
  --primary-foreground: 15 23 42;
  --accent: 51 65 85;              /* slate-700 */
  --accent-foreground: 241 245 249;
  --destructive: 244 63 94;
  --warning: 245 158 11;
  --border: 51 65 85;              /* slate-700 */
  --input: 51 65 85;
  --sidebar-bg: 30 41 59;          /* slate-800 */
  --sidebar-border: 51 65 85;
  --sidebar-active: 20 184 166;
}
```

**Step 3: Update layout.tsx with Geist font**

```typescript
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'

// In <html> tag:
<html lang="de" className={`${GeistSans.variable} ${GeistMono.variable}`}>
```

And add to Tailwind config or globals.css:
```css
body {
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}
code, pre {
  font-family: var(--font-geist-mono), monospace;
}
```

**Step 4: Update design tokens**

Update `frontend/components/design-system/tokens.ts` colors to match new palette. Primary becomes teal, accent stays emerald for money/success signals.

**Step 5: Build and verify**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/frontend
npm run build
```
Expected: Build succeeds without errors.

**Step 6: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add frontend/app/globals.css frontend/app/layout.tsx frontend/components/design-system/tokens.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: design refresh — navy + teal palette, Geist Sans typography"
```

---

### Task 6: Frontend Auth Pages (Login + Register)

**Files:**
- Create: `frontend/app/login/page.tsx`
- Create: `frontend/app/register/page.tsx`
- Create: `frontend/lib/auth.ts` (auth context + hooks)
- Modify: `frontend/lib/api.ts` (add auth endpoints)
- Modify: `frontend/app/layout.tsx` (add AuthProvider)
- Test: `frontend/__tests__/auth.test.tsx`

**Step 1: Write failing test**

Create `frontend/__tests__/auth.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

// We'll test that auth pages render correctly
describe('Login Page', () => {
  it('renders login form with email and password fields', async () => {
    const LoginPage = (await import('../app/login/page')).default
    render(<LoginPage />)
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/passwort/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /anmelden/i })).toBeInTheDocument()
  })
})

describe('Register Page', () => {
  it('renders registration form', async () => {
    const RegisterPage = (await import('../app/register/page')).default
    render(<RegisterPage />)
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/passwort/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/firmenname/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /registrieren/i })).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/frontend
npx vitest run __tests__/auth.test.tsx
```
Expected: FAIL — modules not found.

**Step 3: Add auth API functions to lib/api.ts**

Add to `frontend/lib/api.ts`:

```typescript
// Auth types
export interface RegisterData {
  email: string
  password: string
  full_name: string
  organization_name: string
}

export interface LoginData {
  email: string
  password: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user?: { id: number; email: string; full_name: string }
  organization?: { id: number; name: string; slug: string; plan: string }
}

// Auth functions
export async function register(data: RegisterData): Promise<AuthResponse> {
  const resp = await api.post('/api/auth/register', data)
  return resp.data
}

export async function login(data: LoginData): Promise<AuthResponse> {
  const resp = await api.post('/api/auth/login', data)
  return resp.data
}

export async function getMe(): Promise<{
  id: number
  email: string
  full_name: string
  organization: { id: number; name: string; slug: string; plan: string }
  role: string
}> {
  const resp = await api.get('/api/auth/me')
  return resp.data
}
```

Also add an auth interceptor to the axios instance:

```typescript
// Add token to all requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('rw-access-token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})
```

**Step 4: Create auth context**

Create `frontend/lib/auth.ts`:

```typescript
'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getMe, login as apiLogin, register as apiRegister, LoginData, RegisterData } from './api'

interface User {
  id: number
  email: string
  full_name: string
  organization: { id: number; name: string; slug: string; plan: string }
  role: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (data: LoginData) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('rw-access-token')
    if (token) {
      getMe()
        .then(setUser)
        .catch(() => localStorage.removeItem('rw-access-token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (data: LoginData) => {
    const resp = await apiLogin(data)
    localStorage.setItem('rw-access-token', resp.access_token)
    localStorage.setItem('rw-refresh-token', resp.refresh_token)
    const me = await getMe()
    setUser(me)
  }

  const register = async (data: RegisterData) => {
    const resp = await apiRegister(data)
    localStorage.setItem('rw-access-token', resp.access_token)
    localStorage.setItem('rw-refresh-token', resp.refresh_token)
    const me = await getMe()
    setUser(me)
  }

  const logout = () => {
    localStorage.removeItem('rw-access-token')
    localStorage.removeItem('rw-refresh-token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
```

**Step 5: Create Login page**

Create `frontend/app/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login({ email, password })
      router.push('/')
    } catch {
      setError('Ungueltige Anmeldedaten')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ backgroundColor: 'rgb(var(--background))' }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Anmelden</h1>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--foreground) / 0.6)' }}>
            Melde dich bei RechnungsWerk an
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="E-Mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Passwort"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Wird angemeldet...' : 'Anmelden'}
          </Button>
        </form>

        <p className="text-center text-sm" style={{ color: 'rgb(var(--foreground) / 0.6)' }}>
          Noch kein Konto?{' '}
          <Link href="/register" className="font-medium" style={{ color: 'rgb(var(--primary))' }}>
            Registrieren
          </Link>
        </p>
      </div>
    </div>
  )
}
```

**Step 6: Create Register page**

Create `frontend/app/register/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function RegisterPage() {
  const { register } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    organization_name: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(form)
      router.push('/')
    } catch {
      setError('Registrierung fehlgeschlagen. Bitte versuche es erneut.')
    } finally {
      setLoading(false)
    }
  }

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ backgroundColor: 'rgb(var(--background))' }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Konto erstellen</h1>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--foreground) / 0.6)' }}>
            Starte kostenlos mit RechnungsWerk
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Vollstaendiger Name"
            value={form.full_name}
            onChange={update('full_name')}
            required
          />
          <Input
            label="Firmenname"
            value={form.organization_name}
            onChange={update('organization_name')}
            required
          />
          <Input
            label="E-Mail"
            type="email"
            value={form.email}
            onChange={update('email')}
            required
          />
          <Input
            label="Passwort"
            type="password"
            value={form.password}
            onChange={update('password')}
            hint="Mindestens 8 Zeichen, 1 Grossbuchstabe, 1 Zahl"
            required
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Wird erstellt...' : 'Registrieren'}
          </Button>
        </form>

        <p className="text-center text-sm" style={{ color: 'rgb(var(--foreground) / 0.6)' }}>
          Bereits ein Konto?{' '}
          <Link href="/login" className="font-medium" style={{ color: 'rgb(var(--primary))' }}>
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  )
}
```

**Step 7: Wrap layout with AuthProvider**

Modify `frontend/app/layout.tsx` — wrap children with `<AuthProvider>`.

**Step 8: Run tests**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/frontend
npx vitest run __tests__/auth.test.tsx
```
Expected: Both tests PASS.

**Step 9: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add frontend/app/login/ frontend/app/register/ frontend/lib/auth.ts frontend/lib/api.ts frontend/app/layout.tsx frontend/__tests__/auth.test.tsx
git commit -m "feat: add login + register pages with auth context and JWT flow"
```

---

### Task 7: AGPL License + Feature Gating

**Files:**
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `backend/app/feature_gate.py`
- Modify: `backend/app/config.py`

**Step 1: Create LICENSE file**

Create `LICENSE` in project root with AGPL-3.0 text. Use the standard AGPL-3.0-or-later text from https://www.gnu.org/licenses/agpl-3.0.txt.

**Step 2: Create CONTRIBUTING.md**

Create `CONTRIBUTING.md`:

```markdown
# Contributing to RechnungsWerk

Vielen Dank fuer dein Interesse an RechnungsWerk!

## Lizenz

Dieses Projekt steht unter der AGPL-3.0 Lizenz. Durch das Einreichen von Beitraegen stimmst du zu, dass dein Code unter dieser Lizenz veroeffentlicht wird.

## Wie du beitragen kannst

1. Fork das Repository
2. Erstelle einen Feature Branch (`git checkout -b feature/mein-feature`)
3. Committe deine Aenderungen (`git commit -m 'feat: beschreibung'`)
4. Push zum Branch (`git push origin feature/mein-feature`)
5. Oeffne einen Pull Request

## Code Style

- Backend: Python — Ruff Linting (E, W, F rules)
- Frontend: TypeScript — ESLint
- Commits: Conventional Commits (feat:, fix:, chore:, docs:)

## Tests

Stelle sicher, dass alle Tests bestehen:

```bash
# Backend
cd backend && pytest tests/ -q

# Frontend
cd frontend && npx vitest run
```
```

**Step 3: Create feature gate**

Create `backend/app/feature_gate.py`:

```python
"""Feature gating for Free/Starter/Professional tiers."""
from fastapi import HTTPException, Depends
from app.auth_jwt import get_current_user
from functools import wraps

PLAN_LIMITS = {
    "free": {
        "max_invoices_per_month": 5,
        "max_contacts": 10,
        "datev_export": False,
        "mahnwesen": False,
        "banking": False,
        "ustva": False,
        "team": False,
        "api_access": False,
        "priority_support": False,
    },
    "starter": {
        "max_invoices_per_month": -1,  # unlimited
        "max_contacts": -1,
        "datev_export": True,
        "mahnwesen": True,
        "banking": False,
        "ustva": False,
        "team": False,
        "api_access": True,
        "priority_support": False,
    },
    "professional": {
        "max_invoices_per_month": -1,
        "max_contacts": -1,
        "datev_export": True,
        "mahnwesen": True,
        "banking": True,
        "ustva": True,
        "team": True,
        "api_access": True,
        "priority_support": True,
    },
}


def require_plan(feature: str):
    """Dependency that checks if user's org plan allows the feature."""
    def dependency(current_user: dict = Depends(get_current_user)):
        plan = current_user.get("plan", "free")
        limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
        if not limits.get(feature, False):
            raise HTTPException(
                status_code=403,
                detail=f"Feature '{feature}' erfordert ein Upgrade. Aktueller Plan: {plan}",
            )
        return current_user
    return dependency
```

**Step 4: Add CLOUD_MODE to config**

Add to `backend/app/config.py`:

```python
cloud_mode: bool = True  # False for self-hosted, True for SaaS
```

**Step 5: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add LICENSE CONTRIBUTING.md backend/app/feature_gate.py backend/app/config.py
git commit -m "feat: add AGPL-3.0 license, contributing guide, feature gating for tiers"
```

---

### Task 8: PWA Setup with Serwist

**Files:**
- Modify: `frontend/package.json` (add serwist deps)
- Create: `frontend/app/sw.ts` (service worker)
- Create: `frontend/app/manifest.ts` (web manifest)
- Modify: `frontend/next.config.mjs` (add serwist plugin)

**Step 1: Install Serwist**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/frontend
npm install @serwist/next serwist
```

**Step 2: Create service worker**

Create `frontend/app/sw.ts`:

```typescript
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})

serwist.addEventListeners()
```

**Step 3: Create manifest**

Create `frontend/app/manifest.ts`:

```typescript
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RechnungsWerk',
    short_name: 'RechnungsWerk',
    description: 'E-Rechnungen erstellen — XRechnung & ZUGFeRD konform',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#14b8a6',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
```

**Step 4: Update next.config.mjs**

```javascript
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
})

export default withSerwist({
  reactStrictMode: true,
})
```

Note: Serwist requires Webpack. For dev, keep using Turbopack (`next dev`). For production, build with `next build` (uses Webpack by default since next.config has Serwist plugin).

**Step 5: Build and verify PWA**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/frontend
npm run build
```
Expected: Build succeeds, `public/sw.js` is generated.

**Step 6: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add frontend/app/sw.ts frontend/app/manifest.ts frontend/next.config.mjs frontend/package.json frontend/package-lock.json
git commit -m "feat: add PWA support with Serwist — offline caching, manifest, service worker"
```

---

## Woche 3: Landing Page + Marketing-Seiten

---

### Task 9: Landing Page (SSG, Conversion-Optimized)

**Files:**
- Create: `frontend/app/(marketing)/layout.tsx` (no sidebar)
- Create: `frontend/app/(marketing)/page.tsx` (landing page)
- Create: `frontend/app/(marketing)/preise/page.tsx` (pricing)
- Modify: `frontend/app/layout.tsx` (restructure for route groups)

**Step 1: Restructure routes with route groups**

Move the existing app pages into a `(dashboard)` route group so the sidebar only shows for logged-in pages:

```
frontend/app/
  (marketing)/           <- No sidebar, SSG
    layout.tsx           <- Clean marketing layout
    page.tsx             <- Landing page
    preise/page.tsx      <- Pricing page
    blog/[slug]/page.tsx <- Blog (later)
  (dashboard)/           <- With sidebar, requires auth
    layout.tsx           <- Dashboard layout with SidebarNav
    dashboard/page.tsx   <- Current homepage
    invoices/page.tsx
    ocr/page.tsx
    ... other app pages
  login/page.tsx         <- No sidebar
  register/page.tsx      <- No sidebar
  layout.tsx             <- Root layout (fonts, providers)
```

**Step 2: Create marketing layout**

Create `frontend/app/(marketing)/layout.tsx`:

```tsx
import type { ReactNode } from 'react'

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'rgb(var(--background))' }}>
      {/* Marketing header */}
      <header className="sticky top-0 z-50 border-b backdrop-blur-md"
              style={{
                borderColor: 'rgb(var(--border))',
                backgroundColor: 'rgb(var(--background) / 0.8)',
              }}>
        <nav className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
          <a href="/" className="text-xl font-bold">RechnungsWerk</a>
          <div className="flex items-center gap-6">
            <a href="/preise" className="text-sm font-medium hover:opacity-80">Preise</a>
            <a href="/blog" className="text-sm font-medium hover:opacity-80">Blog</a>
            <a href="/login" className="text-sm font-medium hover:opacity-80">Anmelden</a>
            <a href="/register"
               className="rounded-lg px-4 py-2 text-sm font-medium"
               style={{
                 backgroundColor: 'rgb(var(--primary))',
                 color: 'rgb(var(--primary-foreground))',
               }}>
              Kostenlos testen
            </a>
          </div>
        </nav>
      </header>
      {children}
    </div>
  )
}
```

**Step 3: Create landing page**

Create `frontend/app/(marketing)/page.tsx` — this is the public homepage. SSG by default (no 'use client').

The page should contain:
1. Hero section (headline, subheading, CTA)
2. Trust bar (badges: XRechnung konform, DSGVO, Open Source, Made in Germany)
3. Problem statement (E-Rechnungspflicht timeline)
4. Feature showcase (4 key features in Bento Grid)
5. Pricing preview (3 tiers)
6. Open Source section (GitHub link)
7. FAQ (JSON-LD FAQPage schema)
8. Final CTA

Include JSON-LD structured data:

```tsx
export const metadata = {
  title: 'RechnungsWerk — E-Rechnungen erstellen | XRechnung & ZUGFeRD',
  description: 'Erstelle XRechnung und ZUGFeRD konforme E-Rechnungen. Open Source. Ab 9 EUR/Monat. GoBD-konform. DATEV-Export.',
  openGraph: {
    title: 'RechnungsWerk — E-Rechnungen in 30 Sekunden',
    description: 'XRechnung & ZUGFeRD konform. Open Source. Ab 9 EUR/Monat.',
    type: 'website',
    locale: 'de_DE',
  },
}
```

And at the bottom of the page component, render JSON-LD:

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'RechnungsWerk',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      offers: [
        { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'EUR' },
        { '@type': 'Offer', name: 'Starter', price: '9.90', priceCurrency: 'EUR', billingIncrement: 'P1M' },
        { '@type': 'Offer', name: 'Professional', price: '19.90', priceCurrency: 'EUR', billingIncrement: 'P1M' },
      ],
    }),
  }}
/>
```

**Implementation note:** The landing page is a large component. The executing agent should use the `frontend-design` skill for the actual implementation to ensure high visual quality.

**Step 4: Create pricing page**

Create `frontend/app/(marketing)/preise/page.tsx` — feature comparison matrix with 3 tiers. SSG. Include FAQPage JSON-LD.

**Step 5: Build and verify**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/frontend
npm run build
```
Expected: Build succeeds. Landing page and pricing page are statically generated.

**Step 6: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add frontend/app/
git commit -m "feat: add landing page + pricing page with SSG, JSON-LD, marketing layout"
```

---

### Task 10: SEO Foundation

**Files:**
- Create: `frontend/app/sitemap.ts`
- Create: `frontend/app/robots.ts`
- Create: `frontend/public/llms.txt`
- Modify: `frontend/app/(marketing)/layout.tsx` (add Organization schema)

**Step 1: Create sitemap.ts**

```typescript
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://rechnungswerk.de'

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${baseUrl}/preise`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
  ]
}
```

**Step 2: Create robots.ts**

```typescript
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/invoices/', '/ocr/', '/manual/', '/settings/'],
      },
    ],
    sitemap: 'https://rechnungswerk.de/sitemap.xml',
  }
}
```

**Step 3: Create llms.txt**

Create `frontend/public/llms.txt`:

```
# RechnungsWerk

> E-Rechnungssoftware fuer Deutschland. Open Source (AGPL-3.0).

## Was ist RechnungsWerk?

RechnungsWerk ist eine Open-Source E-Rechnungssoftware fuer den deutschen Markt.
Sie unterstuetzt XRechnung 3.0.2 und ZUGFeRD 2.3.3 (EN 16931 konform).

## Preise

- Free: 0 EUR/Monat (5 Rechnungen, XRechnung + ZUGFeRD)
- Starter: 9,90 EUR/Monat (unbegrenzt, DATEV-Export, Mahnwesen)
- Professional: 19,90 EUR/Monat (Banking, UStVA, Team, API)
- Self-Hosted: Kostenlos (AGPL-3.0 auf GitHub)

## Links

- Website: https://rechnungswerk.de
- GitHub: https://github.com/sadanakb/rechnungswerk
- Dokumentation: https://rechnungswerk.de/docs
```

**Step 4: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add frontend/app/sitemap.ts frontend/app/robots.ts frontend/public/llms.txt
git commit -m "feat: add SEO foundation — sitemap, robots.txt, llms.txt"
```

---

### Task 11: Blog Scaffold (MDX)

**Files:**
- Install: `@next/mdx`, `@mdx-js/react`
- Create: `frontend/app/(marketing)/blog/page.tsx` (blog index)
- Create: `frontend/app/(marketing)/blog/[slug]/page.tsx` (blog post)
- Create: `frontend/content/blog/e-rechnungspflicht-2025.mdx` (first article)
- Modify: `frontend/next.config.mjs` (MDX support)

**Step 1: Install MDX deps**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/frontend
npm install @next/mdx @mdx-js/react gray-matter
```

**Step 2: Create blog structure**

The blog uses filesystem-based MDX with gray-matter for frontmatter parsing. Blog index page lists all posts. Individual post pages render MDX content with SSG via `generateStaticParams()`.

**Step 3: Write first article**

Create `frontend/content/blog/e-rechnungspflicht-2025.mdx` — "E-Rechnungspflicht 2025-2028: Der komplette Guide fuer KMUs". 1.500-2.000 words covering the three-phase timeline, who's affected, exemptions, and what businesses need to do now.

Include FAQ section at the bottom for FAQPage JSON-LD.

**Step 4: Build and verify**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/frontend
npm run build
```

**Step 5: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add frontend/app/\(marketing\)/blog/ frontend/content/ frontend/next.config.mjs frontend/package.json frontend/package-lock.json
git commit -m "feat: add MDX blog scaffold with first article on E-Rechnungspflicht"
```

---

## Woche 4: Legal + Payment + Deploy

---

### Task 12: Stripe Integration (Checkout + SEPA + Webhooks)

**Files:**
- Create: `backend/app/routers/billing.py`
- Create: `backend/app/stripe_service.py`
- Modify: `backend/requirements.txt` (add stripe)
- Test: `backend/tests/test_billing.py`

**Step 1: Install Stripe**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pip install stripe
echo "stripe==11.5.0" >> requirements.txt
```

**Step 2: Write failing tests**

Create `backend/tests/test_billing.py`:

```python
"""Tests for billing endpoints."""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app


class TestCreateCheckout:
    @patch("app.stripe_service.stripe.checkout.Session.create")
    def test_create_checkout_session(self, mock_create, client):
        mock_create.return_value = MagicMock(url="https://checkout.stripe.com/test")
        # Register and get token
        reg = client.post("/api/auth/register", json={
            "email": "pay@test.de",
            "password": "SecurePass123!",
            "full_name": "Test",
            "organization_name": "Pay Org",
        })
        token = reg.json()["access_token"]

        resp = client.post(
            "/api/billing/checkout",
            json={"plan": "starter"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert "url" in resp.json()
```

**Step 3: Implement stripe_service.py and billing router**

Create `backend/app/stripe_service.py`:

```python
"""Stripe payment integration."""
import stripe
from app.config import settings

stripe.api_key = settings.stripe_secret_key

PRICE_IDS = {
    "starter_monthly": settings.stripe_starter_price_id,
    "starter_yearly": settings.stripe_starter_yearly_price_id,
    "professional_monthly": settings.stripe_pro_price_id,
    "professional_yearly": settings.stripe_pro_yearly_price_id,
}

def create_checkout_session(
    customer_email: str,
    plan: str,
    billing_cycle: str = "monthly",
    success_url: str = "https://rechnungswerk.de/dashboard?upgraded=true",
    cancel_url: str = "https://rechnungswerk.de/preise",
) -> str:
    price_key = f"{plan}_{billing_cycle}"
    price_id = PRICE_IDS.get(price_key)
    if not price_id:
        raise ValueError(f"Unknown plan: {price_key}")

    session = stripe.checkout.Session.create(
        mode="subscription",
        payment_method_types=["card", "sepa_debit"],
        line_items=[{"price": price_id, "quantity": 1}],
        customer_email=customer_email,
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return session.url
```

Create `backend/app/routers/billing.py` with:
- `POST /api/billing/checkout` — create Stripe Checkout session
- `POST /api/billing/webhook` — handle Stripe webhooks (subscription created/updated/deleted)
- `GET /api/billing/portal` — create Stripe Customer Portal session

**Step 4: Add Stripe config to settings**

Add to `backend/app/config.py`:

```python
stripe_secret_key: str = ""
stripe_webhook_secret: str = ""
stripe_starter_price_id: str = ""
stripe_starter_yearly_price_id: str = ""
stripe_pro_price_id: str = ""
stripe_pro_yearly_price_id: str = ""
```

**Step 5: Run tests**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pytest tests/test_billing.py -v
```

**Step 6: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add backend/app/routers/billing.py backend/app/stripe_service.py backend/app/config.py backend/requirements.txt backend/tests/test_billing.py backend/app/main.py
git commit -m "feat: add Stripe integration — checkout, SEPA, webhooks, customer portal"
```

---

### Task 13: Docker Compose for Production

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `.env.production.example`

**Step 1: Create backend Dockerfile**

Create `backend/Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# System deps for OCR + PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-deu \
    libpango1.0-dev libharfbuzz-dev libffi-dev \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p data/uploads data/output data/archive

EXPOSE 8001

CMD ["gunicorn", "app.main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8001"]
```

**Step 2: Create frontend Dockerfile**

Create `frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3001

CMD ["node", "server.js"]
```

Note: Requires `output: 'standalone'` in next.config.mjs.

**Step 3: Create docker-compose.yml**

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: rechnungswerk
      POSTGRES_USER: rw
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rw"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://rw:${DB_PASSWORD}@db:5432/rechnungswerk
      REDIS_URL: redis://redis:6379
      REQUIRE_API_KEY: "false"
      ALLOWED_ORIGINS: '["https://rechnungswerk.de"]'
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "8001:8001"

  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: https://api.rechnungswerk.de
    ports:
      - "3001:3001"

  uptime-kuma:
    image: louislam/uptime-kuma:1
    ports:
      - "3002:3001"
    volumes:
      - uptime-data:/app/data

volumes:
  pgdata:
  uptime-data:
```

**Step 4: Create .env.production.example**

```env
DB_PASSWORD=change-me-to-secure-password
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
```

**Step 5: Test build**

Run:
```bash
cd /Users/sadanakb/rechnungswerk
docker compose build
```
Expected: Both images build successfully.

**Step 6: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add docker-compose.yml backend/Dockerfile frontend/Dockerfile .env.production.example
git commit -m "feat: add Docker Compose production setup — PostgreSQL 17, Redis, Uptime Kuma"
```

---

### Task 14: Rechtstexte + Cookie Banner

**Files:**
- Create: `frontend/app/(marketing)/impressum/page.tsx`
- Create: `frontend/app/(marketing)/datenschutz/page.tsx`
- Create: `frontend/app/(marketing)/agb/page.tsx`
- Create: `frontend/components/CookieBanner.tsx`
- Modify: `frontend/app/layout.tsx` (add CookieBanner)

**Step 1: Create Impressum page**

SSG page with legal disclosure. Content must include: Firmenname, Anschrift, Kontakt (Email, Telefon), Verantwortlich gemaess § 18 MStV, USt-IdNr.

**Step 2: Create Datenschutz page**

SSG page. Use IT-Recht Kanzlei generator output (5,90 EUR/Mo). Content covers: Verantwortlicher, Rechtsgrundlagen, Datenkategorien, Drittanbieter (Stripe, Brevo, PostHog), Betroffenenrechte, Aufbewahrungsfristen.

**Step 3: Create AGB placeholder**

SSG page with notice: "Unsere AGB werden derzeit anwaltlich erstellt und in Kuerze veroeffentlicht."

**Step 4: Create Cookie Banner**

Minimal cookie banner since PostHog (self-hosted) is cookieless. Only needed if Stripe or other third-party scripts set cookies.

```tsx
'use client'

import { useState, useEffect } from 'react'

export function CookieBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('rw-cookies-accepted')) {
      setShow(true)
    }
  }, [])

  if (!show) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 border-t"
         style={{
           backgroundColor: 'rgb(var(--card))',
           borderColor: 'rgb(var(--border))',
         }}>
      <div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
        <p className="text-sm">
          Diese Website verwendet technisch notwendige Cookies.{' '}
          <a href="/datenschutz" className="underline">Datenschutzerklaerung</a>
        </p>
        <button
          onClick={() => {
            localStorage.setItem('rw-cookies-accepted', 'true')
            setShow(false)
          }}
          className="rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap"
          style={{
            backgroundColor: 'rgb(var(--primary))',
            color: 'rgb(var(--primary-foreground))',
          }}>
          Verstanden
        </button>
      </div>
    </div>
  )
}
```

**Step 5: Add footer with legal links to marketing layout**

Add to `frontend/app/(marketing)/layout.tsx`:

```tsx
<footer className="border-t py-12 mt-20" style={{ borderColor: 'rgb(var(--border))' }}>
  <div className="mx-auto max-w-6xl px-6 flex flex-wrap gap-8 text-sm">
    <a href="/impressum">Impressum</a>
    <a href="/datenschutz">Datenschutz</a>
    <a href="/agb">AGB</a>
    <span>© 2026 RechnungsWerk. AGPL-3.0 Lizenz.</span>
  </div>
</footer>
```

**Step 6: Commit**

```bash
cd /Users/sadanakb/rechnungswerk
git add frontend/app/\(marketing\)/impressum/ frontend/app/\(marketing\)/datenschutz/ frontend/app/\(marketing\)/agb/ frontend/components/CookieBanner.tsx frontend/app/layout.tsx
git commit -m "feat: add Impressum, Datenschutz, AGB pages + cookie banner"
```

---

## Phase 2-3: Outline (Separate Plans)

These phases will be planned in detail after Phase 1 is deployed:

### Phase 2: Features + SEO (Woche 5-8)
- **Task 15:** Automatic Mahnwesen (3-stage dunning system)
- **Task 16:** TanStack Table for invoice lists
- **Task 17:** cmdk Command Palette
- **Task 18:** Onboarding Wizard (4-step)
- **Task 19:** AI Migration (Ollama -> Mistral OCR + Claude Haiku API)
- **Task 20:** pSEO Engine (Branchen, Bundeslaender, Vergleiche)
- **Task 21:** Blog articles (4 pillar posts)
- **Task 22:** Newsletter setup (Brevo)
- **Task 23:** GEO optimization (attribute-rich JSON-LD)

### Phase 3: Launch + Growth (Woche 9-12)
- **Task 24:** GitHub repo public (README, templates, discussions)
- **Task 25:** Product Hunt preparation
- **Task 26:** Product Hunt + parallel launches
- **Task 27:** PostHog analytics + feature flags
- **Task 28:** Certifications start (HubSpot, Google Analytics)
- **Task 29:** Performance optimization (Core Web Vitals)
- **Task 30:** Iteration based on user feedback

---

## Verification Checklist (End of Phase 1)

Before declaring Phase 1 complete, verify:

- [ ] `pytest tests/ -q` — all backend tests pass
- [ ] `npx vitest run` — all frontend tests pass
- [ ] `npm run build` — frontend builds without errors
- [ ] `docker compose up` — all services start and are healthy
- [ ] Register a new user -> login -> create invoice -> verify tenant isolation
- [ ] Landing page loads at / with correct JSON-LD schema
- [ ] Pricing page shows 3 tiers with correct EUR prices
- [ ] Stripe Checkout redirects correctly
- [ ] PWA installable from Chrome (manifest detected)
- [ ] Impressum, Datenschutz pages accessible
- [ ] robots.txt blocks /api/ and /dashboard/
- [ ] sitemap.xml lists all public pages
