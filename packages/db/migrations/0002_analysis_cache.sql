CREATE TABLE "coach_texts" (
	"game_id" text NOT NULL,
	"ply" integer NOT NULL,
	"persona_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"model" text,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coach_texts_game_id_ply_persona_id_pk" PRIMARY KEY("game_id","ply","persona_id")
);
--> statement-breakpoint
CREATE TABLE "position_evals" (
	"fen" text NOT NULL,
	"nodes" integer NOT NULL,
	"engine_build" text NOT NULL,
	"lines" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "position_evals_fen_nodes_engine_build_pk" PRIMARY KEY("fen","nodes","engine_build")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"game_id" text NOT NULL,
	"nodes" integer NOT NULL,
	"engine_build" text NOT NULL,
	"data" jsonb NOT NULL,
	"white_accuracy" real NOT NULL,
	"black_accuracy" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_game_id_nodes_engine_build_pk" PRIMARY KEY("game_id","nodes","engine_build")
);
--> statement-breakpoint
ALTER TABLE "coach_texts" ADD CONSTRAINT "coach_texts_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_game_idx" ON "reviews" USING btree ("game_id");