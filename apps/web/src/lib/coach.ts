import 'server-only';

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import { z } from 'zod';

import {
  systemPrompt,
  templateText,
  userPrompt,
  validate,
  type Persona,
} from '@greekgift/coach';
import type { CoachText, MoveFacts } from '@greekgift/engine';

import { env } from '@/env';

/**
 * Writing one coaching note.
 *
 * Three things happen in order, and the order is the design: the engine has
 * already decided what is true, deterministic code has already decided which
 * of it is worth saying, and the model is asked only how it should sound. If
 * the model is unavailable, slow, or says something the facts do not support,
 * the template answers instead. There is no path from here that produces a
 * confident wrong claim about a chess position.
 */

const slots = z.object({
  headline: z.string().min(1).max(120),
  what_happened: z.string().min(1),
  why_it_matters: z.string().min(1),
  better_was: z.string().min(1),
  lesson: z.string().min(1),
});

/**
 * Generous, because a coaching note nobody is watching load can afford to
 * take a moment — and mean, because the template is right there.
 */
const TIMEOUT_MS = 20_000;

/** How many times a rejected note is asked for again before we stop paying. */
const ATTEMPTS = 2;

export interface WriteOptions {
  persona: Persona;
  facts: MoveFacts;
  playerName?: string;
}

export interface WriteResult {
  text: CoachText;
  /** Why the template was used, when it was. Logged, never shown. */
  reason?: string;
}

export async function writeCoachText(options: WriteOptions): Promise<WriteResult> {
  const { persona, facts } = options;
  const fallback = () => templateText(facts);

  if (!env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY.includes('placeholder')) {
    return { text: fallback(), reason: 'no_api_key' };
  }

  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  const model = openrouter.chat(env.OPENROUTER_MODEL);

  let lastReason = 'unknown';

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const { object } = await generateObject({
        model,
        schema: slots,
        system: systemPrompt(options),
        prompt:
          attempt === 0
            ? userPrompt(options)
            : // A second pass is told what went wrong. Repeating the same
              // request and hoping is not a retry strategy.
              `${userPrompt(options)}\n\nYour previous answer was rejected: ${lastReason}. Fix exactly that.`,
        abortSignal: controller.signal,
        // The voice is the whole product; a flat sampler makes every persona
        // sound like the same careful assistant.
        temperature: 0.8,
      });

      const text: CoachText = {
        ply: facts.ply,
        headline: object.headline.trim(),
        whatHappened: object.what_happened.trim(),
        whyItMatters: object.why_it_matters.trim(),
        betterWas: object.better_was.trim(),
        lesson: object.lesson.trim(),
        source: 'llm',
        model: env.OPENROUTER_MODEL,
      };

      const result = validate(text, facts, persona);
      if (result.ok) return { text };

      lastReason = result.violations
        .map((v) => `${v.kind} (${v.detail})`)
        .join('; ');
    } catch (error) {
      lastReason =
        controller.signal.aborted
          ? 'timeout'
          : error instanceof Error
            ? error.message
            : 'request failed';
    } finally {
      clearTimeout(timer);
    }
  }

  return { text: fallback(), reason: lastReason };
}
