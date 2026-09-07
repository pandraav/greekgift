import { describe, expect, it } from 'vitest';

import { rankSituations } from '../src/situations.ts';
import type {
  Classification,
  Motif,
  MoveFacts,
  PieceRef,
  Situation,
  SituationKind,
} from '../src/types.ts';

type Facts = Omit<MoveFacts, 'situations'>;

const piece = (p: PieceRef['piece'], square: string, color: PieceRef['color'] = 'b'): PieceRef => ({
  piece: p,
  square,
  color,
});

/** A minimal, quiet set of facts: no motifs, nothing to say. */
function makeFacts(over: Partial<Facts> = {}): Facts {
  return {
    ply: 21,
    color: 'w',
    san: 'Nf3',
    classification: 'mistake',
    epLoss: 0.2,
    winBefore: 55,
    winAfter: 35,
    moveAccuracy: 60,
    forced: false,
    bestMove: 'Bb5',
    bestLine: ['Bb5', 'a6', 'Bxc6'],
    playedLine: ['Nf3', 'e5'],
    motifs: [],
    materialAfterBestLine: 0,
    materialAfterPlayedLine: 0,
    bestMoveEffect: { check: false, materialGain: 0, line: [] },
    phase: 'middlegame',
    leftBook: false,
    audience: 'intermediate',
    ...over,
  };
}

const kinds = (situations: Situation[]): SituationKind[] => situations.map((s) => s.kind);

/** Rank one motif on a losing move (so nothing is filtered as praise-only). */
function rankOne(motif: Motif, over: Partial<Facts> = {}): Situation {
  const [first] = rankSituations(makeFacts({ motifs: [motif], ...over }));
  expect(first).toBeDefined();
  return first as Situation;
}

describe('rankSituations — motif mapping', () => {
  it('maps mate_threat to allowed_mate at the top severity', () => {
    const s = rankOne({ type: 'mate_threat', line: ['Qh5', 'g6', 'Qxg6#'] });
    expect(s.kind).toBe('allowed_mate');
    expect(s.severity).toBe(1);
    expect(s.motif).toEqual({ type: 'mate_threat', line: ['Qh5', 'g6', 'Qxg6#'] });
  });

  it('maps missed_mate', () => {
    const s = rankOne({ type: 'missed_mate', line: ['Qxh7#'] });
    expect(s.kind).toBe('missed_mate');
    expect(s.severity).toBeCloseTo(0.98, 10);
  });

  it('maps an undefended hanging piece to hung_piece, scaled by value', () => {
    const rook = rankOne({
      type: 'hanging_piece',
      target: piece('R', 'a8'),
      attackers: [piece('N', 'b6', 'w')],
      defenders: [],
    });
    expect(rook.kind).toBe('hung_piece');
    expect(rook.severity).toBeCloseTo(0.6 + 0.04 * 5, 10);

    const pawn = rankOne({
      type: 'hanging_piece',
      target: piece('P', 'b7'),
      attackers: [piece('B', 'f3', 'w')],
      defenders: [],
    });
    expect(pawn.severity).toBeCloseTo(0.64, 10);
    expect(rook.severity).toBeGreaterThan(pawn.severity);
  });

  it('maps a defended hanging piece to under_defended', () => {
    const s = rankOne({
      type: 'hanging_piece',
      target: piece('N', 'c6'),
      attackers: [piece('B', 'b5', 'w'), piece('N', 'e5', 'w')],
      defenders: [piece('P', 'b7')],
    });
    expect(s.kind).toBe('under_defended');
    expect(s.severity).toBeCloseTo(0.5, 10);
  });

  it('maps a fork by the opponent to walked_into_fork', () => {
    const s = rankOne({
      type: 'fork',
      by: piece('N', 'e5'),
      targets: [piece('K', 'g1', 'w'), piece('R', 'a1', 'w')],
      byMover: false,
    });
    expect(s.kind).toBe('walked_into_fork');
    expect(s.severity).toBeCloseTo(0.85, 10);
  });

  it('maps a fork by the mover to created_fork', () => {
    const s = rankOne(
      {
        type: 'fork',
        by: piece('N', 'e5', 'w'),
        targets: [piece('K', 'g8'), piece('R', 'a8')],
        byMover: true,
      },
      { classification: 'best', epLoss: 0 },
    );
    expect(s.kind).toBe('created_fork');
    expect(s.severity).toBeCloseTo(0.8, 10);
  });

  it('maps pin and skewer', () => {
    const pin = rankOne({
      type: 'pin',
      pinned: piece('N', 'c6'),
      pinner: piece('B', 'b5', 'w'),
      against: piece('K', 'e8'),
      absolute: true,
    });
    expect(pin.kind).toBe('walked_into_pin');
    expect(pin.severity).toBeCloseTo(0.65, 10);

    const skewer = rankOne({
      type: 'skewer',
      front: piece('Q', 'd8'),
      behind: piece('R', 'd1'),
      by: piece('R', 'd4', 'w'),
    });
    expect(skewer.kind).toBe('walked_into_skewer');
    expect(skewer.severity).toBeCloseTo(0.7, 10);
  });

  it('maps discovered_attack to created_discovered', () => {
    const s = rankOne(
      {
        type: 'discovered_attack',
        mover: piece('N', 'd5', 'w'),
        attacker: piece('B', 'b2', 'w'),
        target: piece('R', 'h8'),
        check: false,
      },
      { classification: 'best', epLoss: 0 },
    );
    expect(s.kind).toBe('created_discovered');
    expect(s.severity).toBeCloseTo(0.75, 10);
  });

  it('maps trapped_piece', () => {
    const s = rankOne({
      type: 'trapped_piece',
      target: piece('B', 'h2', 'w'),
      attackers: [piece('P', 'g3')],
    });
    expect(s.kind).toBe('trapped_piece');
    expect(s.severity).toBeCloseTo(0.75, 10);
  });

  it('maps missed_capture, scaled by value', () => {
    const s = rankOne({ type: 'missed_capture', target: piece('Q', 'd8'), value: 9 });
    expect(s.kind).toBe('missed_capture');
    expect(s.severity).toBeCloseTo(0.5 + 0.04 * 9, 10);
  });

  it('maps opponent_threat to ignored_threat, and raises a mate threat', () => {
    const capture = rankOne({
      type: 'opponent_threat',
      kind: 'capture',
      by: piece('N', 'e5'),
      targets: [piece('R', 'a1', 'w')],
      line: ['Nxc4'],
    });
    expect(capture.kind).toBe('ignored_threat');
    expect(capture.severity).toBeCloseTo(0.8, 10);

    const mate = rankOne({
      type: 'opponent_threat',
      kind: 'mate',
      by: piece('Q', 'h4'),
      targets: [piece('K', 'g1', 'w')],
      line: ['Qxh2#'],
    });
    expect(mate.kind).toBe('ignored_threat');
    expect(mate.severity).toBeCloseTo(0.95, 10);
    expect(mate.severity).toBeGreaterThan(capture.severity);
  });

  it('maps a sound sacrifice to praise and an unsound one to a loss', () => {
    const sound = rankOne(
      { type: 'sacrifice', piece: piece('B', 'h7', 'w'), netMaterial: -3, sound: true },
      { classification: 'brilliant', epLoss: 0 },
    );
    expect(sound.kind).toBe('sound_sacrifice');
    expect(sound.severity).toBeCloseTo(0.9, 10);

    const unsound = rankOne({
      type: 'sacrifice',
      piece: piece('B', 'h7', 'w'),
      netMaterial: -3,
      sound: false,
    });
    expect(unsound.kind).toBe('unsound_sacrifice');
    expect(unsound.severity).toBeCloseTo(0.8, 10);
  });

  it('maps only_move', () => {
    const s = rankOne({ type: 'only_move', margin: 0.3 }, { classification: 'great', epLoss: 0 });
    expect(s.kind).toBe('only_move');
    expect(s.severity).toBeCloseTo(0.7, 10);
  });

  it('maps back_rank_weak, king_safety, overloaded_defender, zugzwang and fortress', () => {
    expect(rankOne({ type: 'back_rank_weak', side: 'w' })).toMatchObject({
      kind: 'back_rank',
      severity: 0.4,
    });
    expect(
      rankOne({
        type: 'king_safety',
        side: 'w',
        score: 0.7,
        openFiles: ['g'],
        shieldMissing: ['g2'],
        attackersInZone: [piece('Q', 'h4')],
      }),
    ).toMatchObject({ kind: 'king_exposed', severity: 0.55 });
    expect(
      rankOne({
        type: 'overloaded_defender',
        defender: piece('R', 'e1', 'w'),
        duties: [piece('N', 'e4', 'w'), piece('P', 'a1', 'w')],
      }),
    ).toMatchObject({ kind: 'overloaded', severity: 0.6 });
    expect(rankOne({ type: 'zugzwang', side: 'w' })).toMatchObject({
      kind: 'zugzwang',
      severity: 0.35,
    });
    expect(
      rankOne({ type: 'fortress', side: 'b', deficit: 4, stablePlies: 12 }),
    ).toMatchObject({ kind: 'fortress', severity: 0.3 });
  });

  it('maps passed_pawn and promotion as praise', () => {
    const passed = rankOne(
      {
        type: 'passed_pawn',
        pawn: piece('P', 'd5', 'w'),
        stepsToPromote: 3,
        created: true,
      },
      { classification: 'best', epLoss: 0 },
    );
    expect(passed).toMatchObject({ kind: 'passed_pawn', severity: 0.4 });

    const promo = rankOne(
      { type: 'promotion', square: 'd8', inBestLine: true },
      { classification: 'best', epLoss: 0 },
    );
    expect(promo).toMatchObject({ kind: 'promotion', severity: 0.6 });
  });

  it('maps traded_while_behind to traded_behind', () => {
    const s = rankOne({
      type: 'traded_while_behind',
      deficit: -3,
      captured: piece('N', 'c6'),
    });
    expect(s).toMatchObject({ kind: 'traded_behind', severity: 0.45 });
  });

  it('carries the motif as evidence on every mapped situation', () => {
    const motifs: Motif[] = [
      { type: 'missed_mate', line: ['Qxh7#'] },
      { type: 'missed_capture', target: piece('R', 'a8'), value: 5 },
    ];
    const out = rankSituations(makeFacts({ motifs }));
    expect(out.every((s) => s.motif !== undefined)).toBe(true);
    expect(out[0]?.motif).toBe(motifs[0]);
  });
});

describe('rankSituations — classification mapping', () => {
  it('emits book for a book move', () => {
    const out = rankSituations(
      makeFacts({ classification: 'book', epLoss: 0, san: 'e4', bestMove: 'e4' }),
    );
    expect(kinds(out)).toContain('book');
    expect(out.find((s) => s.kind === 'book')?.severity).toBeCloseTo(0.1, 10);
    expect(kinds(out)).not.toContain('best');
  });

  it('emits left_book when the move left the book', () => {
    const out = rankSituations(makeFacts({ classification: 'good', epLoss: 0, leftBook: true }));
    expect(kinds(out)).toContain('left_book');
    expect(out.find((s) => s.kind === 'left_book')?.severity).toBeCloseTo(0.3, 10);
  });

  it('emits best for a best move with nothing else to praise', () => {
    const out = rankSituations(makeFacts({ classification: 'best', epLoss: 0 }));
    expect(kinds(out)).toEqual(['best']);
    expect(out[0]?.severity).toBeCloseTo(0.2, 10);
    expect(out[0]?.motif).toBeUndefined();
  });

  it('emits good for a merely good move', () => {
    const out = rankSituations(makeFacts({ classification: 'good', epLoss: 0 }));
    expect(kinds(out)).toEqual(['good']);
    expect(out[0]?.severity).toBeCloseTo(0.15, 10);
  });

  it('does not add the generic praise when a praise motif already fired', () => {
    const out = rankSituations(
      makeFacts({
        classification: 'best',
        epLoss: 0,
        motifs: [
          {
            type: 'fork',
            by: piece('N', 'e5', 'w'),
            targets: [piece('K', 'g8'), piece('Q', 'd8')],
            byMover: true,
          },
        ],
      }),
    );
    expect(kinds(out)).toEqual(['created_fork']);
  });
});

describe('rankSituations — mate_delivered', () => {
  const mating = (over: Partial<Facts> = {}): Facts =>
    makeFacts({
      classification: 'best',
      epLoss: 0,
      san: 'Qxh7#',
      bestMove: 'Qxh7',
      bestMoveEffect: { check: true, mateIn: 1, materialGain: 0, line: ['Qxh7#'] },
      ...over,
    });

  it('fires when the played move is the best move and it mates in one', () => {
    const out = rankSituations(mating());
    expect(kinds(out)).toContain('mate_delivered');
    expect(out[0]).toMatchObject({ kind: 'mate_delivered', severity: 0.97 });
  });

  it('outranks every praise but not allowed or missed mate', () => {
    const out = rankSituations(mating());
    expect(out[0]?.severity).toBeGreaterThan(0.9);
    expect(out[0]?.severity).toBeLessThan(0.98);
  });

  it('does not fire when a different move was played', () => {
    const out = rankSituations(mating({ san: 'Qh6', bestMove: 'Qxh7' }));
    expect(kinds(out)).not.toContain('mate_delivered');
  });

  it('does not fire without a mate in one', () => {
    const out = rankSituations(
      mating({ bestMoveEffect: { check: true, mateIn: 3, materialGain: 0, line: ['Qxh7+'] } }),
    );
    expect(kinds(out)).not.toContain('mate_delivered');
  });
});

describe('rankSituations — ordering', () => {
  it('sorts by severity, best first', () => {
    const out = rankSituations(
      makeFacts({
        motifs: [
          { type: 'back_rank_weak', side: 'w' },
          { type: 'missed_capture', target: piece('N', 'c6'), value: 3 },
          { type: 'mate_threat', line: ['Qh4#'] },
          {
            type: 'hanging_piece',
            target: piece('Q', 'd8'),
            attackers: [piece('R', 'd1', 'w')],
            defenders: [],
          },
        ],
      }),
    );
    expect(kinds(out)).toEqual(['allowed_mate', 'hung_piece', 'missed_capture', 'back_rank']);
    const severities = out.map((s) => s.severity);
    expect([...severities].sort((a, b) => b - a)).toEqual(severities);
  });

  it('is stable: equal severities keep the motif order', () => {
    const first: Motif = {
      type: 'trapped_piece',
      target: piece('B', 'a5', 'w'),
      attackers: [piece('P', 'b6')],
    };
    const second: Motif = {
      type: 'discovered_attack',
      mover: piece('N', 'd5', 'w'),
      attacker: piece('B', 'b2', 'w'),
      target: piece('R', 'h8'),
      check: false,
    };
    // Both 0.75; on a losing move only the trap survives, so use two traps.
    const outLoss = rankSituations(makeFacts({ motifs: [first, second] }));
    expect(kinds(outLoss)).toEqual(['trapped_piece']);

    const a: Motif = {
      type: 'hanging_piece',
      target: piece('N', 'c6'),
      attackers: [piece('B', 'b5', 'w')],
      defenders: [piece('P', 'b7')],
    };
    const b: Motif = {
      type: 'hanging_piece',
      target: piece('B', 'f5'),
      attackers: [piece('N', 'e3', 'w')],
      defenders: [piece('P', 'g6')],
    };
    const out = rankSituations(makeFacts({ motifs: [a, b] }));
    expect(kinds(out)).toEqual(['under_defended', 'under_defended']);
    expect(out[0]?.motif).toBe(a);
    expect(out[1]?.motif).toBe(b);
  });

  it('returns at most six situations', () => {
    const motifs: Motif[] = [
      { type: 'mate_threat', line: ['Qh4#'] },
      { type: 'missed_mate', line: ['Qxf7#'] },
      {
        type: 'fork',
        by: piece('N', 'e5'),
        targets: [piece('K', 'g1', 'w'), piece('R', 'a1', 'w')],
        byMover: false,
      },
      {
        type: 'opponent_threat',
        kind: 'capture',
        by: piece('R', 'd8'),
        targets: [piece('N', 'd4', 'w')],
        line: ['Rxd4'],
      },
      {
        type: 'trapped_piece',
        target: piece('B', 'h2', 'w'),
        attackers: [piece('P', 'g3')],
      },
      {
        type: 'skewer',
        front: piece('Q', 'd8'),
        behind: piece('R', 'd1'),
        by: piece('R', 'd4', 'w'),
      },
      {
        type: 'pin',
        pinned: piece('N', 'c6'),
        pinner: piece('B', 'b5', 'w'),
        against: piece('K', 'e8'),
        absolute: true,
      },
      { type: 'missed_capture', target: piece('P', 'b7'), value: 1 },
      { type: 'back_rank_weak', side: 'w' },
      { type: 'zugzwang', side: 'w' },
    ];
    const out = rankSituations(makeFacts({ motifs }));
    expect(out).toHaveLength(6);
    expect(kinds(out)).toEqual([
      'allowed_mate',
      'missed_mate',
      'walked_into_fork',
      'ignored_threat',
      'trapped_piece',
      'walked_into_skewer',
    ]);
  });
});

describe('rankSituations — the good-move and losing-move filters', () => {
  const lossMotifs: Motif[] = [
    { type: 'mate_threat', line: ['Qh4#'] },
    {
      type: 'hanging_piece',
      target: piece('R', 'a8'),
      attackers: [piece('N', 'b6', 'w')],
      defenders: [],
    },
    { type: 'missed_capture', target: piece('N', 'c6'), value: 3 },
    { type: 'sacrifice', piece: piece('B', 'h7', 'w'), netMaterial: -3, sound: false },
  ];

  const praiseMotifs: Motif[] = [
    {
      type: 'fork',
      by: piece('N', 'e5', 'w'),
      targets: [piece('K', 'g8'), piece('R', 'a8')],
      byMover: true,
    },
    { type: 'sacrifice', piece: piece('B', 'h7', 'w'), netMaterial: -3, sound: true },
    { type: 'only_move', margin: 0.4 },
    { type: 'promotion', square: 'd8', inBestLine: true },
  ];

  const goodClassifications: Classification[] = [
    'best',
    'excellent',
    'good',
    'book',
    'brilliant',
    'great',
  ];
  const losingClassifications: Classification[] = ['inaccuracy', 'mistake', 'miss', 'blunder'];

  for (const classification of goodClassifications) {
    it(`drops every loss situation from a ${classification} move`, () => {
      const out = rankSituations(
        makeFacts({ classification, epLoss: 0, motifs: [...lossMotifs, ...praiseMotifs] }),
      );
      expect(kinds(out)).not.toContain('allowed_mate');
      expect(kinds(out)).not.toContain('hung_piece');
      expect(kinds(out)).not.toContain('missed_capture');
      expect(kinds(out)).not.toContain('unsound_sacrifice');
      expect(kinds(out)).not.toContain('quiet_loss');
      expect(kinds(out)).toContain('sound_sacrifice');
    });
  }

  for (const classification of losingClassifications) {
    it(`drops every praise situation from a ${classification} move`, () => {
      const out = rankSituations(
        makeFacts({ classification, motifs: [...lossMotifs, ...praiseMotifs] }),
      );
      for (const praise of [
        'sound_sacrifice',
        'created_fork',
        'created_discovered',
        'only_move',
        'best',
        'good',
        'mate_delivered',
        'passed_pawn',
        'promotion',
      ]) {
        expect(kinds(out)).not.toContain(praise);
      }
      expect(kinds(out)).toContain('allowed_mate');
    });
  }

  it('keeps left_book on a good move — it is neither praise nor loss', () => {
    const out = rankSituations(
      makeFacts({ classification: 'excellent', epLoss: 0, leftBook: true, motifs: lossMotifs }),
    );
    expect(kinds(out)).toEqual(['left_book', 'good']);
  });
});

describe('rankSituations — quiet_loss', () => {
  it('fires on a losing move with no other loss situation', () => {
    const out = rankSituations(makeFacts({ classification: 'inaccuracy', epLoss: 0.05 }));
    expect(kinds(out)).toEqual(['quiet_loss']);
    expect(out[0]?.severity).toBeCloseTo(0.35, 10);
    expect(out[0]?.motif).toBeUndefined();
  });

  it('does not fire below the 0.045 threshold', () => {
    expect(rankSituations(makeFacts({ classification: 'inaccuracy', epLoss: 0.044 }))).toEqual([]);
    expect(
      kinds(rankSituations(makeFacts({ classification: 'inaccuracy', epLoss: 0.045 }))),
    ).toEqual(['quiet_loss']);
  });

  it('does not fire when another loss situation exists', () => {
    const out = rankSituations(
      makeFacts({
        classification: 'blunder',
        epLoss: 0.6,
        motifs: [{ type: 'back_rank_weak', side: 'w' }],
      }),
    );
    expect(kinds(out)).toEqual(['back_rank']);
  });

  it('does not fire when the only surviving situation is praise on a good move', () => {
    const out = rankSituations(makeFacts({ classification: 'best', epLoss: 0.5 }));
    expect(kinds(out)).toEqual(['best']);
  });

  it('does not fire when the praise filter emptied the list', () => {
    const out = rankSituations(
      makeFacts({
        classification: 'mistake',
        epLoss: 0.02,
        motifs: [{ type: 'only_move', margin: 0.4 }],
      }),
    );
    expect(out).toEqual([]);
  });
});
