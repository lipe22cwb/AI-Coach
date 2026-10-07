# Finding your way around the project

## How the Play screen is assembled

`app/layout.tsx` wraps every page in the HTML document, loads the two local fonts
and defines the browser title and favicon. `app/page.tsx` is the page at `/`.
It arranges the navigation, heading, mode controls, board, coach and footer.

The homepage deliberately stays small. Most changes to the game or coaching UI
can be made in their component files without changing the whole page.

| Component          | Responsibility                          |
| ------------------ | --------------------------------------- |
| `Navbar`           | Brand, navigation and Sign In preview   |
| `ModeSelector`     | Practice and Ranked preview controls    |
| `MinesweeperBoard` | Board cells, stats and instructions     |
| `GameStats`        | Display values supplied by the board    |
| `CurrentFocus`     | Collapsible practice target             |
| `CoachPreview`     | Collapsible sample post-game report     |
| `MineLogo`         | Shared SVG used in the navbar and coach |

These files are in `components/play/`. Imports beginning with `@/` start at the
project root because that alias is set in `tsconfig.json`. Imports beginning
with `./` refer to a file in the current directory.

## Where the board data comes from

`lib/game-settings.ts` holds the board size, total mine count and difficulty
label. The heading, board and footer use those shared values so they stay in
sync.

`components/play/board-fixture.ts` holds the static preview. Each string is one
row, using `#` for a covered square, `f` for a flag, a space for an empty square,
and `1`, `2` or `3` for a visible number. Spaces matter here.

`parseCell` turns those characters into readable values such as `"hidden"` and
`"flag"`. `DISPLAY_BOARD` flattens the rows into one list, and
`MinesweeperBoard` uses `.map()` to render one cell for each item.

The fixture checks the row count, row lengths and characters when it is loaded.
If a row accidentally loses a square, the error points back to the fixture
rather than leaving a misaligned board on the screen.

The remaining-mine display is the configured total minus the visible flags.
`GameStats` receives this number, the total and the formatted sample time as
props. It handles presentation only; it does not calculate a game outcome or
run a timer.

Changing `BOARD_SIZE` also changes the CSS grid's column count through the
`--board-columns` variable. Update `BOARD_ROWS` to match a new size. The current
fixture is visual sample data, not proof of a valid hidden mine layout.

## Where the styling lives

`app/globals.css` loads Tailwind and the named stylesheets. Those styles apply
globally, so most class names match the corresponding JSX directly.

| Stylesheet       | What to edit there                                             |
| ---------------- | -------------------------------------------------------------- |
| `theme.css`      | Shared colours and font variables                              |
| `base.css`       | Body, buttons, links, focus styles and accessibility helpers   |
| `navigation.css` | Navbar columns, logo spacing and active link styling           |
| `layout.css`     | Heading, game modes, main columns and page footer              |
| `game.css`       | Stats, board sizing, cells, flags and number colours           |
| `coaching.css`   | Panel headings, report, diagram, tooltip and close icons       |
| `responsive.css` | Changes at 1100px, 860px, 600px and 360px, plus reduced motion |

Desktop rules come first. `responsive.css` is imported last so its overrides
apply at narrower widths. At 860px the coaching area moves below the board; at
600px the navigation uses a second row and the coaching panels stack vertically.

To find the styling for an element, take its `className` from the component and
search that name with Ctrl+Shift+F in VS Code. For example, search `game-stats`
to find both the normal styling and its phone overrides.

## Opening and closing the coach

Both coaching panels use HTML `<details>` with a `<summary>` header. The browser
handles the toggle and keyboard interaction. No React state is needed for this.

`CoachPreview` has `open`, so it is visible on first load. `CurrentFocus` leaves
that attribute off, so it begins collapsed. CSS reads the open attribute to
rotate the arrow, hide the tooltip, and switch between the X and message icons.

The text and pattern diagram are sample content. Keep that distinction visible
until the report actually comes from a completed game.

## Adding real gameplay later

Start by writing the board rules separately from the rendering code: mine
placement, neighbouring counts, revealing squares, flags and win/loss checks.
Test those outcomes before wiring them into the screen.

Then let a client component own the game state. Replace the static
`DISPLAY_BOARD` input with state and turn the cell divs into real controls.
Pass live counters and elapsed time into the existing `GameStats` props. Keep
the static fixture available as a visual reference while making this change.

Selected mode should also come from state rather than the hard-coded selected
class in `ModeSelector`. New pages belong under `app/`; for example,
`app/profile/page.tsx` would provide `/profile`. Once a page exists, change its
navbar entry into a Next.js `Link` with the appropriate route.

The project currently exports static files. Before adding server routes or
server-side authentication, review `output: "export"` in `next.config.ts` and
choose hosting that supports the server features. This guide marks the places
to extend; it does not add those features to the prototype.

## What the project checks cover

`npm run check` runs formatting, a production build and TypeScript. The GitHub
workflow runs the same steps on pushes and pull requests. These checks catch
formatting differences, unresolved imports, missing fonts and many type errors.
They are not gameplay tests or a replacement for looking at the interface.

Next.js generates `next-env.d.ts` and the `.next` directory. Both are ignored by
Git, as are `out/` and `node_modules/`. They are recreated locally instead of
being copied between teammates.
