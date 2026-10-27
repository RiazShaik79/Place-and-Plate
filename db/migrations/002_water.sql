-- Water: one total per user per day (quick adds are applied atomically), plus an optional daily
-- target on the account (NULL = the 2,000 ml default).

CREATE TABLE daily_water (
  user_id    INT UNSIGNED  NOT NULL,
  date       CHAR(10)      NOT NULL,
  ml         INT UNSIGNED  NOT NULL,
  updated_at VARCHAR(30)   NOT NULL,
  PRIMARY KEY (user_id, date),
  CONSTRAINT fk_daily_water_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE users ADD COLUMN water_target_ml INT NULL;
