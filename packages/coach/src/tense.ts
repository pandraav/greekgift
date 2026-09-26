/**
 * The game is over (review-overhaul design §13.3, loop criterion 15).
 *
 * A note narrates what happened in the past tense and gives advice for the
 * next game in the future or imperative. These patterns are narration of a
 * finished game as if it were still being played; the validator rejects any
 * of them in the headline, whatHappened, whyItMatters and betterWas slots.
 * The lesson is advice and is exempt. One list, one place.
 */
export const LIVE_NARRATION: readonly RegExp[] = [
  /\bwhat are (you|we) doing\b/i,
  /\bis (just |simply |now |left |still )?hanging\b/i,
  /\bhangs\b/i,
  /\b(nobody|nothing|no one|no piece) (defends|protects|guards|covers)\b/i,
  /\b(you|we|they) are (losing|winning|lost|busted|done|back)\b/i,
  /\b(you|we|they)['’]re (losing|winning|lost|busted|done|back)\b/i,
  /\b(is|it's|that's) (checkmate|mate)\b/i,
  /\bcan (simply |just |now )?(take|capture|win|grab)\b/i,
  /\bnow (attacks|threatens|hits|wins|takes)\b/i,
  /\b(forks|pins|skewers|traps|threatens)\b/i,
  /\b(is|are) (attacked|pinned|forked|skewered|trapped|undefended|overloaded)\b/i,
  /\bhas (no|nowhere|more attackers)\b/i,
  /\b(the|your|their) (position|game) is (lost|won|over|gone)\b/i,
  /\bthe (chances|evaluation) (drop|drops|rise|rises|hold|holds|stay|stays|fall|falls)\b/i,
  /\byour (winning )?chances (go|drop|rise|hold|stay|are)\b/i,
];

/** The first live-narration pattern a sentence matches, or undefined. */
export function liveNarration(sentence: string): RegExp | undefined {
  return LIVE_NARRATION.find((r) => r.test(sentence));
}
