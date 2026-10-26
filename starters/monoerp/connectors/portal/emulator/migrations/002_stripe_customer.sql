-- Accounts gained their Stripe customer id, matching the local Stripe's seed (infra/stripe).
-- Safe to re-run: adds the column only when missing, fills only empty ids.
USE customer_portal;

SET @has_column = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = 'customer_portal' AND table_name = 'accounts' AND column_name = 'stripe_customer_id'
);
SET @ddl = IF(
  @has_column = 0,
  'ALTER TABLE accounts ADD COLUMN stripe_customer_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin UNIQUE AFTER status',
  'DO 0'
);
PREPARE ddl FROM @ddl;
EXECUTE ddl;
DEALLOCATE PREPARE ddl;

UPDATE accounts
SET stripe_customer_id = CONCAT('cus_MonoErp', SUBSTRING(id, 6))
WHERE stripe_customer_id IS NULL AND id REGEXP '^acct-[0-9]{4}$';
