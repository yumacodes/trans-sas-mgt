-- New and reset accounts sign in with the default password and must choose their own at first sign-in.
ALTER TABLE "user_profiles" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
