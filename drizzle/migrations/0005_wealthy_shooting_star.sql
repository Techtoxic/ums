CREATE TABLE "tool_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid,
	"trainer_id" uuid NOT NULL,
	"tool_type" text NOT NULL,
	"file_name" text NOT NULL,
	"original_name" text NOT NULL,
	"s3_key" text NOT NULL,
	"s3_bucket" text,
	"file_size" integer,
	"mime_type" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tool_requests" DROP CONSTRAINT "tool_requests_trainer_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tool_requests" DROP CONSTRAINT "tool_requests_responded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tool_requests" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tool_requests" ALTER COLUMN "status" SET DEFAULT 'open';--> statement-breakpoint
ALTER TABLE "tool_requests" ADD COLUMN "tool_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_requests" ADD COLUMN "target_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_requests" ADD COLUMN "target_trainer_id" uuid;--> statement-breakpoint
ALTER TABLE "tool_requests" ADD COLUMN "target_department" text;--> statement-breakpoint
ALTER TABLE "tool_requests" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "tool_requests" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "tool_requests" ADD COLUMN "requested_by" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_requests" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tool_uploads" ADD CONSTRAINT "tool_uploads_request_id_tool_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."tool_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_uploads" ADD CONSTRAINT "tool_uploads_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_uploads" ADD CONSTRAINT "tool_uploads_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_requests" ADD CONSTRAINT "tool_requests_target_trainer_id_users_id_fk" FOREIGN KEY ("target_trainer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_requests" ADD CONSTRAINT "tool_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_requests" DROP COLUMN "trainer_id";--> statement-breakpoint
ALTER TABLE "tool_requests" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "tool_requests" DROP COLUMN "quantity";--> statement-breakpoint
ALTER TABLE "tool_requests" DROP COLUMN "requested_at";--> statement-breakpoint
ALTER TABLE "tool_requests" DROP COLUMN "responded_at";--> statement-breakpoint
ALTER TABLE "tool_requests" DROP COLUMN "responded_by";