ALTER TABLE "trainer_assignments" ADD COLUMN "hours" integer;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "is_viewed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "description" text;