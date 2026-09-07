-- The coach is deterministic and free to run: notes written by the old
-- model-backed coach are dropped rather than served under the new key.
DELETE FROM "coach_texts";--> statement-breakpoint
ALTER TABLE "coach_texts" ADD COLUMN "audience" text DEFAULT 'intermediate' NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_texts" DROP CONSTRAINT "coach_texts_game_id_ply_persona_id_pk";--> statement-breakpoint
ALTER TABLE "coach_texts" ADD CONSTRAINT "coach_texts_game_id_ply_persona_id_audience_pk" PRIMARY KEY("game_id","ply","persona_id","audience");
