CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"profile_url" text NOT NULL,
	"bio" text,
	"external_url" text,
	"followers" integer,
	"following" integer,
	"post_count" integer,
	"account_created_at" timestamp with time zone,
	"profile_shot_url" text,
	"score" integer DEFAULT 0 NOT NULL,
	"label" text DEFAULT 'LOW' NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"summary_model" text,
	"human_label" text,
	"human_note" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"post_total" integer DEFAULT 0 NOT NULL,
	"distinct_targets" integer DEFAULT 0 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_text" text NOT NULL,
	"size" integer DEFAULT 1 NOT NULL,
	"account_count" integer DEFAULT 1 NOT NULL,
	"score_max" integer DEFAULT 0 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"account_count" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"is_scam" boolean NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"result" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lsh_bands" (
	"band_key" text NOT NULL,
	"post_id" text NOT NULL,
	CONSTRAINT "lsh_bands_band_key_post_id_pk" PRIMARY KEY("band_key","post_id")
);
--> statement-breakpoint
CREATE TABLE "post_entities" (
	"post_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"account_id" text NOT NULL,
	"source" text DEFAULT 'text' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_entities_post_id_entity_id_pk" PRIMARY KEY("post_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"platform" text NOT NULL,
	"post_url" text NOT NULL,
	"parent_url" text,
	"kind" text DEFAULT 'post' NOT NULL,
	"text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"exact_key" text NOT NULL,
	"posted_at" timestamp with time zone,
	"captured_at" timestamp with time zone NOT NULL,
	"screenshot_url" text,
	"score" integer NOT NULL,
	"label" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"techniques" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cluster_id" text,
	"minhash" jsonb NOT NULL,
	"llm_verdict" jsonb,
	"human_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_handle_idx" ON "accounts" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "accounts_score_idx" ON "accounts" USING btree ("score");--> statement-breakpoint
CREATE INDEX "entities_type_idx" ON "entities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "entities_account_count_idx" ON "entities" USING btree ("account_count");--> statement-breakpoint
CREATE INDEX "post_entities_entity_idx" ON "post_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "post_entities_account_idx" ON "post_entities" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "posts_account_idx" ON "posts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "posts_exact_idx" ON "posts" USING btree ("exact_key");--> statement-breakpoint
CREATE INDEX "posts_cluster_idx" ON "posts" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "posts_url_idx" ON "posts" USING btree ("post_url");