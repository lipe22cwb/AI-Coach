# Working on AI-Coach

Start with [README.md](README.md) to run the project and
[the project guide](docs/PROJECT-GUIDE.md) to find the right file.

## A normal team change

1. Pull the latest shared branch before starting.
2. Create a branch with a name that describes the work, such as
   `feature/playable-board` or `fix/mobile-navigation`.
3. Make the change and check it locally with `npm run dev`.
4. Run `npm run format`, followed by `npm run check`.
5. Commit the relevant files, push the branch and open a pull request.

Keep a pull request focused enough that someone else can understand it in one
review. Describe what changed, why it changed and how you checked it. Add a
screenshot when the appearance changes.

## Keep the code approachable

- Use names that explain the value or action, such as `minesRemaining` or
  `getCellClass`.
- Keep screen arrangement in `app/page.tsx` and the larger sections in their own
  components. Extract a new component when it removes repetition or makes a
  sizeable section easier to work on.
- Put display rules in the appropriate file under `styles/`. Overrides for
  smaller screens belong in `styles/responsive.css`.
- Keep shared board values in `lib/game-settings.ts`. Update the preview rows
  too if the board size changes.
- Prefer props when a display component needs data from its parent. `GameStats`
  is an example of this.
- Add `"use client"` to components that need React state, effects or event
  handlers. The current native `<details>` panels do not need it.

## Comments

Write a comment when someone would reasonably ask why the code works that way,
where its data comes from or what needs updating alongside it. Keep the wording
plain. Avoid explaining an obvious line just to increase the comment count.

For example:

```tsx
// The board supplies these values so the stats can later show live game data.
```

Keep comments accurate when the code changes. Remove a preview-only comment
when the feature becomes real, and update the README's status at the same time.

## Check an interface change

Look at a desktop width and a phone width. Check that the board is square, the
navigation fits, and both coaching panels still open and close. Use Tab and
Enter or Space to check keyboard access. For later gameplay work, add tests for
the rules and outcomes rather than tests that merely repeat the markup.
