/**
 * Every word on the landing page, in one place.
 *
 * Layout lives in the section components; wording lives here, so a copy edit
 * never touches markup. The persona quotes are deliberately absent — the
 * voice cards read each coach's real blunder line from `@greekgift/coach`,
 * so the landing page cannot promise a voice the app does not have.
 */
export const copy = {
  nav: { login: 'Log in', request: 'Request access' },

  hero: {
    kicker: 'chess.com game review',
    title: ['You hung a knight.', 'Let’s talk about it.'],
    sub: 'Drop in your chess.com username. We pull your games straight off your archive, run Stockfish right here in your browser, and one of seven coaches tells you what actually went wrong — the way a friend would, not a spreadsheet.',
    primary: 'Get me in',
    secondary: 'Show me a real one',
    pipe: [
      'chess.com/yourname',
      '3,411 games',
      'Stockfish, in your browser',
      'a coach explains it',
    ],
    fine: 'Invite-only, and built for about eight people.',
    slip: 'The knight jumped in to hit two pieces at once. That is the right idea — but the square it landed on has to be safe, and nothing of Black’s covers it.',
  },

  compare: {
    kicker: 'same move, two ways',
    title: 'Cool. It was a blunder. But why?',
    lede: 'Here is Black’s tenth move in a real 1100-rated game. On the left, what every review tool hands you. On the right, the bit you actually wanted.',
    leftTag: 'what you normally get',
    rightTag: 'what you were after',
    move: '10… Ne5',
    facts: [
      ['Class', 'Blunder'],
      ['Eval', '−0.1 → +3.0'],
      ['Best', 'Nh5'],
      ['Accuracy', '31.7'],
    ],
    after: 'All correct. Still no idea what you did.',
    noteTitle: ['The square was free,', 'the knight was not'],
    note: [
      'The knight jumped in to hit the bishop and the knight at once. Two targets from one square is the right idea — but the square itself has to be safe, and here nothing of Black’s covers it.',
      'So the fork never happens. White takes the knight, and there is no recapture.',
    ],
    betterLabel: 'Better was',
    better: 'Nh5',
  },

  voices: {
    kicker: 'seven voices',
    title: 'Who is breaking the news?',
    lede: 'Same engine, same numbers, same everything — the only thing that changes is the mouth. Swap any time. No rating gates, nothing to unlock.',
    fine: 'Written in the style of these creators. greekgift is not affiliated with any of them.',
  },

  steps: {
    kicker: 'how it goes',
    title: 'Three steps, then you are reading.',
    items: [
      {
        title: 'You type a username',
        body: 'That is the whole setup. We fetch your games straight from the chess.com public archive — no PGN files, no uploading, and nothing ever written back to your account.',
      },
      {
        title: 'Your laptop does the thinking',
        body: 'Stockfish runs in your browser, not on our server. No queue, no waiting behind someone else’s game. Fixed node counts, so the numbers do not wobble between runs.',
      },
      {
        title: 'Your coach reads it back',
        body: 'Every fact comes from the engine. The coach picks what is worth mentioning and says it — it cannot invent a move that was never on the board.',
      },
    ],
  },

  features: {
    kicker: 'in every review',
    title: 'What is in one.',
    items: [
      {
        mark: '10 classes',
        title: 'Every move marked',
        body: 'Brilliant through blunder, on the board, in the notation, and totalled by colour.',
      },
      {
        mark: 'lichess model',
        title: 'Accuracy and a rating estimate',
        body: 'The published win-percentage curve and accuracy formula, plus an ACPL-based estimate of how you played — not who you are.',
      },
      {
        mark: 'whole game',
        title: 'An evaluation graph',
        body: 'The shape of the game in one line. Click anywhere on it to jump to that move.',
      },
      {
        mark: 'drag to play',
        title: 'Your own lines',
        body: 'Take any position and play it out for both sides. The review keeps its place and nothing you try is saved to the game.',
      },
      {
        mark: 'key moments',
        title: 'The turns that mattered',
        body: 'Not a note on all forty moves. The handful that changed the result, in order.',
      },
      {
        mark: 'opening book',
        title: 'The opening, named',
        body: 'Every game is matched against a 3,810-position book, so the review starts where the theory ends.',
      },
    ],
  },

  closer: {
    title: 'It is invite-only. Sorry.',
    /** `{name}` is the creator's first name. */
    body: '{name} reads every request and approves it by hand. Say who you are and how you found this, pick a password, and you are in as soon as he gets to it.',
    primary: 'Get me in',
    secondary: 'Log in',
  },

  footer: {
    line: 'Games come from the chess.com public API. Not affiliated with them.',
  },
} as const;
