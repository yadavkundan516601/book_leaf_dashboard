ALTER TABLE "tickets" ADD COLUMN "ai_sentiment" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "ai_next_action" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "ai_language" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "ai_escalate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "ai_escalate_reason" text;