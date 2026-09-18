ALTER TABLE "User" ADD COLUMN "cheetchat_user_id" TEXT;
CREATE UNIQUE INDEX "User_cheetchat_user_id_key" ON "User"("cheetchat_user_id");
