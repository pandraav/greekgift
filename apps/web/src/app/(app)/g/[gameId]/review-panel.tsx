'use client';

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
}: {
  gameId: string;
  fens: string[];
  initialReview: Review | null;
  /** The reader's saved coach, from their profile. */
  personaId: string;
}) {
  const [review, setReview] = useState(initialReview);

  return review ? (
    <ReviewScreen review={review} initialPersonaId={personaId} />
  ) : (
    <AnalysePanel gameId={gameId} fens={fens} onReview={setReview} />
  );
}
