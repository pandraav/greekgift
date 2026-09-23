-- Coach notes are keyed by whose side they speak to and by the review they
-- were written from. Additive only: existing rows keep ('', '') and simply
-- stop being read; nothing is deleted.
ALTER TABLE "coach_texts" ADD COLUMN "perspective" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_texts" ADD COLUMN "review_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_texts" DROP CONSTRAINT "coach_texts_game_id_ply_persona_id_audience_pk";--> statement-breakpoint
ALTER TABLE "coach_texts" ADD CONSTRAINT "coach_texts_game_id_ply_persona_id_audience_perspective_review_key_pk" PRIMARY KEY("game_id","ply","persona_id","audience","perspective","review_key");
