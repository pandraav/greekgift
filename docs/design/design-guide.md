# greekgift — design guide

> The visual system, as built. Tokens live in `apps/web/src/app/globals.css`,
> primitives in `apps/web/src/components/ui/index.tsx`, the board in
> `apps/web/src/components/board/`. This document explains the reasoning; the
> code is the source of truth, and where they disagree the code is right and
> this file is stale.
>
> `app.html` in this directory is the interactive prototype every screen was
> built against.

## What is in this directory

One prototype: **`app.html`**. It imports `./vendor/chess.js` as an ES module,
and browsers block module imports over `file://`, so it needs a local server:

```
cd docs/design && python3 -m http.server 8000   # then open localhost:8000/app.html
```

Everything else it needs — the pieces, the analysed game it renders — is
inlined in the file.

Twelve screens: `landing`, `home`, `login`, `request`, `pending`, `admin`,
`games`, `review`, `share`, `settings`, `credits`, `components`. Navigate with
the hash router in the harness at the top.

`home` is the signed-in front door as redesigned on 2026-09-07: a paste-a-link
card, one card per linked chess.com account (its last ten games,
"refreshed N ago", refresh and an inline remove confirmation), a dashed
add-account card, and "My reviews" — every game you reviewed or opened after
review, plus games shared with you, tagged "shared by". Requests do not live on the
page: a bell in the topbar carries a count and opens the Notifications modal
(requests on your shares with Approve and Decline, games shared with you, and
earlier decisions). `games` is one linked account's page. Pill tabs above the header switch
between linked accounts (each with its games-this-week count) and end in an
"Add account" link to home. A week card sits under the ratings: the last seven
days as a won-drawn-lost bar, average accuracy, most-played opening, costliest
habit, and the reading progress in its foot. Only the last seven days are read
automatically; a rule in the list marks older games, which are read on request. Filters are segmented controls, not
dropdowns. Each row leads with a 58px board of the game's turning point (the
hot square takes the classification colour), then the opponent, the coach's
one-line verdict with a classification chip, accuracy with a small meter, and
the rating change under the date. Unread games show a dimmed board and an
italic "Not read yet." `share` is what a
member sees when a share link points at a game they do not hold: the header
only, and one button to ask. The `review` screen carries the Share button and
the copied-link bar under the header. The CSS for all of it is the
`home v2` block near the app root.

Two of them have no route in the app:

- **`components`** is the primitive sheet — every button variant, chip, field
  and the full classification ladder on one page. It is the closest thing to a
  visual spec of `components/ui`, and worth keeping in sync by eye when a
  primitive changes.
- **`credits`** was designed and never built. The attributions it carried now
  live in the README.

### `app.html` is the reference for *look*, not behaviour

The app moved on in five places, each on purpose:

| | prototype | app |
|---|---|---|
| promotion | auto-queens | a picker — guessing a queen loses games |
| engine arrows | drawn on the position *after* the move | on the position *before*, where the recommendation actually applies |
| coach text | one hardcoded paragraph for one move | generated per move, per persona, from verified facts |
| board | rebuilt with `innerHTML` on every change | React, with the ghost piece written straight to the node |
| the game | a fixed fixture, `data/review.json` | whatever chess.com returns |

### The directions that were rejected

Before the wood theme there were three, each with its own palette and type
pairing. The files are gone — recover them from the initial commit if ever
needed — but the reasoning is worth keeping:

- **Informator** — the printed analysis annual. Figurine notation on a ruled
  page, book red for the losing move and forest green for the refutation, set
  in Petrona so the coach reads as an editor rather than a chatbot.
- **Scoresheet** — the paper form you fill in at a tournament. A ruled
  two-column move grid, pen blue and correction magenta, Bricolage Grotesque
  over Archivo.
- **Night broadcast** — the stream overlay. Dark room, lit board, evaluation
  as the loudest element, Anton compressing the accuracy figures into
  scoreboard slabs.

The wood theme took *Informator*'s conviction that this is a printed artefact
and *Night broadcast*'s dark ground, and dropped the newspaper and scoreboard
framing. **The ten-class colour scale survived from Night broadcast, which is
why it needs a dark ground to sit on** — it was never designed to work on
paper.

```
git show 361d03f:docs/design/directions.html   > directions.html
git show 361d03f:docs/design/greekgift-ui.html > greekgift-ui.html
```

The second was an intermediate: the review screen worked out in isolation,
before the theme.

### Supporting files

| | used by | note |
|---|---|---|
| `pieces.json` | `apps/web/scripts/build-pieces.mjs` | **a build input.** Compiled into `components/board/pieces.ts`. Deleting it breaks the script |
| `pieces/*.svg` | nothing directly | the individual sources `pieces.json` was collected from |
| `vendor/chess.js` | `app.html` | imported as an ES module; the prototype does not run without it |
| `data/review.json` | **nothing** | dead. The prototype inlines its own fixture as `const R`; no code in the repo reads this file |

The prototype has its own copy of the pieces inlined as `const PIECES`, so
`pieces.json` and `app.html` can drift. They agree today. If a piece ever
changes, change `pieces.json`, run the build script, and paste the same data
into `app.html`.

The other build input lives one directory up:
`docs/superpowers/specs/2026-09-04-coach-personas.md` compiles to
`packages/coach/src/data/personas.json`.

## The idea

A wooden board on a table, with paper notes beside it. Not a dashboard, not a
SaaS product, not a chess engine's debug output. The materials do the work:

**wood** is the table everything sits on · **paper** is anything you read ·
**brass** marks what you can act on · **felt** confirms · **lacquer** warns.

That mapping is the whole system. A brass button is pressable, a felt one
confirms, a lacquer one is about to cost you something. Nothing is coloured
for decoration.

## One theme, on purpose

There is no dark mode, and four independent locks keep it that way:

1. No `@custom-variant dark` declaration. An **undeclared** variant makes any
   stray `dark:` utility compile to *nothing*, so a mistake fails to nothing
   rather than to a half-inverted control.
2. No `.dark` block anywhere.
3. `color-scheme: light` on `:root`, so the browser does not invert native
   widgets — scrollbars, `select` popups, date pickers, autofill. Without it
   you get charcoal form controls on cream paper.
4. No `next-themes`.

The app is already dark — it is a walnut table. Inverting it produces a
lighter table, which is not a night mode, just a different tree.

## Colour

Ported verbatim from the prototype. Every value is a CSS custom property on
`:root` and re-exported through Tailwind v4's `@theme inline`.

### The table

| token | hex | use |
|---|---|---|
| `--wood-900` | `#1b130c` | the page ground, painted on `body` |
| `--wood-800` | `#271b11` | topbar |
| `--wood-tone` | `#3a2716` | grain highlights |
| `--wood-600` | `#54381f` | avatar gradient start |
| `--oak` | `#8a6641` | the lightest grain |

### Paper and ink

| token | hex | use |
|---|---|---|
| `--paper` | `#f7f2e5` | cards, and every surface you read from |
| `--paper-2` | `#efe8d6` | insets, table headers, ghost fills |
| `--paper-3` | `#e5dcc5` | meter and rail tracks |
| `--ink` | `#1a150f` | body text on paper |
| `--ink-2` | `#4e4432` | secondary text |
| `--ink-3` | `#8b8068` | labels, captions, disabled |
| `--rule` | `#dbd1b9` | borders |
| `--rule-2` | `#e9e2cf` | the quieter divider inside a card |

### The three signals

| token | hex | means |
|---|---|---|
| `--brass` `--brass-lo` `--brass-hi` | `#be8f3e` `#8e6a2a` `#e0bc78` | act on this |
| `--felt` `--felt-hi` | `#2e5c43` `#3f7a59` | confirmed, good, best |
| `--lacquer` `--lacquer-hi` | `#9e2b20` `#c2453a` | warning, error, blunder |

Brass is also the focus ring and the selection colour, so keyboard focus is
never a browser default.

### The board

`--sq-l #ebdcb8` · `--sq-d #8a6234` · `--frame #2a1a0e`

Light square is a8's diagonal partner — `(file + rank) % 2 === 0` is light. An
early version had this inverted and produced a board with a dark a8, which
every chess player notices immediately and cannot un-notice.

### The classification ladder

Ten classes, ten colours, cool-to-warm as the move gets worse. These are
**semantic and fixed** — the same colour and the same glyph appear on the
board badge, in the notation, and in the tally, because a player learns one
shape per class or none at all.

| class | token | glyph |
|---|---|---|
| brilliant | `#0e8fa8` | `!!` |
| great | `#3e6fa8` | `!` |
| book | `#8a6a2c` | `▣` |
| best | `#2e5c43` | `★` |
| excellent | `#437a56` | `✦` |
| good | `#5f7b5b` | `✓` |
| inaccuracy | `#b9832a` | `?!` |
| miss | `#be5a22` | `✗` |
| mistake | `#a8402e` | `?` |
| blunder | `#9e2b20` | `??` |

Defined once in `apps/web/src/components/classification.ts`. Never inline a
class colour.

### shadcn's semantic layer

shadcn's names are remapped onto the identity so any component pulled in
inherits it rather than being restyled one at a time.

**`--background` maps to paper, not wood.** Every control in this design sits
on a cream card, so an outline button on `bg-background` must not come out
walnut-on-walnut. The wood ground is painted explicitly on `body` and nowhere
else.

## Type

Three families, self-hosted through `next/font/google` (`apps/web/src/app/fonts.ts`).

**Fraunces** — display. Headings, statistics, the wordmark. Chosen for its
`SOFT` and `WONK` axes, which let the same family read as a warm book face at
one size and a sharp figure at another. Four registers are exposed as
utilities:

| utility | `SOFT` | `WONK` | `opsz` | use |
|---|---|---|---|---|
| `type-mark` | 30 | 1 | 40 | the wordmark |
| `type-stat` | 20 | 0 | 60 | numbers — accuracy, ratings |
| `type-display` | 40 | 1 | 120 | section headings |
| `type-hero` | 46 | 1 | 144 | the landing headline |

Headings default to `SOFT 20, WONK 1`, `letter-spacing: -0.015em`,
`line-height: 1.15`, `text-wrap: balance`.

**IBM Plex Sans** — everything you read as prose. Body is 15px / 1.55.

**IBM Plex Mono** — everything you read as *data*: notation, evaluations,
ratings, ACPL, timestamps, eyebrows. If a number is meant to be compared to
another number it is mono and `tabular` (`font-variant-numeric: tabular-nums`).

Three traps, all verified the hard way:

- Fraunces's `axes` must **not** list `wght` — next/font filters it out of the
  definable list and throws. Omitting `weight` entirely is what selects the
  variable font.
- **IBM Plex Mono is not a variable font** in Google's catalogue. Omitting
  `weight` throws; 400/500/600 are enumerated.
- Fraunces italic is a separate file, not an axis. It is never requested,
  because the display face is never set in italic.

## Geometry and elevation

`--radius: 5px`, and the scale is derived: `sm` ×0.6, `md` ×0.8, `lg` ×1,
`xl` ×1.4. Buttons and inputs use a tighter `3px` — furniture has edges.

Two shadows, and only two:

- `--shadow-paper` — a sheet resting on the table. An inset top highlight, a
  soft drop, a tight contact shadow.
- `--shadow-lift` — something raised above it: modals, the dragged piece.

Radius and shadow are **spent by role**, not stamped on everything. A card
that is merely a container gets a border and no shadow.

## Components

`apps/web/src/components/ui/index.tsx`, built with `cva`.

### Button

Six variants, and the variant carries meaning:

| variant | reads as |
|---|---|
| `brass` | the main action — brass gradient, inset highlight, dark text |
| `primary` | ink on paper, the neutral commit |
| `felt` | confirm |
| `ghost` | secondary; a rule border and nothing else |
| `danger` | lacquer outline that fills on hover |
| `onwood` | the only variant that sits on wood rather than paper |

Sizes `sm` / `md` / `lg`, plus `block`. `LinkButton` exists instead of a
Radix-style `asChild` slot — nothing here needs the polymorphism.

### The rest

`Card` (+ `CardHead` / `CardBody` / `CardFoot`), `Field`, `Input`,
`InputPrefix`, `Textarea`, `Select`, `Chip`, `Avatar`, `Notice`, `Eyebrow`,
`RuleOr`.

`Eyebrow` is the small mono uppercase label above a section — `10.5px`,
`0.16em` tracking. It takes `onWood` because it is one of the few things that
appears on both grounds.

## The board

Written rather than installed, which reverses a decision in the spec. Three
requirements made a drop-in component the expensive option:

- the classification badge sits on the square a move landed on,
- the engine's suggestion is drawn over the top as an arrow,
- pieces drag into lines that are not in the game.

`Board` owns selection, dragging and promotion. **The position belongs to the
caller**, which is what lets the review screen decide whether a move steps the
game forward or starts a variation.

Details that were arrived at, not assumed:

- **The ghost piece is written straight to the DOM node** during
  `pointermove`. A React state update per pointer event stutters on a phone.
- **Geometry is read at the moment of the gesture**, never cached, so resizing
  and flipping need no bookkeeping.
- **Promotion is a picker.** A pawn reaching the last rank has four legal
  moves to the same square, and guessing a queen for someone who wanted a
  knight loses them the game. The prototype auto-queened; the app does not.
- **A tap that lands where it started leaves the piece selected**, so the next
  tap is the destination. That is how a board works without a mouse.
- Pieces are Cburnett, kept as markup strings generated from `pieces.json`.

### Arrows

Green (`--felt`) is what should have been played, red (`--lacquer`) is what
was. Both are drawn on the position **before** the move — a recommendation
only exists on the board it was recommended for, and drawn a ply later it
points at a square the piece has already left.

## Layout and responsiveness

Verified 320–1600px.

The review screen is the hard case, and it has three states:

| width | shape |
|---|---|
| `xl` (1280+) | three columns — rail · board · aside |
| `lg` (1024+) | two — rail beside a stacked board and aside |
| below | one column, **board first** |

Board first on a phone is deliberate: the summaries are what you read after
looking, not before.

Rules that keep it honest:

- Sibling groups are laid out with flex/grid and `gap`, not per-element
  margins that collapse or double.
- Anything that can outgrow its track — notation, tables, the eval graph —
  scrolls inside its own `overflow-x: auto` container. **The page body never
  scrolls sideways.**
- Every flex child that holds text carries `min-w-0`.
- Font sizes and grid templates live in classes, never inline. An inline
  `font-size` cannot be overridden by a media query, which broke the home
  grid and the landing headings once each.

## Writing

Words are design material. The rules that actually get applied:

- **Name things as the reader would.** "Your games", not "imported archives".
- **A control says what happens.** "Run the review", then progress that says
  what is being run. "Save changes", then "Saved."
- **Errors say what went wrong and what to do.** They do not apologise.
- **Empty states invite an action**, they do not explain an absence.
- **Never claim more than is true.** The coach card says when a note came from
  the template rather than the model, because a reader who spots the
  difference should not have to wonder.

Sentence case throughout. No exclamation marks in interface copy — the
personas have their own budgets for that, and those are in the personas spec.

## Things that went wrong, so they do not go wrong again

- **Inverted board.** `(f + r) % 2 === 1` gives a dark a8. It is `=== 0`.
- **A fictional position.** An early mockup had a bishop moving onto an
  occupied square. Mock positions are now generated with a real engine and
  verified, or not used.
- **`.who` collided.** A byline reused a class from the topbar and inherited
  cream text on a cream card, rendering a name invisible. Component-scoped
  names only.
- **Inline styles beat media queries.** See above.
- **Tailwind crawled `docs/`.** `source('../')` on the Tailwind import keeps
  class detection inside `apps/web/src`; without it, it starts at the git root
  and scans a 140KB prototype and a vendored chess.js.
