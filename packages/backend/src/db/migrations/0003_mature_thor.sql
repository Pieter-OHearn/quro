ALTER TABLE "bunq_connections" ADD COLUMN "private_key" text;--> statement-breakpoint
ALTER TABLE "bunq_connections" ADD COLUMN "installation_token" text;--> statement-breakpoint
ALTER TABLE "bunq_connections" ADD COLUMN "server_public_key" text;--> statement-breakpoint
ALTER TABLE "bunq_connections" ADD COLUMN "session_token" text;--> statement-breakpoint
ALTER TABLE "bunq_connections" ADD COLUMN "session_expires_at" timestamp;