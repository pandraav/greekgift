import type { Motif, MoveFacts, PieceRef, SituationKind } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import { SLOTS, type Plan, type Proposition } from '../src/contracts.ts';
import {
  fallbackLead,
  fitPlan,
  LESSON_BY_LEAD,
  OBSERVATION_BY_LEAD,
  plan,
  WORDS_PER_PROP,
} from '../src/plan.ts';

// ---------------------------------------------------------------------------
// Fixtures

const W = (piece: PieceRef['piece'], square: string): PieceRef => ({ piece, square, color: 'w' });
const B = (piece: PieceRef['piece'], square: string): PieceRef => ({ piece, square, color: 'b' });

/** The spec's shared example: 36...Nd7?? walks into Nc5, forking d7 and b7. */
const facts = (over: Partial<MoveFacts> = {}): MoveFacts => ({
  ply: 36,
  color: 'b',
  san: 'Nd7',
  classification: 'blunder',
  epLoss: 0.34,
  winBefore: 52,
  winAfter: 18,
  moveAccuracy: 31.7,
  forced: false,
  bestMove: 'Be6',
  bestLine: ['Be6', 'Nxe6', 'fxe6'],
  playedLine: ['Nc5', 'Qc7', 'Nxd7'],
  motifs: [],
  materialAfterBestLine: 0,
  materialAfterPlayedLine: -3,
  bestMoveEffect: { check: false, materialGain: 0, line: ['Be6', 'Nxe6', 'fxe6'] },
  situations: [],
  phase: 'middlegame',
  leftBook: true,
  audience: 'intermediate',
  ...over,
});

/** A good move, for the praise side. */
const goodFacts = (over: Partial<MoveFacts> = {}): MoveFacts =>
  facts({
    san: 'Be6',
    classification: 'best',
    epLoss: 0,
    winAfter: 52,
    moveAccuracy: 100,
    materialAfterPlayedLine: 0,
    bestMoveEffect: { check: false, materialGain: 0, line: ['Be6', 'Nxe6', 'fxe6'] },
    ...over,
  });

const FORK: Motif = {
  type: 'fork',
  by: W('N', 'c5'),
  targets: [B('N', 'd7'), B('B', 'b7')],
  byMover: false,
};
const HANG: Motif = {
  type: 'hanging_piece',
  target: B('N', 'd7'),
  attackers: [W('N', 'c5')],
  defenders: [],
};
const UNDER: Motif = {
  type: 'hanging_piece',
  target: B('B', 'b7'),
  attackers: [W('N', 'c5'), W('R', 'b1')],
  defenders: [B('K', 'c8')],
};

/** One facts object per situation kind, situation first with its motif. */
const CASES: Record<SituationKind, MoveFacts> = {
  allowed_mate: facts({
    motifs: [{ type: 'mate_threat', line: ['Qxh7+', 'Kf8', 'Qh8#'] }],
    situations: [{ kind: 'allowed_mate', severity: 1 }],
  }),
  missed_mate: facts({
    classification: 'miss',
    motifs: [{ type: 'missed_mate', line: ['Qxh7+', 'Kf8', 'Qh8#'] }],
    bestMoveEffect: { check: true, mateIn: 2, materialGain: 0, line: ['Qxh7+', 'Kf8', 'Qh8#'] },
    situations: [{ kind: 'missed_mate', severity: 0.98 }],
  }),
  mate_delivered: goodFacts({
    san: 'Qh8#',
    bestMove: 'Qh8#',
    winAfter: 100,
    situations: [{ kind: 'mate_delivered', severity: 0.97 }],
  }),
  hung_piece: facts({
    motifs: [HANG],
    situations: [{ kind: 'hung_piece', severity: 0.72, motif: HANG }],
  }),
  under_defended: facts({
    motifs: [UNDER],
    situations: [{ kind: 'under_defended', severity: 0.5, motif: UNDER }],
  }),
  walked_into_fork: facts({
    motifs: [FORK, HANG],
    situations: [
      { kind: 'walked_into_fork', severity: 0.85, motif: FORK },
      { kind: 'hung_piece', severity: 0.72, motif: HANG },
    ],
  }),
  walked_into_pin: facts({
    motifs: [
      { type: 'pin', pinned: B('N', 'd7'), pinner: W('B', 'g4'), against: B('Q', 'd8'), absolute: false },
    ],
    situations: [{ kind: 'walked_into_pin', severity: 0.65 }],
  }),
  walked_into_skewer: facts({
    motifs: [{ type: 'skewer', front: B('K', 'e8'), behind: B('R', 'a8'), by: W('B', 'b5') }],
    situations: [{ kind: 'walked_into_skewer', severity: 0.7 }],
  }),
  missed_capture: facts({
    classification: 'miss',
    bestMove: 'Rxd1',
    bestLine: ['Rxd1'],
    motifs: [{ type: 'missed_capture', target: W('R', 'd1'), value: 5 }],
    bestMoveEffect: { captures: W('R', 'd1'), check: false, materialGain: 5, line: ['Rxd1'] },
    situations: [{ kind: 'missed_capture', severity: 0.7 }],
  }),
  ignored_threat: facts({
    motifs: [
      {
        type: 'opponent_threat',
        kind: 'capture',
        by: W('N', 'c5'),
        targets: [B('B', 'b7')],
        line: ['Nxb7'],
      },
    ],
    situations: [{ kind: 'ignored_threat', severity: 0.8 }],
  }),
  created_fork: goodFacts({
    san: 'Nc5',
    bestMove: 'Nc5',
    color: 'w',
    motifs: [{ ...FORK, byMover: true }],
    bestMoveEffect: {
      check: false,
      forks: [B('N', 'd7'), B('B', 'b7')],
      materialGain: 0,
      line: ['Nc5'],
    },
    situations: [{ kind: 'created_fork', severity: 0.8 }],
  }),
  created_discovered: goodFacts({
    motifs: [
      {
        type: 'discovered_attack',
        mover: B('N', 'e4'),
        attacker: B('B', 'b7'),
        target: W('Q', 'g2'),
        check: false,
      },
    ],
    situations: [{ kind: 'created_discovered', severity: 0.75 }],
  }),
  trapped_piece: facts({
    motifs: [{ type: 'trapped_piece', target: B('B', 'h3'), attackers: [W('P', 'g2')] }],
    situations: [{ kind: 'trapped_piece', severity: 0.75 }],
  }),
  traded_behind: facts({
    classification: 'inaccuracy',
    motifs: [{ type: 'traded_while_behind', deficit: -3, captured: W('N', 'f3') }],
    situations: [{ kind: 'traded_behind', severity: 0.45 }],
  }),
  unsound_sacrifice: facts({
    motifs: [{ type: 'sacrifice', piece: B('B', 'h3'), netMaterial: -3, sound: false }],
    situations: [{ kind: 'unsound_sacrifice', severity: 0.8 }],
  }),
  sound_sacrifice: goodFacts({
    classification: 'brilliant',
    motifs: [{ type: 'sacrifice', piece: B('B', 'h3'), netMaterial: -3, sound: true }],
    situations: [{ kind: 'sound_sacrifice', severity: 0.9 }],
  }),
  only_move: goodFacts({
    classification: 'great',
    motifs: [{ type: 'only_move', margin: 0.2 }],
    situations: [{ kind: 'only_move', severity: 0.7 }],
  }),
  left_book: goodFacts({
    classification: 'good',
    opening: { eco: 'B90', name: 'Sicilian Defense: Najdorf Variation' },
    situations: [{ kind: 'left_book', severity: 0.3 }],
  }),
  book: goodFacts({
    classification: 'book',
    opening: { eco: 'B90', name: 'Sicilian Defense: Najdorf Variation' },
    leftBook: false,
    situations: [{ kind: 'book', severity: 0.1 }],
  }),
  best: goodFacts({ situations: [{ kind: 'best', severity: 0.2 }] }),
  good: goodFacts({
    classification: 'good',
    epLoss: 0.02,
    winAfter: 50,
    situations: [{ kind: 'good', severity: 0.15 }],
  }),
  quiet_loss: facts({
    classification: 'inaccuracy',
    epLoss: 0.06,
    winAfter: 46,
    situations: [{ kind: 'quiet_loss', severity: 0.35 }],
  }),
  back_rank: facts({
    motifs: [{ type: 'back_rank_weak', side: 'b' }],
    situations: [{ kind: 'back_rank', severity: 0.4 }],
  }),
  passed_pawn: goodFacts({
    motifs: [{ type: 'passed_pawn', pawn: B('P', 'c3'), stepsToPromote: 2, created: true }],
    situations: [{ kind: 'passed_pawn', severity: 0.4 }],
  }),
  promotion: goodFacts({
    san: 'c1=Q',
    bestMove: 'c1=Q',
    motifs: [{ type: 'promotion', square: 'c1', inBestLine: true }],
    situations: [{ kind: 'promotion', severity: 0.6 }],
  }),
  king_exposed: facts({
    classification: 'mistake',
    motifs: [
      {
        type: 'king_safety',
        side: 'b',
        score: 0.7,
        openFiles: ['g', 'h'],
        shieldMissing: ['g7', 'h7'],
        attackersInZone: [W('Q', 'h5'), W('B', 'd3')],
      },
    ],
    situations: [{ kind: 'king_exposed', severity: 0.55 }],
  }),
  overloaded: facts({
    classification: 'mistake',
    motifs: [
      { type: 'overloaded_defender', defender: B('Q', 'd8'), duties: [B('N', 'd7'), B('B', 'b7')] },
    ],
    situations: [{ kind: 'overloaded', severity: 0.6 }],
  }),
  zugzwang: facts({
    classification: 'mistake',
    phase: 'endgame',
    motifs: [{ type: 'zugzwang', side: 'b' }],
    situations: [{ kind: 'zugzwang', severity: 0.35 }],
  }),
  fortress: facts({
    classification: 'inaccuracy',
    phase: 'endgame',
    motifs: [{ type: 'fortress', side: 'b', deficit: 3, stablePlies: 10 }],
    situations: [{ kind: 'fortress', severity: 0.3 }],
  }),
};

const ALL_KINDS = Object.keys(CASES) as SituationKind[];

// ---------------------------------------------------------------------------
// Helpers

const inSlot = (p: Plan, slot: Proposition['slot']) => p.props.filter((x) => x.slot === slot);
const ofKind = (p: Plan, kind: Proposition['kind']) => p.props.filter((x) => x.kind === kind);
const leadObservation = (p: Plan) =>
  p.props.find((x) => x.slot === 'whatHappened' && x.role === 'observation');

const LOSS_KINDS: Proposition['kind'][] = [
  'hangs',
  'attacked_by',
  'under_defended',
  'forked',
  'pinned',
  'skewered',
  'trapped',
  'missed_capture',
  'missed_mate',
  'mate_allowed',
  'ignored_threat',
  'traded_behind',
  'quiet_loss',
  'back_rank',
  'king_exposed',
  'overloaded',
];

/** The five things every plan must carry. */
function expectComplete(p: Plan) {
  expect(ofKind(p, 'verdict')).toHaveLength(1);
  expect(ofKind(p, 'verdict')[0]!.slot).toBe('headline');
  expect(inSlot(p, 'headline')).toHaveLength(1);
  expect(inSlot(p, 'whatHappened').filter((x) => x.role === 'observation').length).toBeGreaterThanOrEqual(1);
  expect(inSlot(p, 'whyItMatters').filter((x) => x.role === 'consequence').length).toBeGreaterThanOrEqual(1);
  expect(ofKind(p, 'swing').some((x) => x.slot === 'whyItMatters')).toBe(true);
  const bestMove = ofKind(p, 'best_move');
  expect(bestMove).toHaveLength(1);
  expect(bestMove[0]!.slot).toBe('betterWas');
  expect(bestMove[0]!.args.move).toBe(p.facts.bestMove);
  expect(ofKind(p, 'lesson')).toHaveLength(1);
  expect(ofKind(p, 'lesson')[0]!.slot).toBe('lesson');
  // slot order, then weight
  const order = p.props.map((x) => SLOTS.indexOf(x.slot));
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  for (let i = 1; i < p.props.length; i++) {
    const a = p.props[i - 1]!;
    const b = p.props[i]!;
    if (a.slot === b.slot) expect(a.weight).toBeGreaterThanOrEqual(b.weight);
  }
  // weight-1 skeleton
  for (const kind of ['verdict', 'swing', 'best_move', 'lesson'] as const) {
    expect(ofKind(p, kind)[0]!.weight).toBe(1);
  }
  expect(leadObservation(p)!.weight).toBe(1);
}

// ---------------------------------------------------------------------------

describe('plan: slot coverage for every situation kind', () => {
  for (const kind of ALL_KINDS) {
    it(`${kind} leads with ${OBSERVATION_BY_LEAD[kind]} and teaches ${LESSON_BY_LEAD[kind]}`, () => {
      const p = plan(CASES[kind], 'intermediate');
      expect(p.lead).toBe(kind);
      expectComplete(p);
      const lead = leadObservation(p)!;
      expect(lead.kind).toBe(OBSERVATION_BY_LEAD[kind]);
      expect(ofKind(p, 'lesson')[0]!.args.concept).toBe(LESSON_BY_LEAD[kind]);
      expect(ofKind(p, 'lesson')[0]!.args.lead).toBe(kind);
      expect(ofKind(p, 'verdict')[0]!.args).toMatchObject({
        classification: CASES[kind].classification,
        san: CASES[kind].san,
        ply: CASES[kind].ply,
        color: CASES[kind].color,
        lead: kind,
      });
    });
  }

  it('carries the motif fields the realiser needs', () => {
    const fork = leadObservation(plan(CASES.walked_into_fork, 'intermediate'))!;
    expect(fork.args.by).toEqual(W('N', 'c5'));
    expect(fork.args.targets).toEqual([B('N', 'd7'), B('B', 'b7')]);

    const hang = leadObservation(plan(CASES.hung_piece, 'intermediate'))!;
    expect(hang.args).toEqual({ target: B('N', 'd7'), attackers: [W('N', 'c5')], defenders: [] });

    const pin = leadObservation(plan(CASES.walked_into_pin, 'intermediate'))!;
    expect(pin.args).toMatchObject({ pinned: B('N', 'd7'), pinner: W('B', 'g4'), absolute: false });

    const skewer = leadObservation(plan(CASES.walked_into_skewer, 'intermediate'))!;
    expect(skewer.args).toMatchObject({ front: B('K', 'e8'), behind: B('R', 'a8'), by: W('B', 'b5') });

    const missed = leadObservation(plan(CASES.missed_capture, 'intermediate'))!;
    expect(missed.args).toEqual({ target: W('R', 'd1'), value: 5 });

    const threat = leadObservation(plan(CASES.ignored_threat, 'intermediate'))!;
    expect(threat.args).toMatchObject({ kind: 'capture', by: W('N', 'c5'), line: ['Nxb7'] });

    const sac = leadObservation(plan(CASES.unsound_sacrifice, 'intermediate'))!;
    expect(sac.args).toEqual({ piece: B('B', 'h3'), netMaterial: -3, sound: false });

    const only = leadObservation(plan(CASES.only_move, 'intermediate'))!;
    expect(only.args.margin).toBe(0.2);

    const mate = leadObservation(plan(CASES.allowed_mate, 'intermediate'))!;
    expect(mate.args.line).toEqual(['Qxh7+', 'Kf8', 'Qh8#']);

    const missedMate = leadObservation(plan(CASES.missed_mate, 'intermediate'))!;
    expect(missedMate.args).toMatchObject({ line: ['Qxh7+', 'Kf8', 'Qh8#'], mateIn: 2 });

    const book = leadObservation(plan(CASES.left_book, 'intermediate'))!;
    expect(book.args).toMatchObject({ name: 'Sicilian Defense: Najdorf Variation', eco: 'B90' });

    const king = leadObservation(plan(CASES.king_exposed, 'intermediate'))!;
    expect(king.args).toMatchObject({ side: 'b', openFiles: ['g', 'h'], shieldMissing: ['g7', 'h7'] });

    const quiet = leadObservation(plan(CASES.quiet_loss, 'intermediate'))!;
    expect(quiet.args).toMatchObject({ materialGain: 0, check: false, move: 'Be6' });
  });

  it('takes the motif from the facts when the situation carries none', () => {
    const p = plan(CASES.trapped_piece, 'intermediate');
    expect(leadObservation(p)!.args.target).toEqual(B('B', 'h3'));
  });

  it('falls back to a provable lead when the situation names a motif the facts lack', () => {
    const p = plan(facts({ situations: [{ kind: 'hung_piece', severity: 0.72 }] }), 'intermediate');
    expect(p.lead).toBe('quiet_loss');
    expectComplete(p);
  });
});

describe('plan: the mate delivered case', () => {
  it('praises the mate, loses nothing, and teaches checks first', () => {
    const p = plan(CASES.mate_delivered, 'intermediate');
    expectComplete(p);
    expect(p.lead).toBe('mate_delivered');
    expect(leadObservation(p)!.kind).toBe('mate_delivered');
    expect(leadObservation(p)!.args.move).toBe('Qh8#');
    expect(ofKind(p, 'lesson')[0]!.args.concept).toBe('checks_first');
    expect(p.props.filter((x) => LOSS_KINDS.includes(x.kind))).toEqual([]);
    expect(ofKind(p, 'best_move')[0]!.args).toMatchObject({ move: 'Qh8#', played: true });
    expect(ofKind(p, 'swing')[0]!.args).toMatchObject({ winBefore: 52, winAfter: 100 });
  });

  it('is recognised from the SAN alone when there are no situations', () => {
    const p = plan(goodFacts({ san: 'Qh8#', bestMove: 'Qh8#', situations: [] }), 'intermediate');
    expect(p.lead).toBe('mate_delivered');
  });
});

describe('plan: empty situations', () => {
  it('a blunder with no situations still yields a complete plan led by quiet_loss', () => {
    const p = plan(facts({ situations: [] }), 'intermediate');
    expect(p.lead).toBe('quiet_loss');
    expectComplete(p);
    expect(leadObservation(p)!.kind).toBe('quiet_loss');
    expect(ofKind(p, 'lesson')[0]!.args.concept).toBe('keep_the_tension');
  });

  it('a best move with no situations leads with best', () => {
    const p = plan(goodFacts({ situations: [] }), 'intermediate');
    expect(p.lead).toBe('best');
    expectComplete(p);
    expect(leadObservation(p)!.kind).toBe('best_does');
  });

  it('a good move with no situations leads with good', () => {
    const p = plan(goodFacts({ classification: 'excellent', situations: [] }), 'intermediate');
    expect(p.lead).toBe('good');
    expectComplete(p);
    // Not a second swing: the consequence slot already carries it.
    expect(leadObservation(p)!.kind).toBe('best_does');
    expect(leadObservation(p)!.args.played).toBe(true);
  });

  it('fallbackLead is by classification', () => {
    expect(fallbackLead(facts({ classification: 'brilliant' }))).toBe('best');
    expect(fallbackLead(facts({ classification: 'great' }))).toBe('best');
    expect(fallbackLead(facts({ classification: 'book' }))).toBe('good');
    expect(fallbackLead(facts({ classification: 'inaccuracy' }))).toBe('quiet_loss');
    expect(fallbackLead(facts({ classification: 'miss' }))).toBe('quiet_loss');
  });

  it('never throws over any classification with empty situations and motifs', () => {
    const classes: MoveFacts['classification'][] = [
      'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder',
    ];
    for (const classification of classes) {
      for (const audience of ['beginner', 'intermediate', 'advanced'] as const) {
        expectComplete(plan(facts({ classification, situations: [], motifs: [] }), audience));
      }
    }
  });
});

describe('plan: a good move gets no loss props', () => {
  for (const kind of ['best', 'good', 'book', 'left_book', 'created_fork', 'sound_sacrifice', 'only_move', 'passed_pawn', 'promotion', 'mate_delivered'] as const) {
    it(`${kind}`, () => {
      const p = plan(CASES[kind], 'advanced');
      expect(p.props.filter((x) => LOSS_KINDS.includes(x.kind))).toEqual([]);
    });
  }

  it('does not add a missed_mate consequence when the played move is the mating move', () => {
    const p = plan(
      goodFacts({
        san: 'Qxh7+',
        bestMove: 'Qxh7+',
        bestMoveEffect: { check: true, mateIn: 2, materialGain: 0, line: ['Qxh7+', 'Kf8', 'Qh8#'] },
        situations: [],
      }),
      'intermediate',
    );
    expect(ofKind(p, 'missed_mate')).toEqual([]);
    expect(ofKind(p, 'best_does')).toHaveLength(1);
    expect(ofKind(p, 'best_does')[0]!.slot).toBe('whatHappened');
  });
});

describe('plan: whatHappened', () => {
  it('adds the second situation as a 0.6 supporting observation when its severity is at least 0.5', () => {
    const p = plan(CASES.walked_into_fork, 'intermediate');
    const obs = inSlot(p, 'whatHappened').filter((x) => x.role === 'observation');
    expect(obs.map((x) => x.kind)).toEqual(['forked', 'attacked_by']);
    expect(obs[1]!.weight).toBe(0.6);
    expect(obs[1]!.args.target).toEqual(B('N', 'd7'));
  });

  it('skips a weak second situation', () => {
    const p = plan(
      facts({
        motifs: [FORK, { type: 'back_rank_weak', side: 'b' }],
        situations: [
          { kind: 'walked_into_fork', severity: 0.85 },
          { kind: 'back_rank', severity: 0.4 },
        ],
      }),
      'intermediate',
    );
    expect(inSlot(p, 'whatHappened').filter((x) => x.role === 'observation')).toHaveLength(1);
  });

  it('skips a second situation that repeats the lead', () => {
    const p = plan(
      facts({
        motifs: [HANG],
        situations: [
          { kind: 'hung_piece', severity: 0.72 },
          { kind: 'hung_piece', severity: 0.72 },
        ],
      }),
      'intermediate',
    );
    expect(inSlot(p, 'whatHappened').filter((x) => x.role === 'observation')).toHaveLength(1);
  });
});

describe('plan: whyItMatters', () => {
  it('always has swing with the win numbers', () => {
    const p = plan(CASES.hung_piece, 'intermediate');
    const swing = inSlot(p, 'whyItMatters').find((x) => x.kind === 'swing')!;
    expect(swing.args).toEqual({ winBefore: 52, winAfter: 18, epLoss: 0.34, held: false });
    expect(swing.role).toBe('consequence');
  });

  it('adds material_delta at 0.7 only when |materialGain| >= 1', () => {
    const none = plan(CASES.hung_piece, 'intermediate');
    expect(ofKind(none, 'material_delta')).toEqual([]);

    const some = plan(
      facts({
        motifs: [HANG],
        situations: [{ kind: 'hung_piece', severity: 0.72 }],
        bestMoveEffect: { check: false, materialGain: 3, line: ['Be6'] },
      }),
      'intermediate',
    );
    const delta = ofKind(some, 'material_delta');
    expect(delta).toHaveLength(1);
    expect(delta[0]!).toMatchObject({ slot: 'whyItMatters', weight: 0.7, args: { materialGain: 3 } });
  });

  it('adds mate_allowed as a consequence when a mate is threatened and the lead is something else', () => {
    const p = plan(
      facts({
        motifs: [HANG, { type: 'mate_threat', line: ['Qxh7+', 'Kf8', 'Qh8#'] }],
        situations: [{ kind: 'hung_piece', severity: 0.72 }],
      }),
      'intermediate',
    );
    const mate = ofKind(p, 'mate_allowed');
    expect(mate).toHaveLength(1);
    expect(mate[0]!).toMatchObject({ slot: 'whyItMatters', role: 'consequence' });
    expect(mate[0]!.args.line).toEqual(['Qxh7+', 'Kf8', 'Qh8#']);
  });

  it('reads the mate line from an opponent_threat of kind mate too', () => {
    const p = plan(
      facts({
        motifs: [
          HANG,
          { type: 'opponent_threat', kind: 'mate', by: W('Q', 'h5'), targets: [B('K', 'g8')], line: ['Qxh7#'] },
        ],
        situations: [{ kind: 'hung_piece', severity: 0.72 }],
      }),
      'intermediate',
    );
    expect(ofKind(p, 'mate_allowed')[0]!.args.line).toEqual(['Qxh7#']);
  });

  it('does not repeat mate_allowed when it is already the lead observation', () => {
    const p = plan(CASES.allowed_mate, 'intermediate');
    expect(ofKind(p, 'mate_allowed')).toHaveLength(1);
    expect(ofKind(p, 'mate_allowed')[0]!.slot).toBe('whatHappened');
  });

  it('adds missed_mate as a consequence when the best move mated and the lead is something else', () => {
    const p = plan(
      facts({
        classification: 'miss',
        motifs: [HANG],
        situations: [{ kind: 'hung_piece', severity: 0.72 }],
        bestMoveEffect: { check: true, mateIn: 3, materialGain: 0, line: ['Qxh7+'] },
      }),
      'intermediate',
    );
    const missed = ofKind(p, 'missed_mate');
    expect(missed).toHaveLength(1);
    expect(missed[0]!).toMatchObject({ slot: 'whyItMatters', args: { mateIn: 3, line: ['Qxh7+'] } });
  });

  it('does not repeat missed_mate when it is already the lead observation', () => {
    const p = plan(CASES.missed_mate, 'intermediate');
    expect(ofKind(p, 'missed_mate')).toHaveLength(1);
    expect(ofKind(p, 'missed_mate')[0]!.slot).toBe('whatHappened');
  });
});

describe('plan: betterWas', () => {
  it('names the best move first', () => {
    const p = plan(CASES.hung_piece, 'intermediate');
    const better = inSlot(p, 'betterWas');
    expect(better[0]!.kind).toBe('best_move');
    expect(better[0]!.args).toMatchObject({ move: 'Be6', san: 'Nd7', played: false });
  });

  it('adds best_does at 0.8 when the best move captures, checks, forks or mates', () => {
    const none = plan(CASES.hung_piece, 'intermediate');
    expect(ofKind(none, 'best_does')).toEqual([]);

    const capture = plan(CASES.missed_capture, 'intermediate');
    const does = ofKind(capture, 'best_does');
    expect(does).toHaveLength(1);
    expect(does[0]!).toMatchObject({
      slot: 'betterWas',
      weight: 0.8,
      args: { captures: W('R', 'd1'), check: false, move: 'Rxd1' },
    });
    expect(does[0]!.args.mateIn).toBeUndefined();
    expect(does[0]!.args.forks).toBeUndefined();

    const check = plan(
      facts({ situations: [], bestMoveEffect: { check: true, materialGain: 0, line: ['Bb5+'] } }),
      'intermediate',
    );
    expect(ofKind(check, 'best_does')[0]!.args.check).toBe(true);

    const fork = plan(
      facts({
        situations: [],
        bestMoveEffect: { check: false, forks: [W('K', 'g1'), W('Q', 'd1')], materialGain: 0, line: ['Ne2+'] },
      }),
      'intermediate',
    );
    expect(ofKind(fork, 'best_does')[0]!.args.forks).toEqual([W('K', 'g1'), W('Q', 'd1')]);
  });

  it('does not repeat best_does when the played move was the best move', () => {
    const p = plan(CASES.created_fork, 'intermediate');
    expect(ofKind(p, 'best_does')).toEqual([]);
  });
});

describe('plan: audiences', () => {
  it('beginner gets one define for the first technical term', () => {
    const p = plan(CASES.walked_into_fork, 'beginner');
    const define = ofKind(p, 'define');
    expect(define).toHaveLength(1);
    expect(define[0]!).toMatchObject({
      role: 'definition',
      slot: 'whatHappened',
      weight: 0.5,
      args: { term: 'fork', of: 'forked' },
    });
    expect(ofKind(p, 'best_line')).toEqual([]);
  });

  it('beginner defines each of the terms in the list', () => {
    const expected: Partial<Record<SituationKind, string>> = {
      walked_into_fork: 'fork',
      created_fork: 'fork',
      walked_into_pin: 'pin',
      walked_into_skewer: 'skewer',
      created_discovered: 'discovered attack',
      zugzwang: 'zugzwang',
      fortress: 'fortress',
      back_rank: 'back rank',
      passed_pawn: 'passed pawn',
      overloaded: 'overloaded',
    };
    for (const [kind, term] of Object.entries(expected) as [SituationKind, string][]) {
      const p = plan(CASES[kind], 'beginner');
      expect(ofKind(p, 'define').map((x) => x.args.term), kind).toEqual([term]);
    }
  });

  it('beginner gets no define when no term is used', () => {
    const p = plan(CASES.hung_piece, 'beginner');
    expect(ofKind(p, 'define')).toEqual([]);
  });

  it('beginner defines the first term in slot order, once', () => {
    const p = plan(
      facts({
        motifs: [
          { type: 'pin', pinned: B('N', 'd7'), pinner: W('B', 'g4'), against: B('Q', 'd8'), absolute: false },
          { type: 'skewer', front: B('K', 'e8'), behind: B('R', 'a8'), by: W('B', 'b5') },
        ],
        situations: [
          { kind: 'walked_into_pin', severity: 0.65 },
          { kind: 'walked_into_skewer', severity: 0.7 },
        ],
      }),
      'beginner',
    );
    expect(ofKind(p, 'define').map((x) => x.args.term)).toEqual(['pin']);
  });

  it('advanced gets best_line at 0.4 and no define', () => {
    const p = plan(CASES.walked_into_fork, 'advanced');
    const line = ofKind(p, 'best_line');
    expect(line).toHaveLength(1);
    expect(line[0]!).toMatchObject({
      slot: 'betterWas',
      weight: 0.4,
      args: { line: ['Be6', 'Nxe6', 'fxe6'], move: 'Be6' },
    });
    expect(ofKind(p, 'define')).toEqual([]);
    expect(inSlot(p, 'betterWas').map((x) => x.kind)).toEqual(['best_move', 'best_line']);
  });

  it('advanced best_line falls back to the best move when the line is empty', () => {
    const p = plan(
      facts({ situations: [], bestLine: [], bestMoveEffect: { check: false, materialGain: 0, line: [] } }),
      'advanced',
    );
    expect(ofKind(p, 'best_line')[0]!.args.line).toEqual(['Be6']);
  });

  it('intermediate gets neither', () => {
    const p = plan(CASES.walked_into_fork, 'intermediate');
    expect(ofKind(p, 'define')).toEqual([]);
    expect(ofKind(p, 'best_line')).toEqual([]);
  });

  it('records the audience on the plan', () => {
    expect(plan(CASES.best, 'beginner').audience).toBe('beginner');
    expect(plan(CASES.best, 'advanced').audience).toBe('advanced');
  });
});

describe('fitPlan', () => {
  /** walked_into_fork, beginner, with a material gain: 8 props. */
  const full = plan(
    facts({
      motifs: [FORK, HANG],
      situations: [
        { kind: 'walked_into_fork', severity: 0.85 },
        { kind: 'hung_piece', severity: 0.72 },
      ],
      bestMoveEffect: { captures: W('N', 'c5'), check: false, materialGain: 3, line: ['Be6', 'Nxe6', 'fxe6'] },
    }),
    'beginner',
  );

  it('plan() itself cuts nothing', () => {
    expect(full.props.map((x) => x.kind)).toEqual([
      'verdict',
      'forked',
      'attacked_by',
      'define',
      'swing',
      'material_delta',
      'best_move',
      'best_does',
      'lesson',
    ]);
  });

  it('returns the plan unchanged when it fits', () => {
    const fitted = fitPlan(full, full.props.length * WORDS_PER_PROP);
    expect(fitted.props).toEqual(full.props);
    expect(fitted).not.toBe(full);
  });

  it('drops the lowest weight first', () => {
    const one = fitPlan(full, (full.props.length - 1) * WORDS_PER_PROP);
    expect(one.props.map((x) => x.kind)).not.toContain('define'); // 0.5
    expect(one.props).toHaveLength(full.props.length - 1);

    const two = fitPlan(full, (full.props.length - 2) * WORDS_PER_PROP);
    expect(two.props.map((x) => x.kind)).not.toContain('attacked_by'); // 0.6

    const three = fitPlan(full, (full.props.length - 3) * WORDS_PER_PROP);
    expect(three.props.map((x) => x.kind)).not.toContain('material_delta'); // 0.7

    const four = fitPlan(full, (full.props.length - 4) * WORDS_PER_PROP);
    expect(four.props.map((x) => x.kind)).toEqual(['verdict', 'forked', 'swing', 'best_move', 'lesson']);
  });

  it('never drops weight-1 props, even under an impossible budget', () => {
    const fitted = fitPlan(full, 0);
    expect(fitted.props.map((x) => x.kind)).toEqual(['verdict', 'forked', 'swing', 'best_move', 'lesson']);
    expect(fitted.props.every((x) => x.weight === 1)).toBe(true);
  });

  it('drops the later of two equal weights first', () => {
    const p = plan(CASES.walked_into_fork, 'advanced'); // ... best_move, best_line(0.4)
    const tied: Plan = {
      ...p,
      props: [
        ...p.props,
        { kind: 'best_line', role: 'counterfactual', slot: 'betterWas', args: { line: ['x'] }, weight: 0.4 },
      ],
    };
    const fitted = fitPlan(tied, (tied.props.length - 1) * WORDS_PER_PROP);
    const lines = fitted.props.filter((x) => x.kind === 'best_line');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.args.line).toEqual(['Be6', 'Nxe6', 'fxe6']);
  });

  it('keeps slot order', () => {
    const fitted = fitPlan(full, 6 * WORDS_PER_PROP);
    const order = fitted.props.map((x) => SLOTS.indexOf(x.slot));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(full);
    fitPlan(full, 0);
    expect(JSON.stringify(full)).toBe(before);
  });
});

describe('plan: the plan record', () => {
  it('echoes facts, classification and epLoss', () => {
    const f = CASES.walked_into_fork;
    const p = plan(f, 'intermediate');
    expect(p.facts).toBe(f);
    expect(p.classification).toBe('blunder');
    expect(p.epLoss).toBe(0.34);
  });

  it('has one verdict and one lesson for every kind and audience', () => {
    for (const kind of ALL_KINDS) {
      for (const audience of ['beginner', 'intermediate', 'advanced'] as const) {
        const p = plan(CASES[kind], audience);
        expect(ofKind(p, 'verdict'), `${kind}/${audience}`).toHaveLength(1);
        expect(ofKind(p, 'lesson'), `${kind}/${audience}`).toHaveLength(1);
        expect(ofKind(p, 'define').length, `${kind}/${audience}`).toBeLessThanOrEqual(audience === 'beginner' ? 1 : 0);
        expect(ofKind(p, 'best_line').length, `${kind}/${audience}`).toBe(audience === 'advanced' ? 1 : 0);
      }
    }
  });

  it('never carries an undefined arg', () => {
    for (const kind of ALL_KINDS) {
      const p = plan(CASES[kind], 'advanced');
      for (const prop of p.props) {
        for (const [k, v] of Object.entries(prop.args)) {
          expect(v, `${kind}: ${prop.kind}.${k}`).toBeDefined();
        }
      }
    }
  });
});
