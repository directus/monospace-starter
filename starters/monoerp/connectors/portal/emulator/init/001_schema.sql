-- Stand-in for the customer portal another team runs. Monospace reads it with a
-- SELECT-only user; the CRM never writes here. Account ids are the join key from
-- crm.organizations.portal_account_id, user emails join to crm.contacts.email.
SET time_zone = '+00:00';

USE customer_portal;

CREATE TABLE plans (
  id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin PRIMARY KEY,
  code varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  seats_included int NOT NULL,
  monthly_price decimal(10, 2) NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);

CREATE TABLE accounts (
  id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin PRIMARY KEY,
  name varchar(200) NOT NULL,
  slug varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL UNIQUE,
  status enum('trial', 'active', 'churned') NOT NULL DEFAULT 'trial',
  -- The account's customer in Stripe, which bills it.
  stripe_customer_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin UNIQUE,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);

CREATE TABLE subscriptions (
  id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin PRIMARY KEY,
  account_id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  plan_id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  status enum('trialing', 'active', 'past_due', 'canceled') NOT NULL,
  seats int NOT NULL,
  started_at date NOT NULL,
  renews_at date,
  canceled_at date,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT subscriptions_seats_check CHECK (seats > 0),
  CONSTRAINT subscriptions_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CONSTRAINT subscriptions_plan_fk FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
  INDEX subscriptions_account_idx (account_id),
  INDEX subscriptions_plan_idx (plan_id),
  INDEX subscriptions_renews_idx (status, renews_at)
);

CREATE TABLE users (
  id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin PRIMARY KEY,
  account_id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  email varchar(255) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  role enum('owner', 'admin', 'member') NOT NULL DEFAULT 'member',
  status enum('invited', 'active', 'deactivated') NOT NULL DEFAULT 'invited',
  last_login_at datetime(6),
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT users_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  INDEX users_account_idx (account_id)
);

CREATE TABLE tickets (
  id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin PRIMARY KEY,
  account_id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  user_id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin,
  subject varchar(240) NOT NULL,
  body text,
  status enum('open', 'pending', 'resolved') NOT NULL DEFAULT 'open',
  priority enum('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  opened_at datetime(6) NOT NULL,
  resolved_at datetime(6),
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT tickets_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CONSTRAINT tickets_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX tickets_account_status_idx (account_id, status),
  INDEX tickets_user_idx (user_id)
);

-- Product usage the portal already tracks. The CRM merges these into the organization
-- timeline client-side; nothing is copied.
CREATE TABLE events (
  id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin PRIMARY KEY,
  account_id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  user_id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin,
  type enum('login', 'user_invited', 'seat_added', 'export_run', 'plan_viewed', 'ticket_opened') NOT NULL,
  detail varchar(255),
  occurred_at datetime(6) NOT NULL,
  CONSTRAINT events_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CONSTRAINT events_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX events_account_timeline_idx (account_id, occurred_at DESC),
  INDEX events_user_idx (user_id)
);

