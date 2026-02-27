# Phase 4: Completeness & Production Polish — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete all critical user flows (account management, email verification, password reset, Stripe billing) and polish existing features (Mahnwesen, settings, team management) to production quality.

**Architecture:** Backend-first approach — implement missing API endpoints, then wire frontend. Brevo transactional emails for auth flows. Stripe webhooks for billing state sync.

**Tech Stack:** Python 3.13 + FastAPI, Next.js 16 + React 19, Stripe API, Brevo transactional API, Alembic migrations

---

## Task 1: User Profile Endpoints (Backend)

**Files:**
- Create: `backend/app/routers/users.py`
- Modify: `backend/app/main.py` (register router)
- Create: `backend/tests/test_users.py`

**What to build:**
- `GET /api/users/me` — Return current user profile (id, email, full_name, is_verified, created_at, organization)
- `PATCH /api/users/me` — Update full_name and/or password (with current_password verification)
- Use existing `get_current_user` dependency from `app.auth`
- Password change requires `current_password` + `new_password` fields
- Hash new password with `bcrypt_sha256` (same as registration in `app/auth.py`)

**Tests:**
- test_get_profile_returns_user_data
- test_update_full_name
- test_change_password_correct_old
- test_change_password_wrong_old_rejected
- test_unauthenticated_rejected

---

## Task 2: Wire Settings Page to Backend

**Files:**
- Modify: `frontend/app/(dashboard)/settings/page.tsx` (replace TODOs with API calls)
- Modify: `frontend/lib/api.ts` (add user profile endpoints if needed)

**What to build:**
- Account tab: Wire "Speichern" button to `PATCH /api/users/me` for name + password
- Organization tab: Wire to existing `PATCH /api/onboarding/company`
- Show success/error toast after save
- Load current user data on page mount via `GET /api/users/me`

---

## Task 3: Forgot Password & Reset Flow (Backend + Frontend)

**Files:**
- Modify: `backend/app/routers/auth.py` (add forgot-password, reset-password endpoints)
- Modify: `backend/app/models.py` (add password_reset_token, password_reset_expires fields to User)
- Create: `backend/app/email_service.py` (transactional email via Brevo)
- Create: `frontend/app/(marketing)/passwort-vergessen/page.tsx`
- Create: `frontend/app/(marketing)/passwort-zuruecksetzen/page.tsx`
- Create: `backend/tests/test_password_reset.py`

**What to build:**
- `POST /api/auth/forgot-password` — Accept email, generate token (secrets.token_urlsafe), store hashed token + expiry (1h), send reset link via Brevo
- `POST /api/auth/reset-password` — Accept token + new_password, verify token not expired, update password, invalidate token
- Frontend: Simple form pages matching existing design system (navy/teal theme)
- Email service: Brevo transactional API (sib_api_v3_sdk.TransactionalEmailsApi)

**Tests:**
- test_forgot_password_sends_email (mock Brevo)
- test_forgot_password_unknown_email_no_error (prevent enumeration)
- test_reset_password_valid_token
- test_reset_password_expired_token_rejected
- test_reset_password_invalid_token_rejected

---

## Task 4: Email Verification Flow (Backend + Frontend)

**Files:**
- Modify: `backend/app/routers/auth.py` (add send-verification, verify-email endpoints)
- Modify: `backend/app/models.py` (add email_verification_token field to User)
- Modify: `backend/app/email_service.py` (add verification email template)
- Create: `frontend/app/(marketing)/email-verifizieren/page.tsx`
- Create: `backend/tests/test_email_verification.py`

**What to build:**
- `POST /api/auth/send-verification-email` — Generate token, send verification link
- `POST /api/auth/verify-email` — Accept token, set is_verified=True
- Modify registration to auto-send verification email
- Frontend: Verification landing page that auto-submits token from URL query param
- Note: Do NOT block login for unverified users (soft enforcement — show banner instead)

**Tests:**
- test_register_sends_verification_email (mock Brevo)
- test_verify_email_valid_token
- test_verify_email_invalid_token
- test_resend_verification

---

## Task 5: Stripe Billing Completion (Backend)

**Files:**
- Modify: `backend/app/routers/billing.py` (complete webhook handler, add portal/subscription endpoints)
- Modify: `backend/app/stripe_service.py` (add portal session, subscription lookup)
- Modify: `backend/app/models.py` (add stripe_customer_id, stripe_subscription_id, plan_status to Organization)
- Create: `backend/tests/test_billing_webhooks.py`

**What to build:**
- `GET /api/billing/subscription` — Return current plan, status, period end
- `POST /api/billing/portal` — Create Stripe Customer Portal session, return URL
- Complete webhook handler for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
- Sync subscription state to Organization model
- Feature gate checks read from Organization.plan field

**Tests:**
- test_get_subscription_status
- test_create_portal_session
- test_webhook_checkout_completed
- test_webhook_subscription_cancelled
- test_webhook_signature_invalid_rejected

---

## Task 6: Wire Settings Billing Tab to Stripe

**Files:**
- Modify: `frontend/app/(dashboard)/settings/page.tsx` (billing tab)

**What to build:**
- Load subscription status from `GET /api/billing/subscription`
- Show current plan name, status badge (active/cancelled/past_due), next billing date
- "Plan aendern" button → redirect to Stripe Customer Portal via `POST /api/billing/portal`
- "Upgrade" CTA for free tier users → redirect to checkout
- Show invoice history (or link to Stripe portal)

---

## Task 7: Mahnwesen Email Sending & Polish

**Files:**
- Modify: `backend/app/routers/mahnwesen.py` (add email sending on Mahnung creation)
- Modify: `backend/app/email_service.py` (add Mahnung email templates)
- Modify: `frontend/app/(dashboard)/mahnwesen/page.tsx` (complete UI)
- Create: `backend/tests/test_mahnwesen_email.py`

**What to build:**
- When POST creates a Mahnung, optionally send email to customer (if email provided)
- 3 email templates: Zahlungserinnerung (friendly), 1. Mahnung (formal), 2. Mahnung (urgent + fees)
- Frontend: Complete mahnwesen list with status badges, action buttons, email preview
- Add `status` field to Mahnung model: created, sent, paid, cancelled

**Tests:**
- test_create_mahnung_sends_email (mock Brevo)
- test_create_mahnung_no_email_skips_send
- test_mahnung_status_transitions

---

## Task 8: Team Management UI (Professional Plan)

**Files:**
- Create: `backend/app/routers/teams.py`
- Create: `frontend/app/(dashboard)/team/page.tsx`
- Modify: `frontend/components/layout/SidebarNav.tsx` (add Team link for professional)
- Create: `backend/tests/test_teams.py`

**What to build:**
- `GET /api/teams/members` — List organization members with roles
- `POST /api/teams/invite` — Send email invitation (generate invite token)
- `DELETE /api/teams/members/{user_id}` — Remove member (owner only)
- `PATCH /api/teams/members/{user_id}` — Change role (owner only)
- Frontend: Members table, invite form, role badges
- Feature-gated behind `team` feature (professional plan only)

**Tests:**
- test_list_members
- test_invite_member_sends_email
- test_remove_member_owner_only
- test_free_plan_blocked

---

## Task 9: Alembic Migration for Phase 4 Models

**Files:**
- Create: `backend/alembic/versions/xxxx_phase4_user_billing_team.py`

**What to build:**
- Add to User: `password_reset_token`, `password_reset_expires`, `email_verification_token`
- Add to Organization: `stripe_customer_id`, `stripe_subscription_id`, `plan_status`
- Add to Mahnung: `status` (default: 'created'), `sent_at`
- Create: `team_invitations` table (id, org_id, email, token, role, expires_at, accepted_at)
- Use batch_alter_table for SQLite compatibility

---

## Task 10: Manual Invoice Validation Feedback

**Files:**
- Modify: `frontend/app/(dashboard)/manual/page.tsx`

**What to build:**
- Add inline field validation (required fields highlighted, format checks for amounts/dates)
- Show validation summary before submission
- After creation: Show success toast with link to created invoice
- Highlight missing Pflichtfelder with red border + error message

---

## Task 11: Analytics Page Enhancements

**Files:**
- Modify: `backend/app/routers/analytics.py` (add endpoints)
- Modify: `frontend/app/(dashboard)/analytics/page.tsx`

**What to build:**
- `GET /api/analytics/top-suppliers` — Top 5 suppliers by invoice volume
- `GET /api/analytics/category-breakdown` — Revenue by category/tax rate
- Frontend: Add top suppliers bar chart, category pie chart, date range selector
- Add export button (CSV download of analytics data)

---

## Task 12: E2E Tests & Final Verification

**Files:**
- Modify: `frontend/e2e/auth.spec.ts` (add password reset, settings tests)
- Create: `frontend/e2e/settings.spec.ts`
- Create: `frontend/e2e/mahnwesen.spec.ts`

**What to build:**
- E2E: Forgot password page renders, form submits
- E2E: Settings page loads, tabs switch
- E2E: Mahnwesen page renders
- Run full test suite (backend + frontend + build)
- Update CHANGELOG with v0.4.0 entry
