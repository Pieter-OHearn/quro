ALTER TABLE "holding_price_history" ALTER COLUMN "close_price" SET DATA TYPE numeric(23, 6);--> statement-breakpoint
ALTER TABLE "holding_transactions" ALTER COLUMN "price" SET DATA TYPE numeric(23, 6);--> statement-breakpoint
ALTER TABLE "holdings" ALTER COLUMN "current_price" SET DATA TYPE numeric(23, 6);--> statement-breakpoint
ALTER TABLE "holdings" ALTER COLUMN "manual_price" SET DATA TYPE numeric(23, 6);