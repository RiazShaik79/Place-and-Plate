-- 001: the full schema as it stood when the app moved from SQLite to MySQL (2026-10-16).
-- Dates are CHAR(10) 'YYYY-MM-DD' (the user's local day) and timestamps are ISO-8601 UTC strings,
-- exactly as in SQLite, so comparisons and API shapes don't change.

CREATE TABLE users (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email             VARCHAR(254)  NOT NULL,
  name              VARCHAR(100)  NOT NULL,
  password_hash     VARCHAR(255)  NOT NULL,
  calorie_goal      INT           NOT NULL DEFAULT 2000,
  weight_kg         DOUBLE        NULL,
  height_cm         DOUBLE        NULL,
  steps_target      INT           NULL,
  address           TEXT          NULL,       -- JSON text (kept as TEXT so it isn't auto-parsed)
  email_verified_at VARCHAR(30)   NULL,
  pending_email     VARCHAR(254)  NULL,
  created_at        VARCHAR(30)   NOT NULL,
  UNIQUE KEY uq_users_email (email)
);

CREATE TABLE sessions (
  token_hash CHAR(64)      NOT NULL PRIMARY KEY,  -- SHA-256 hex of the cookie token
  user_id    INT UNSIGNED  NOT NULL,
  created_at VARCHAR(30)   NOT NULL,
  expires_at VARCHAR(30)   NOT NULL,
  remember   TINYINT(1)    NOT NULL DEFAULT 1,
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE password_resets (
  token_hash CHAR(64)      NOT NULL PRIMARY KEY,
  user_id    INT UNSIGNED  NOT NULL,
  created_at VARCHAR(30)   NOT NULL,
  expires_at VARCHAR(30)   NOT NULL,
  used_at    VARCHAR(30)   NULL,
  KEY idx_password_resets_user (user_id),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE email_verifications (
  token_hash CHAR(64)      NOT NULL PRIMARY KEY,
  user_id    INT UNSIGNED  NOT NULL,
  email      VARCHAR(254)  NOT NULL,
  created_at VARCHAR(30)   NOT NULL,
  expires_at VARCHAR(30)   NOT NULL,
  used_at    VARCHAR(30)   NULL,
  KEY idx_email_verifications_user (user_id),
  CONSTRAINT fk_email_verifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE log_entries (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED  NOT NULL,
  date         CHAR(10)      NOT NULL,
  meal         VARCHAR(16)   NOT NULL DEFAULT 'snack',
  food_id      VARCHAR(64)   NOT NULL,       -- catalogue id or ai:text / ai:photo
  name         VARCHAR(100)  NOT NULL,
  serving_size VARCHAR(100)  NOT NULL,
  servings     DOUBLE        NOT NULL,
  calories     DOUBLE        NOT NULL,
  protein      DOUBLE        NOT NULL,
  carbs        DOUBLE        NOT NULL,
  fat          DOUBLE        NOT NULL,
  created_at   VARCHAR(30)   NOT NULL,
  KEY idx_log_entries_user_date (user_id, date),
  CONSTRAINT fk_log_entries_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE exercise_entries (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED  NOT NULL,
  date       CHAR(10)      NOT NULL,
  source     VARCHAR(64)   NOT NULL,         -- catalogue id or ai:text / ai:photo
  name       VARCHAR(100)  NOT NULL,
  category   VARCHAR(16)   NOT NULL,
  intensity  VARCHAR(16)   NOT NULL,
  minutes    DOUBLE        NOT NULL,
  met        DOUBLE        NOT NULL,
  calories   DOUBLE        NOT NULL,
  created_at VARCHAR(30)   NOT NULL,
  KEY idx_exercise_user_date (user_id, date),
  CONSTRAINT fk_exercise_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE daily_steps (
  user_id    INT UNSIGNED  NOT NULL,
  date       CHAR(10)      NOT NULL,
  steps      INT           NOT NULL,
  updated_at VARCHAR(30)   NOT NULL,
  PRIMARY KEY (user_id, date),
  CONSTRAINT fk_daily_steps_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
