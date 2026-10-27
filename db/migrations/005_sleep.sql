-- Sleep: one night per user, stored on the day they woke up ("last night" belongs to today).
-- Minutes are computed by the server from the two clock times; quality is an optional 1-5.

CREATE TABLE daily_sleep (
  user_id    INT UNSIGNED  NOT NULL,
  date       CHAR(10)      NOT NULL,
  bed_time   CHAR(5)       NOT NULL,
  wake_time  CHAR(5)       NOT NULL,
  minutes    INT           NOT NULL,
  quality    TINYINT       NULL,
  updated_at VARCHAR(30)   NOT NULL,
  PRIMARY KEY (user_id, date),
  CONSTRAINT fk_daily_sleep_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE users ADD COLUMN sleep_target_min INT NULL;
