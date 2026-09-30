-- نخ دادن باید چندبار ممکن باشد؛ لایک و بازدید همچنان یک‌بار per pair
DROP INDEX IF EXISTS "Interaction_fromUserId_toUserId_type_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Interaction_fromUserId_toUserId_like_key"
  ON "Interaction"("fromUserId", "toUserId")
  WHERE type = 'like';

CREATE UNIQUE INDEX IF NOT EXISTS "Interaction_fromUserId_toUserId_view_key"
  ON "Interaction"("fromUserId", "toUserId")
  WHERE type = 'view';

CREATE INDEX IF NOT EXISTS "Interaction_fromUserId_toUserId_type_idx"
  ON "Interaction"("fromUserId", "toUserId", type);
