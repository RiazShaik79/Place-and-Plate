-- Favourite foods: one serving's nutrition snapshotted from an entry the user logged, so it can be
-- added again in one tap. `food_key` identifies "the same food" (see foodKey() in lib/foods.ts).

CREATE TABLE favorite_foods (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED  NOT NULL,
  food_key     VARCHAR(220)  NOT NULL,       -- "ai:" + name (100) + "|" + serving_size (100) at most
  food_id      VARCHAR(64)   NOT NULL,
  name         VARCHAR(100)  NOT NULL,
  serving_size VARCHAR(100)  NOT NULL,
  calories     DOUBLE        NOT NULL,
  protein      DOUBLE        NOT NULL,
  carbs        DOUBLE        NOT NULL,
  fat          DOUBLE        NOT NULL,
  created_at   VARCHAR(30)   NOT NULL,
  UNIQUE KEY uq_favorite_foods_user_key (user_id, food_key),
  CONSTRAINT fk_favorite_foods_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
