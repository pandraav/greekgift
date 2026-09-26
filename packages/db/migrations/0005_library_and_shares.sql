CREATE TABLE "game_shares" (
	"token" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"share_token" text NOT NULL,
	"requester_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_chesscom_accounts" (
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp,
	CONSTRAINT "user_chesscom_accounts_user_id_username_pk" PRIMARY KEY("user_id","username")
);
--> statement-breakpoint
CREATE TABLE "user_games" (
	"user_id" text NOT NULL,
	"game_id" text NOT NULL,
	"source" text NOT NULL,
	"account_username" text,
	"shared_by" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"opened_at" timestamp,
	CONSTRAINT "user_games_user_id_game_id_pk" PRIMARY KEY("user_id","game_id")
);
--> statement-breakpoint
ALTER TABLE "game_shares" ADD CONSTRAINT "game_shares_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_shares" ADD CONSTRAINT "game_shares_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_requests" ADD CONSTRAINT "share_requests_share_token_game_shares_token_fk" FOREIGN KEY ("share_token") REFERENCES "public"."game_shares"("token") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_requests" ADD CONSTRAINT "share_requests_requester_user_id_user_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_chesscom_accounts" ADD CONSTRAINT "user_chesscom_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_games" ADD CONSTRAINT "user_games_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_games" ADD CONSTRAINT "user_games_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_games" ADD CONSTRAINT "user_games_shared_by_user_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_shares_game_owner_uidx" ON "game_shares" USING btree ("game_id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_requests_pending_uidx" ON "share_requests" USING btree ("share_token","requester_user_id") WHERE "share_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "share_requests_token_idx" ON "share_requests" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "share_requests_requester_idx" ON "share_requests" USING btree ("requester_user_id");--> statement-breakpoint
CREATE INDEX "user_chesscom_accounts_username_idx" ON "user_chesscom_accounts" USING btree ("username");--> statement-breakpoint
CREATE INDEX "user_games_opened_idx" ON "user_games" USING btree ("user_id","opened_at");--> statement-breakpoint
CREATE INDEX "user_games_account_idx" ON "user_games" USING btree ("user_id","account_username");
--> statement-breakpoint
-- Every member who had saved a username in settings starts with that account
-- linked. The old column stays this release so the code still serving traffic
-- during the deploy does not break; 0006 drops it.
INSERT INTO "user_chesscom_accounts" ("user_id", "username")
SELECT "user_id", lower("chesscom_username")
FROM "user_profiles"
WHERE "chesscom_username" IS NOT NULL
  AND lower("chesscom_username") ~ '^[a-z0-9_-]{3,25}$'
ON CONFLICT DO NOTHING;
