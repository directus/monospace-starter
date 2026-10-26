-- Tickets gained a body so the CRM can show the request, not just its subject.
-- Safe to re-run: adds the column only when missing, fills only empty bodies.
USE customer_portal;

SET @has_body = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = 'customer_portal' AND table_name = 'tickets' AND column_name = 'body'
);
SET @ddl = IF(@has_body = 0, 'ALTER TABLE tickets ADD COLUMN body text AFTER subject', 'DO 0');
PREPARE ddl FROM @ddl;
EXECUTE ddl;
DEALLOCATE PREPARE ddl;

UPDATE tickets
SET body = CASE subject
  WHEN 'SSO login loops back to the sign-in page' THEN 'Since this morning anyone signing in with Okta gets bounced back to the sign-in page after authenticating. Password logins still work. About 30 people cannot get in.'
  WHEN 'CSV export missing the last column' THEN 'Exporting the activity report to CSV drops the last column, Owner. The header is there but every row is one value short. Same in Chrome and Safari.'
  WHEN 'Need to transfer account ownership' THEN 'Our account owner leaves on the 30th. Please move ownership to me, or tell us how to do it ourselves before then.'
  WHEN 'Invoice PDF shows the wrong billing address' THEN 'The August invoice PDF shows our old billing address. We updated it under Settings > Billing last month and the page shows the new one, but the PDF does not.'
  WHEN 'API rate limit lower than documented' THEN 'The docs say 600 requests per minute on Enterprise, but we start getting 429s at around 200. Is there a per-key limit we are missing?'
  WHEN 'Dashboard widgets load slowly on Safari' THEN 'Dashboard widgets take 20 to 30 seconds to load on Safari 18. Chrome is fine. Nothing in the console except one long request to /api/widgets.'
  WHEN 'Add a seat without upgrading the plan' THEN 'We need one more seat for a contractor for two months. Can we add a single seat without moving to the next tier?'
  WHEN 'Webhook deliveries stopped overnight' THEN 'No webhook deliveries since about 02:00 UTC. Our endpoint is up and answers 200 to a manual test. The deliveries page shows nothing queued either.'
  WHEN 'Members can see reports they should not' THEN 'Users with the Member role can open the Finance reports folder. They should only see folders they were added to. This is customer data, please treat it as urgent.'
  WHEN 'Seat count is wrong after removing a user' THEN 'After removing two users yesterday the seat count still shows them as used. The Seats page says 50 of 50, the Users page lists 48.'
  WHEN 'Exports fail for accounts over 10k rows' THEN 'Exports for our account fail with ''Something went wrong'' once the row count goes over about 10k. Smaller date ranges work.'
END
WHERE body IS NULL;
