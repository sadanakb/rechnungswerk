"""
Migration script: Add EN 16931 compliance fields to the Invoice table.

New fields:
  - iban (BT-84): IBAN for SEPA payment
  - bic (BT-86): BIC/SWIFT code
  - payment_account_name (BT-85): Account holder name
  - buyer_reference (BT-10): Leitweg-ID or purchase order reference
  - seller_endpoint_id (BT-34): Seller electronic address
  - seller_endpoint_scheme: Scheme ID for seller endpoint (default EM)
  - buyer_endpoint_id (BT-49): Buyer electronic address
  - buyer_endpoint_scheme: Scheme ID for buyer endpoint (default EM)

Run with: python migrate_add_compliance_fields.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "app", "data", "rechnungswerk.db")

NEW_COLUMNS = [
    ("iban", "VARCHAR(34)"),
    ("bic", "VARCHAR(11)"),
    ("payment_account_name", "VARCHAR(70)"),
    ("buyer_reference", "VARCHAR(200)"),
    ("seller_endpoint_id", "VARCHAR(200)"),
    ("seller_endpoint_scheme", "VARCHAR(10) DEFAULT 'EM'"),
    ("buyer_endpoint_id", "VARCHAR(200)"),
    ("buyer_endpoint_scheme", "VARCHAR(10) DEFAULT 'EM'"),
]


def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH} — skipping migration (will be created on first run).")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Retrieve existing column names
    cursor.execute("PRAGMA table_info(invoices)")
    existing_columns = {row[1] for row in cursor.fetchall()}

    added = 0
    for col_name, col_type in NEW_COLUMNS:
        if col_name not in existing_columns:
            cursor.execute(f"ALTER TABLE invoices ADD COLUMN {col_name} {col_type}")
            print(f"  Added column '{col_name}'")
            added += 1
        else:
            print(f"  Column '{col_name}' already exists")

    conn.commit()
    conn.close()

    if added:
        print(f"\nMigration complete — {added} column(s) added.")
    else:
        print("\nNothing to migrate — all columns already present.")


if __name__ == "__main__":
    migrate()
