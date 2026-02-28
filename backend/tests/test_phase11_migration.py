from app.models import PushSubscription, GdprDeleteRequest


def test_push_subscription_model_columns():
    cols = {c.name for c in PushSubscription.__table__.columns}
    assert "fcm_token" in cols
    assert "user_id" in cols
    assert "organization_id" in cols
    assert "device_label" in cols
    assert "created_at" in cols


def test_gdpr_delete_request_model_columns():
    cols = {c.name for c in GdprDeleteRequest.__table__.columns}
    assert "token" in cols
    assert "user_id" in cols
    assert "expires_at" in cols
    assert "created_at" in cols
