ALTER TABLE "holdings" ADD COLUMN "manual_price" numeric(19, 2);--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "exclude_from_sync" boolean DEFAULT false NOT NULL;--> statement-breakpoint
