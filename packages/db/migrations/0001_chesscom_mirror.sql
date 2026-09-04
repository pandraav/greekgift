CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"url" text NOT NULL,
	"pgn" text NOT NULL,
	"time_class" text NOT NULL,
	"time_control" text NOT NULL,
	"rated" boolean DEFAULT true NOT NULL,
	"end_time" timestamp NOT NULL,
	"white_username" text NOT NULL,
	"white_name" text NOT NULL,
	"white_rating" integer,
	"white_result" text NOT NULL,
	"black_username" text NOT NULL,
	"black_name" text NOT NULL,
	"black_rating" integer,
	"black_result" text NOT NULL,
	"result" text NOT NULL,
	"termination" text,
	"eco" text,
	"eco_url" text,
	"opening" text,
	"plies" integer NOT NULL,
	"final_fen" text,
	"cc_accuracy_white" real,
	"cc_accuracy_black" real,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "games_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"username" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"title" text,
	"real_name" text,
	"country_code" text,
	"avatar_url" text,
	"joined_at" timestamp,
	"last_online_at" timestamp,
	"rating_rapid" integer,
	"rating_blitz" integer,
	"rating_bullet" integer,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"imported_through" text,
	"archive_count" integer
);
--> statement-breakpoint
CREATE INDEX "games_white_idx" ON "games" USING btree ("white_username","end_time");--> statement-breakpoint
CREATE INDEX "games_black_idx" ON "games" USING btree ("black_username","end_time");--> statement-breakpoint
CREATE INDEX "games_end_time_idx" ON "games" USING btree ("end_time");