ALTER TABLE "email_subscriptions"
  ADD COLUMN IF NOT EXISTS "state_updates" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "monthly_upload_reminders" boolean DEFAULT true NOT NULL;
