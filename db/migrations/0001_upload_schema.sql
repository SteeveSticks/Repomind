CREATE TABLE IF NOT EXISTS "source_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"raw_text" text,
	"file_data" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_files_source_id_unique" UNIQUE("source_id")
);
--> statement-breakpoint
ALTER TABLE "ingest_jobs" ALTER COLUMN "repo_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'github_repo' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_files" DROP CONSTRAINT IF EXISTS "source_files_source_id_sources_id_fk";--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" DROP CONSTRAINT IF EXISTS "sources_kind_check";--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_kind_check" CHECK ("sources"."kind" IN ('github_repo', 'upload'));--> statement-breakpoint
ALTER TABLE "ingest_jobs" DROP CONSTRAINT IF EXISTS "ingest_jobs_kind_check";--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_kind_check" CHECK ("ingest_jobs"."kind" IN ('github_repo', 'upload'));
