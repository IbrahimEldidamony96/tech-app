-- Every security-sensitive user mutation increments sessionVersion.
-- JWTs from before the deployment have no claim and fail closed at Node auth().
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
