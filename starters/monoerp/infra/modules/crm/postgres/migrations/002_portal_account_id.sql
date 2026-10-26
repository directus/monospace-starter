-- The MySQL source became the customer portal (accounts, users, plans, subscriptions,
-- tickets, events). Organizations now point at accounts.id instead of external_customers.id.
-- Safe to re-run: skips the rename when Monospace already applied it through the schema API.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'external_customer_id'
  ) THEN
    ALTER TABLE organizations RENAME COLUMN external_customer_id TO portal_account_id;
  END IF;
END $$;

UPDATE organizations
SET portal_account_id = replace(portal_account_id, 'customer-', 'acct-')
WHERE portal_account_id LIKE 'customer-%';

COMMIT;
