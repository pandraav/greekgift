'use client';

import { Chess, type Move, type Square } from 'chess.js';
import { useMemo, useRef, useState } from 'react';

import { PIECES, pieceKey } from './pieces';

/**
 * The board.
 *
 * Written rather than installed, because the pieces have to be draggable into
 * lines that are not in the game, the last move wears its classification
 * badge, and the engine's suggestion is drawn over the top — three things a
 * drop-in board would have to be fought about rather than asked for.
 *
 * The position is the caller's; selection, dragging and promotion are ours.
 */

const FILES = 'abcdefgh';

export interface BoardArrow {
  from: string;
  to: string;
  color: string;
  /** Stroke width in the 2048-unit board space. */
  width?: number;
}

export interface BoardBadge {
  square: string;
  glyph: string;
  color: string;
}

export interface BoardMove {
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

export interface BoardProps {
  fen: string;
  flipped?: boolean;
  /** Tints the square a move landed on. */
  lastMoveTo?: string | null;
  badge?: BoardBadge | null;
  arrows?: BoardArrow[];
  coordinates?: boolean;
  /** Leave unset for a board that only shows. */
  onMove?: (move: BoardMove) => void;
}

/** Board-space centre of a square, in the arrow SVG's 2048-unit grid. */
const UNIT = 256;

function centre(square: string, flipped: boolean): [number, number] {
  let file = FILES.indexOf(square[0]!);
  let rank = 8 - Number(square[1]);
  if (flipped) {
    file = 7 - file;
    rank = 7 - rank;
  }
  return [file * UNIT + UNIT / 2, rank * UNIT + UNIT / 2];
}

function Arrow({ from, to, color, width = 32, flipped }: BoardArrow & { flipped: boolean }) {
  const [ax, ay] = centre(from, flipped);
  const [bx, by] = centre(to, flipped);
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  // The shaft stops short of the target so the head is the thing that lands on
  // it, and starts clear of the origin so the piece underneath stays readable.
  const head = 62;
  const ex = bx - ux * head;
  const ey = by - uy * head;
  const sx = ax + ux * 72;
  const sy = ay + uy * 72;
  const px = -uy;
  const py = ux;

  return (
    <g opacity="0.88">
      <line
        x1={sx}
        y1={sy}
        x2={ex}
        y2={ey}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
      />
      <polygon
        points={`${bx - ux * 12},${by - uy * 12} ${ex + px * width * 1.5},${ey + py * width * 1.5} ${ex - px * width * 1.5},${ey - py * width * 1.5}`}
        fill={color}
      />
    </g>
  );
}

const PROMOTIONS = ['q', 'r', 'b', 'n'] as const;

export function Board({
  fen,
  flipped = false,
  lastMoveTo = null,
  badge = null,
  arrows = [],
  coordinates = true,
  onMove,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<Square | null>(null);

  const [selected, setSelected] = useState<Square | null>(null);
  const [dragging, setDragging] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);

  const position = useMemo(() => new Chess(fen), [fen]);
  const interactive = Boolean(onMove);

  const legal = useMemo(
    (): Move[] => (selected ? position.moves({ square: selected, verbose: true }) : []),
    [position, selected],
  );

  const squares = useMemo(() => {
    const ranks = [...'87654321'];
    const files = [...FILES];
    if (flipped) {
      ranks.reverse();
      files.reverse();
    }
    return ranks.flatMap((r) => files.map((f) => (f + r) as Square));
  }, [flipped]);

  /** Board geometry read at the moment of the gesture, so resizing is free. */
  const cellSize = () => {
    const box = boardRef.current?.getBoundingClientRect();
    if (!box) return 0;
    const border = parseFloat(getComputedStyle(boardRef.current!).borderLeftWidth) || 0;
    return (box.width - border * 2) / 8;
  };

  const squareAt = (clientX: number, clientY: number): Square | null => {
    const board = boardRef.current;
    if (!board) return null;
    const box = board.getBoundingClientRect();
    const border = parseFloat(getComputedStyle(board).borderLeftWidth) || 0;
    const size = (box.width - border * 2) / 8;
    const x = clientX - box.left - border;
    const y = clientY - box.top - border;
    if (x < 0 || y < 0 || x > size * 8 || y > size * 8) return null;
    let file = Math.floor(x / size);
    let rank = Math.floor(y / size);
    if (flipped) {
      file = 7 - file;
      rank = 7 - rank;
    }
    return (FILES[file]! + (8 - rank)) as Square;
  };

  /** Written straight to the node: a state update per pointermove would stutter. */
  const moveGhost = (x: number, y: number) => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    const half = ghost.offsetWidth / 2;
    ghost.style.left = `${x - half}px`;
    ghost.style.top = `${y - half}px`;
  };

  const attempt = (from: Square, to: Square) => {
    const options: Move[] = position
      .moves({ square: from, verbose: true })
      .filter((move) => move.to === to);
    if (options.length === 0) {
      setSelected(null);
      return false;
    }

    // A pawn reaching the last rank has four legal moves to the same square,
    // and guessing a queen for someone who wanted a knight loses them the game.
    if (options.some((move) => move.promotion)) {
      setSelected(null);
      setPromotion({ from, to });
      return true;
    }

    setSelected(null);
    onMove?.({ from, to });
    return true;
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!interactive || promotion) return;
    const cell = (event.target as HTMLElement).closest('[data-square]');
    const square = cell?.getAttribute('data-square') as Square | undefined;
    if (!square) return;

    if (selected && selected !== square && attempt(selected, square)) return;

    const piece = position.get(square);
    if (!piece || piece.color !== position.turn()) {
      setSelected(null);
      return;
    }

    setSelected(square);
    setDragging(square);
    dragFrom.current = square;

    const size = cellSize();
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.width = `${size}px`;
      ghost.style.height = `${size}px`;
      ghost.innerHTML = PIECES[pieceKey(piece.color, piece.type)];
      ghost.style.display = 'block';
      moveGhost(event.clientX, event.clientY);
    }
    boardRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (dragFrom.current) moveGhost(event.clientX, event.clientY);
  };

  const endDrag = (event: React.PointerEvent) => {
    const from = dragFrom.current;
    if (!from) return;
    dragFrom.current = null;
    setDragging(null);
    if (ghostRef.current) ghostRef.current.style.display = 'none';

    const to = squareAt(event.clientX, event.clientY);
    // A tap lands where it started: leave the piece selected so the next tap
    // can be the destination, which is how the board works on a phone.
    if (to && to !== from) attempt(from, to);
  };

  const hintFor = (square: Square) => legal.find((move) => move.to === square);

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_auto] items-stretch gap-x-[9px] gap-y-1.5">
      {coordinates ? (
        <div className="col-start-1 row-start-1 grid grid-rows-8 items-center justify-items-end font-mono text-[10.5px] text-ink-3">
          {(flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]).map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      ) : (
        <div className="col-start-1 row-start-1" />
      )}

      <div
        ref={boardRef}
        className="relative col-start-2 row-start-1 grid aspect-square w-full touch-none grid-cols-8 rounded-[3px] border-[7px] border-frame select-none [box-shadow:0_0_0_1px_var(--brass-lo),0_3px_0_rgba(0,0,0,.35),0_20px_40px_-16px_rgba(0,0,0,.75)]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {squares.map((square) => {
          const file = FILES.indexOf(square[0]!);
          const rank = Number(square[1]);
          const light = (file + rank) % 2 === 0;
          const piece = position.get(square);
          const hint = hintFor(square);
          const mark = badge && badge.square === square ? badge : null;
          const promoting = promotion && promotion.to === square ? promotion : null;

          return (
            <div
              key={square}
              data-square={square}
              className={[
                'relative grid place-items-center',
                light ? 'bg-sq-l' : 'bg-sq-d',
                piece && interactive ? 'cursor-grab' : '',
              ].join(' ')}
            >
              {lastMoveTo === square ? (
                <span className="absolute inset-0 bg-brass/40" />
              ) : null}
              {selected === square ? (
                <span className="absolute inset-0 bg-felt/35" />
              ) : null}

              {piece ? (
                <span
                  className={[
                    'relative z-2 block h-[87%] w-[87%] [&>svg]:h-full [&>svg]:w-full',
                    '[filter:drop-shadow(0_2px_1.5px_rgba(30,18,6,.42))]',
                    dragging === square ? 'opacity-25' : '',
                  ].join(' ')}
                  dangerouslySetInnerHTML={{
                    __html: PIECES[pieceKey(piece.color, piece.type)],
                  }}
                />
              ) : null}

              {hint ? (
                hint.captured ? (
                  <span className="pointer-events-none absolute z-3 h-[88%] w-[88%] rounded-full border-[5px] border-ink/25" />
                ) : (
                  <span className="pointer-events-none absolute z-3 h-[29%] w-[29%] rounded-full bg-ink/25" />
                )
              ) : null}

              {mark ? (
                <span
                  className="absolute -top-2.5 -right-2.5 z-6 grid h-[27px] w-[27px] place-items-center rounded-full border-2 border-paper font-mono text-[11px] font-bold text-white shadow-[0_2px_6px_rgba(0,0,0,.45)]"
                  style={{ background: mark.color }}
                  dangerouslySetInnerHTML={{ __html: mark.glyph }}
                />
              ) : null}

              {promoting ? (
                <div className="absolute inset-0 z-10 grid grid-rows-4 bg-paper shadow-[0_6px_18px_rgba(0,0,0,.5)]">
                  {PROMOTIONS.map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-label={`Promote to ${type}`}
                      className="grid place-items-center hover:bg-brass/25 [&>svg]:h-[86%] [&>svg]:w-[86%]"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => {
                        setPromotion(null);
                        onMove?.({ from: promoting.from, to: promoting.to, promotion: type });
                      }}
                      dangerouslySetInnerHTML={{
                        __html: PIECES[pieceKey(position.turn(), type)],
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        <svg
          viewBox="0 0 2048 2048"
          className="pointer-events-none absolute inset-0 z-4"
          aria-hidden
        >
          {arrows.map((a) => (
            <Arrow key={`${a.from}${a.to}${a.color}`} {...a} flipped={flipped} />
          ))}
        </svg>
      </div>

      {coordinates ? (
        <div className="col-start-2 row-start-2 grid grid-cols-8 justify-items-center font-mono text-[10.5px] text-ink-3">
          {(flipped ? [...FILES].reverse() : [...FILES]).map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      ) : null}

      <div
        ref={ghostRef}
        aria-hidden
        style={{ display: 'none' }}
        className="pointer-events-none fixed z-99 [filter:drop-shadow(0_8px_10px_rgba(20,12,4,.55))]"
      />
    </div>
  );
}
