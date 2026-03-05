CREATE TABLE "stock_exchanges" (
	"id" serial PRIMARY KEY NOT NULL,
	"mic" text NOT NULL,
	"name" text NOT NULL,
	"acronym" text,
	"country" text,
	"country_code" text,
	"city" text,
	"website" text,
	CONSTRAINT "stock_exchanges_mic_unique" UNIQUE("mic")
);
--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "item_type" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "exchange_mic" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "price_updated_at" timestamp;