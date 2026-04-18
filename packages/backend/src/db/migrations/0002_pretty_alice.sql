ALTER TABLE "bunq_connections" ALTER COLUMN "bunq_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bunq_connections" DROP COLUMN "refresh_token";--> statement-breakpoint
ALTER TABLE "bunq_connections" DROP COLUMN "token_expires_at";