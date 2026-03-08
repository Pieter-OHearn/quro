CREATE TABLE "worker_heartbeats" (
  "worker_name" text PRIMARY KEY NOT NULL,
  "status" text NOT NULL,
  "last_heartbeat_at" timestamp NOT NULL,
  "parser_healthy" boolean DEFAULT false NOT NULL,
  "parser_checked_at" timestamp,
  "parser_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
