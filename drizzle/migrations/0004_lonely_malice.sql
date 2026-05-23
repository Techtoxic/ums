ALTER TABLE "attachment_applications" ADD COLUMN "county" text;--> statement-breakpoint
ALTER TABLE "attachment_applications" ADD COLUMN "nearest_town" text;--> statement-breakpoint
ALTER TABLE "attachment_applications" ADD COLUMN "comments" text;--> statement-breakpoint
ALTER TABLE "attachment_applications" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "attachment_applications" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "graduation_applications" ADD COLUMN "comments" text;--> statement-breakpoint
ALTER TABLE "graduation_applications" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "graduation_applications" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attachment_applications" ADD CONSTRAINT "attachment_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graduation_applications" ADD CONSTRAINT "graduation_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;