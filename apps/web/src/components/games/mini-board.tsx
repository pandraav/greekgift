import type { Classification } from '@greekgift/engine';
import { Chess, type Square } from 'chess.js';

import { PIECES, pieceKey } from '@/components/board/pieces';

const FILES = 'abcdefgh';

/**
 * The 58px board on a rich row: the turning point, with the square the move
 * landed on painted in its classification colour. Pure markup, no handlers,
 * so it renders on the server. `(f + r) % 2 === 0` is light — see the design
 * guide's "Inverted board".
 */
export function MiniBoard({
  fen,
  hot,
  classification,
  dim = false,
}: {
  fen: string;
  hot: string | null;
  classification: Classification | null;
  dim?: boolean;
}) {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return <span className="block size-[58px] rounded-[3px] bg-sq-d" aria-hidden />;
  }
  const hotColour = classification ? `var(--c-${classification})` : undefined;

  return (
    <span
      className={`grid size-[58px] shrink-0 grid-cols-8 overflow-hidden rounded-[3px] bg-sq-d [box-shadow:0_0_0_1px_var(--frame),0_2px_4px_rgba(0,0,0,.25)] ${dim ? 'opacity-75 saturate-[.35]' : ''}`}
      aria-hidden
    >
      {[...'87654321'].flatMap((rank) =>
        [...FILES].map((file) => {
          const square = `${file}${rank}`;
          const light = (FILES.indexOf(file) + Number(rank)) % 2 === 0;
          const piece = board.get(square as Square);
          const isHot = hot === square && hotColour;
          return (
            <i
              key={square}
              className={`block leading-[0] [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${light ? 'bg-sq-l' : 'bg-sq-d'}`}
              style={isHot ? { background: hotColour } : undefined}
              dangerouslySetInnerHTML={piece ? { __html: PIECES[pieceKey(piece.color, piece.type)] } : undefined}
            />
          );
        }),
      )}
    </span>
  );
}
