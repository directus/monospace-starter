-- Fixture "now" is 2026-08-21 12:00 UTC, same anchor as the Postgres seed. Account i
-- pairs with crm.organizations fixture i (Stripe, org 40, has no portal account yet).
-- Stories on purpose:
--   accounts 1, 2, 3, 7   every seat used, open deal in the CRM
--   accounts 1, 3, 7, 14  renew within 90 days
--   accounts 9, 18        churned, still an open deal in the CRM
--   accounts 4, 12        trial, heavy login activity
--   accounts 2, 6, 11     three or more open tickets (11 is also past due)
--   accounts 11, 23       past due
SET time_zone = '+00:00';

USE customer_portal;

INSERT INTO plans (id, code, name, seats_included, monthly_price, created_at, updated_at) VALUES
  ('plan-starter', 'starter', 'Starter', 5, 49.00, '2024-01-01 09:00:00', '2025-06-01 09:00:00'),
  ('plan-team', 'team', 'Team', 10, 299.00, '2024-01-01 09:00:00', '2025-06-01 09:00:00'),
  ('plan-business', 'business', 'Business', 25, 999.00, '2024-01-01 09:00:00', '2025-06-01 09:00:00'),
  ('plan-enterprise', 'enterprise', 'Enterprise', 50, 3999.00, '2024-01-01 09:00:00', '2025-06-01 09:00:00');

DROP FUNCTION IF EXISTS portal_account_status;
DROP FUNCTION IF EXISTS portal_plan;
DROP FUNCTION IF EXISTS portal_users_count;
DROP PROCEDURE IF EXISTS seed_customer_portal;

DELIMITER //

CREATE FUNCTION portal_account_status(i int) RETURNS varchar(16) DETERMINISTIC
  RETURN CASE WHEN MOD(i, 9) = 0 THEN 'churned' WHEN MOD(i, 4) = 0 THEN 'trial' ELSE 'active' END//

CREATE FUNCTION portal_plan(i int) RETURNS varchar(36) DETERMINISTIC
  RETURN CASE
    WHEN MOD(i, 9) = 0 THEN 'plan-starter'
    WHEN MOD(i, 4) = 0 THEN 'plan-team'
    WHEN MOD(i, 3) = 0 THEN 'plan-enterprise'
    WHEN MOD(i, 3) = 1 THEN 'plan-team'
    ELSE 'plan-business'
  END//

-- Every account gets its three CRM contacts as users, then fills seats with portal-only users.
CREATE FUNCTION portal_users_count(i int) RETURNS int DETERMINISTIC
  RETURN CASE
    WHEN i IN (1, 2, 3, 7) THEN (SELECT seats_included FROM plans WHERE id = portal_plan(i))
    WHEN portal_account_status(i) = 'trial' THEN 4
    WHEN portal_account_status(i) = 'churned' THEN 3
    ELSE GREATEST(3, FLOOR((SELECT seats_included FROM plans WHERE id = portal_plan(i)) * 0.6))
  END//

CREATE PROCEDURE seed_customer_portal()
BEGIN
  DECLARE i int DEFAULT 1;
  DECLARE n int;
  DECLARE t int;
  DECLARE e int;
  DECLARE user_total int;
  DECLARE account_name varchar(200);
  DECLARE account_slug varchar(80);
  DECLARE account_status varchar(16);
  DECLARE contact_no int;
  DECLARE first_name varchar(40);
  DECLARE last_name varchar(40);

  WHILE i <= 39 DO
    SET account_name = ELT(i,
      'Apple', 'Microsoft', 'Amazon', 'Alphabet', 'Walmart', 'Berkshire Hathaway', 'JPMorgan Chase',
      'UnitedHealth Group', 'Exxon Mobil', 'CVS Health', 'McKesson', 'Cencora', 'Costco Wholesale',
      'The Cigna Group', 'Ford Motor Company', 'General Motors', 'Chevron', 'Bank of America',
      'Citigroup', 'Meta', 'The Home Depot', 'Kroger', 'Phillips 66', 'Marathon Petroleum', 'Verizon',
      'AT&T', 'Comcast', 'Dell Technologies', 'Target', 'UPS', 'FedEx', 'PepsiCo',
      'The Coca-Cola Company', 'Nike', 'Salesforce', 'Oracle', 'Tesla', 'NVIDIA', 'The Walt Disney Company');
    SET account_slug = ELT(i,
      'apple', 'microsoft', 'amazon', 'alphabet', 'walmart', 'berkshire', 'jpmorgan',
      'unitedhealth', 'exxonmobil', 'cvshealth', 'mckesson', 'cencora', 'costco',
      'cigna', 'ford', 'gm', 'chevron', 'bankofamerica',
      'citi', 'meta', 'homedepot', 'kroger', 'phillips66', 'marathon', 'verizon',
      'att', 'comcast', 'dell', 'target', 'ups', 'fedex', 'pepsico',
      'cocacola', 'nike', 'salesforce', 'oracle', 'tesla', 'nvidia', 'disney');
    SET account_status = portal_account_status(i);
    SET user_total = portal_users_count(i);

    INSERT INTO accounts (id, name, slug, status, stripe_customer_id, created_at, updated_at) VALUES (
      CONCAT('acct-', LPAD(i, 4, '0')),
      account_name,
      account_slug,
      account_status,
      CONCAT('cus_MonoErp', LPAD(i, 4, '0')),
      CASE
        WHEN account_status = 'trial' THEN DATE_SUB('2026-08-21 12:00:00', INTERVAL (i + 3) DAY)
        ELSE DATE_ADD('2024-03-01 09:00:00', INTERVAL i * 17 DAY)
      END,
      DATE_SUB('2026-08-21 12:00:00', INTERVAL i * 5 HOUR)
    );

    INSERT INTO subscriptions (id, account_id, plan_id, status, seats, started_at, renews_at, canceled_at, created_at, updated_at)
    SELECT
      CONCAT('sub-', LPAD(i, 4, '0')),
      CONCAT('acct-', LPAD(i, 4, '0')),
      plans.id,
      CASE
        WHEN account_status = 'trial' THEN 'trialing'
        WHEN account_status = 'churned' THEN 'canceled'
        WHEN i IN (11, 23) THEN 'past_due'
        ELSE 'active'
      END,
      plans.seats_included,
      CASE
        WHEN account_status = 'trial' THEN DATE_SUB('2026-08-21', INTERVAL (i + 3) DAY)
        ELSE DATE_ADD('2024-03-01', INTERVAL i * 17 DAY)
      END,
      CASE
        WHEN account_status = 'trial' THEN DATE_ADD('2026-08-21', INTERVAL 11 DAY)
        WHEN account_status = 'churned' THEN NULL
        WHEN i IN (11, 23) THEN DATE_SUB('2026-08-21', INTERVAL 20 DAY)
        WHEN i = 1 THEN '2026-10-14'
        WHEN i = 3 THEN '2026-11-02'
        WHEN i = 7 THEN '2026-11-19'
        WHEN i = 14 THEN '2026-12-05'
        ELSE DATE_ADD('2027-01-15', INTERVAL i * 9 DAY)
      END,
      CASE WHEN account_status = 'churned' THEN DATE_SUB('2026-08-21', INTERVAL i * 4 DAY) END,
      CASE
        WHEN account_status = 'trial' THEN DATE_SUB('2026-08-21 12:00:00', INTERVAL (i + 3) DAY)
        ELSE DATE_ADD('2024-03-01 09:00:00', INTERVAL i * 17 DAY)
      END,
      DATE_SUB('2026-08-21 12:00:00', INTERVAL i * 5 HOUR)
    FROM plans WHERE plans.id = portal_plan(i);

    SET n = 1;
    WHILE n <= user_total DO
      -- Users 1..3 are the CRM contacts whose primary organization is fixture i
      -- (contacts i, i+40, i+80 in the Postgres seed), so emails line up exactly.
      SET contact_no = i + (n - 1) * 40;
      SET first_name = ELT(MOD(contact_no - 1, 12) + 1,
        'Maya', 'Ethan', 'Priya', 'Marcus', 'Sofia', 'Daniel', 'Aisha', 'Noah', 'Elena', 'James', 'Grace', 'Leo');
      SET last_name = ELT(FLOOR((contact_no - 1) / 12) + 1,
        'Chen', 'Williams', 'Patel', 'Johnson', 'Rodriguez', 'Kim', 'Okafor', 'Nguyen', 'Thompson', 'Shah');
      IF n > 3 THEN
        SET first_name = ELT(MOD(i * 7 + n, 12) + 1,
          'Maya', 'Ethan', 'Priya', 'Marcus', 'Sofia', 'Daniel', 'Aisha', 'Noah', 'Elena', 'James', 'Grace', 'Leo');
        SET last_name = ELT(MOD(i * 3 + n, 10) + 1,
          'Chen', 'Williams', 'Patel', 'Johnson', 'Rodriguez', 'Kim', 'Okafor', 'Nguyen', 'Thompson', 'Shah');
      END IF;

      INSERT INTO users (id, account_id, email, name, role, status, last_login_at, created_at, updated_at) VALUES (
        CONCAT('user-', LPAD(i, 4, '0'), '-', LPAD(n, 2, '0')),
        CONCAT('acct-', LPAD(i, 4, '0')),
        CASE
          WHEN n <= 3 THEN CONCAT(LOWER(first_name), '.', LOWER(last_name), '@example.com')
          ELSE CONCAT(LOWER(first_name), '.', LOWER(last_name), '@', account_slug, '.example.com')
        END,
        CONCAT(first_name, ' ', last_name),
        CASE n WHEN 1 THEN 'owner' WHEN 2 THEN 'admin' ELSE 'member' END,
        CASE
          WHEN n <= 3 AND MOD(contact_no, 17) = 0 THEN 'deactivated'
          WHEN account_status = 'churned' THEN 'deactivated'
          WHEN n > 3 AND MOD(n, 7) = 0 THEN 'invited'
          ELSE 'active'
        END,
        CASE
          WHEN n <= 3 AND MOD(contact_no, 17) = 0 THEN DATE_SUB('2026-08-21 12:00:00', INTERVAL 200 + i DAY)
          WHEN account_status = 'churned' THEN DATE_SUB('2026-08-21 12:00:00', INTERVAL i * 4 + 10 DAY)
          WHEN n > 3 AND MOD(n, 7) = 0 THEN NULL
          WHEN i IN (4, 12) THEN DATE_SUB('2026-08-21 12:00:00', INTERVAL n * 3 HOUR)
          WHEN n = 1 THEN DATE_SUB('2026-08-21 12:00:00', INTERVAL i * 2 HOUR)
          ELSE DATE_SUB('2026-08-21 12:00:00', INTERVAL i + n * 2 DAY)
        END,
        CASE
          WHEN account_status = 'trial' THEN DATE_ADD(DATE_SUB('2026-08-21 12:00:00', INTERVAL (i + 3) DAY), INTERVAL n * 90 MINUTE)
          ELSE DATE_ADD(DATE_ADD('2024-03-01 09:00:00', INTERVAL i * 17 DAY), INTERVAL n * 6 HOUR)
        END,
        DATE_SUB('2026-08-21 12:00:00', INTERVAL i * 5 + n HOUR)
      );
      SET n = n + 1;
    END WHILE;

    SET i = i + 1;
  END WHILE;

  -- Two tickets per account on average, most of them resolved.
  SET t = 1;
  WHILE t <= 78 DO
    SET i = MOD(t - 1, 39) + 1;
    INSERT INTO tickets (id, account_id, user_id, subject, body, status, priority, opened_at, resolved_at, created_at, updated_at) VALUES (
      CONCAT('ticket-', LPAD(t, 4, '0')),
      CONCAT('acct-', LPAD(i, 4, '0')),
      CONCAT('user-', LPAD(i, 4, '0'), '-', LPAD(MOD(t, 3) + 1, 2, '0')),
      ELT(MOD(t - 1, 8) + 1,
        'SSO login loops back to the sign-in page',
        'CSV export missing the last column',
        'Need to transfer account ownership',
        'Invoice PDF shows the wrong billing address',
        'API rate limit lower than documented',
        'Dashboard widgets load slowly on Safari',
        'Add a seat without upgrading the plan',
        'Webhook deliveries stopped overnight'),
      ELT(MOD(t - 1, 8) + 1,
        'Since this morning anyone signing in with Okta gets bounced back to the sign-in page after authenticating. Password logins still work. About 30 people cannot get in.',
        'Exporting the activity report to CSV drops the last column, Owner. The header is there but every row is one value short. Same in Chrome and Safari.',
        'Our account owner leaves on the 30th. Please move ownership to me, or tell us how to do it ourselves before then.',
        'The August invoice PDF shows our old billing address. We updated it under Settings > Billing last month and the page shows the new one, but the PDF does not.',
        'The docs say 600 requests per minute on Enterprise, but we start getting 429s at around 200. Is there a per-key limit we are missing?',
        'Dashboard widgets take 20 to 30 seconds to load on Safari 18. Chrome is fine. Nothing in the console except one long request to /api/widgets.',
        'We need one more seat for a contractor for two months. Can we add a single seat without moving to the next tier?',
        'No webhook deliveries since about 02:00 UTC. Our endpoint is up and answers 200 to a manual test. The deliveries page shows nothing queued either.'),
      CASE WHEN MOD(t, 5) = 0 THEN 'pending' WHEN MOD(t, 13) = 0 THEN 'open' ELSE 'resolved' END,
      ELT(MOD(t, 4) + 1, 'normal', 'low', 'high', 'normal'),
      DATE_SUB('2026-08-21 12:00:00', INTERVAL t * 31 HOUR),
      CASE WHEN MOD(t, 5) <> 0 AND MOD(t, 13) <> 0 THEN DATE_SUB('2026-08-21 12:00:00', INTERVAL t * 31 - 20 HOUR) END,
      DATE_SUB('2026-08-21 12:00:00', INTERVAL t * 31 HOUR),
      DATE_SUB('2026-08-21 12:00:00', INTERVAL t * 31 - 20 HOUR)
    );
    SET t = t + 1;
  END WHILE;

  -- Accounts 2, 6, 11: three open tickets each, all recent.
  SET t = 1;
  WHILE t <= 9 DO
    SET i = ELT(FLOOR((t - 1) / 3) + 1, 2, 6, 11);
    INSERT INTO tickets (id, account_id, user_id, subject, body, status, priority, opened_at, resolved_at, created_at, updated_at) VALUES (
      CONCAT('ticket-', LPAD(78 + t, 4, '0')),
      CONCAT('acct-', LPAD(i, 4, '0')),
      CONCAT('user-', LPAD(i, 4, '0'), '-', LPAD(MOD(t - 1, 3) + 1, 2, '0')),
      ELT(MOD(t - 1, 3) + 1,
        'Members can see reports they should not',
        'Seat count is wrong after removing a user',
        'Exports fail for accounts over 10k rows'),
      ELT(MOD(t - 1, 3) + 1,
        'Users with the Member role can open the Finance reports folder. They should only see folders they were added to. This is customer data, please treat it as urgent.',
        'After removing two users yesterday the seat count still shows them as used. The Seats page says 50 of 50, the Users page lists 48.',
        'Exports for our account fail with ''Something went wrong'' once the row count goes over about 10k. Smaller date ranges work.'),
      'open',
      ELT(MOD(t - 1, 3) + 1, 'urgent', 'high', 'high'),
      DATE_SUB('2026-08-21 12:00:00', INTERVAL t * 9 HOUR),
      NULL,
      DATE_SUB('2026-08-21 12:00:00', INTERVAL t * 9 HOUR),
      DATE_SUB('2026-08-21 12:00:00', INTERVAL t * 9 - 2 HOUR)
    );
    SET t = t + 1;
  END WHILE;

  -- Baseline product activity: twelve events per account over the last few months.
  SET e = 1;
  WHILE e <= 468 DO
    SET i = MOD(e - 1, 39) + 1;
    SET account_status = portal_account_status(i);
    SET n = MOD(FLOOR((e - 1) / 39), portal_users_count(i)) + 1;
    INSERT INTO events (id, account_id, user_id, type, detail, occurred_at) VALUES (
      CONCAT('event-', LPAD(e, 6, '0')),
      CONCAT('acct-', LPAD(i, 4, '0')),
      CONCAT('user-', LPAD(i, 4, '0'), '-', LPAD(n, 2, '0')),
      ELT(MOD(e * 7, 9) + 1, 'login', 'login', 'login', 'export_run', 'login', 'plan_viewed', 'user_invited', 'login', 'seat_added'),
      ELT(MOD(e * 7, 9) + 1,
        'Signed in from web', 'Signed in from mobile', 'Signed in from web',
        'Exported the activity report to CSV', 'Signed in from web',
        CONCAT('Viewed the ', ELT(MOD(e, 3) + 1, 'Team', 'Business', 'Enterprise'), ' plan'),
        'Invited a teammate', 'Signed in from web',
        CONCAT('Added seat ', MOD(e, 20) + 1)),
      CASE
        WHEN account_status = 'churned' THEN DATE_SUB('2026-08-21 12:00:00', INTERVAL i * 4 + 10 + FLOOR((e - 1) / 39) * 6 DAY)
        ELSE DATE_SUB(DATE_SUB('2026-08-21 12:00:00', INTERVAL FLOOR((e - 1) / 39) * 6 DAY), INTERVAL MOD(e * 5, 24) HOUR)
      END
    );
    SET e = e + 1;
  END WHILE;

  -- Trial accounts 4 and 12 are logging in constantly: 30 more logins each in the last two weeks.
  SET e = 1;
  WHILE e <= 60 DO
    SET i = CASE WHEN e <= 30 THEN 4 ELSE 12 END;
    INSERT INTO events (id, account_id, user_id, type, detail, occurred_at) VALUES (
      CONCAT('event-', LPAD(468 + e, 6, '0')),
      CONCAT('acct-', LPAD(i, 4, '0')),
      CONCAT('user-', LPAD(i, 4, '0'), '-', LPAD(MOD(e, 4) + 1, 2, '0')),
      'login',
      ELT(MOD(e, 2) + 1, 'Signed in from web', 'Signed in from mobile'),
      DATE_SUB('2026-08-21 12:00:00', INTERVAL MOD(e - 1, 30) * 11 HOUR)
    );
    SET e = e + 1;
  END WHILE;

  -- Every open ticket also shows up in the account's activity.
  INSERT INTO events (id, account_id, user_id, type, detail, occurred_at)
  SELECT CONCAT('event-t-', id), account_id, user_id, 'ticket_opened', CONCAT('Opened ticket: ', subject), opened_at
  FROM tickets
  WHERE status = 'open';
END//

DELIMITER ;

START TRANSACTION;
CALL seed_customer_portal();
COMMIT;

DROP PROCEDURE seed_customer_portal;
DROP FUNCTION portal_users_count;
DROP FUNCTION portal_plan;
DROP FUNCTION portal_account_status;
