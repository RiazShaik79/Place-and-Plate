-- Weigh-ins over time (one per day) and the profile details behind a suggested calorie goal.

CREATE TABLE weight_entries (
  user_id    INT UNSIGNED  NOT NULL,
  date       CHAR(10)      NOT NULL,
  weight_kg  DOUBLE        NOT NULL,
  created_at VARCHAR(30)   NOT NULL,
  PRIMARY KEY (user_id, date),
  CONSTRAINT fk_weight_entries_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE users
  ADD COLUMN birth_year       SMALLINT    NULL,
  ADD COLUMN sex              VARCHAR(8)  NULL,
  ADD COLUMN activity         VARCHAR(12) NULL,
  ADD COLUMN goal_weight_kg   DOUBLE      NULL,
  ADD COLUMN weekly_change_kg DOUBLE      NULL;

-- Start everyone's history from the weight they already saved.
INSERT INTO weight_entries (user_id, date, weight_kg, created_at)
  SELECT id, DATE_FORMAT(CURDATE(), '%Y-%m-%d'), weight_kg, DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
  FROM users WHERE weight_kg IS NOT NULL;
