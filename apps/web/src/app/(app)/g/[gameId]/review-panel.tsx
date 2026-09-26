'use client';

import type { Audience } from '@greekgift/db';
import type { Review } from '@greekgift/engine';
import { useState } from 'react';

import { AnalysePanel } from './analyse-panel';
import { ReviewScreen } from './review-screen';

/**
 * One of two things: an invitation to analyse, or the review itself.
 *
 * The swap happens in place, without a reload, because the analysis that
 * produced the review ran right here in the page that is about to show it.
 */
export function ReviewPanel({
  gameId,
  fens,
  initialReview,
  personaId,
  audience,
  userSide,
  initialView,
}: {
  gameId: string;
  fens: string[];
  initialReview: Review | null;
  /** The reader's saved coach, from their profile. */
  personaId: string;
  /** How much the coach explains, from their profile. */
  audience: Audience;
  /** The member's side, from their linked accounts; null when they played neither. */
  userSide: 'w' | 'b' | null;
  /** Report first (chess.com's order), unless the link asked for the moves. */
  initialView: 'report' | 'moves';
}) {
  const [review, setReview] = useState(initialReview);

  return review ? (
    <ReviewScreen
      review={review}
      initialPersonaId={personaId}
      audience={audience}
      userSide={userSide}
      initialView={initialView}
    />
  ) : (
    <AnalysePanel gameId={gameId} fens={fens} onReview={setReview} />
  );
}
