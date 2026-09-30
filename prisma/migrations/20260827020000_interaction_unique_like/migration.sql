-- Deduplicate likes/views/threads before unique constraint (keep oldest)
DELETE FROM "Interaction" a
USING "Interaction" b
WHERE a.id > b.id
  AND a."fromUserId" = b."fromUserId"
  AND a."toUserId" = b."toUserId"
  AND a.type = b.type;

CREATE UNIQUE INDEX IF NOT EXISTS "Interaction_fromUserId_toUserId_type_key"
  ON "Interaction"("fromUserId", "toUserId", type);
