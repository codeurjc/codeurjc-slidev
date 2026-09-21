## 1. Scaffolder: comparison marker and editor recommendations

- [x] 1.1 Add `comparisonDeck: 'true'` to the comparison deck's headmatter in `packages/create-codeurjc-slidev/src/odp/comparison.ts` (first slide only) and update its unit tests
- [x] 1.2 Add an `editor-config.mjs` helper (beside `project-dir.mjs`, listed in `package.json` `files`) that ensures `.vscode/extensions.json` recommends `codeurjc.vscode-codeurjc-slidev` and `antfu.slidev`, merging JSONC, leaving unparseable files untouched; unit-test create / merge / keep-other-keys / unparseable
- [x] 1.3 Call it from `index.mjs` after deck placement for both fresh and recognized projects, independent of `--skip-existing`/`--yes`; print the note for an unparseable file
- [x] 1.4 Extend the CLI tests (`cli.spec.ts`) to cover the file on a new project and on a deck added to an older one

## 2. Extension: deck discovery (pure)

- [x] 2.1 `deckDiscovery.ts`: classify a document as deck / comparison / other (theme gate, `comparisonDeck` marker, name fallback) and group decks by project root
- [x] 2.2 `includePlan.ts`: order missing decks (last edited first, then alphabetical), escape glob metacharacters, merge with existing entries, hash the missing set
- [x] 2.3 `deckTip.ts`: decide whether to show the tip for an opened document
- [x] 2.4 Unit tests for each module, covering every scenario in the `vscode-deck-discovery` spec

## 3. Extension: adapter

- [x] 3.1 In `extension.ts`, compute already-registered decks with `workspace.findFiles` over `slidev.include` minus `slidev.exclude`
- [x] 3.2 Offer registration (Register / Not now), write `slidev.include` at Workspace scope, remember the declined set in `workspaceState`, re-offer when the set changes
- [x] 3.3 Record the last edited deck per workspace on `onDidChangeTextDocument`
- [x] 3.4 Show the tip on the first deck opened in a multi-deck project (Choose deck… → `slidev.choose-entry`, Don't show again), once per workspace
- [x] 3.5 Add the `codeurjcSlidev.deckDiscovery.enabled` setting to `package.json` (default true) and honour it for both features
- [x] 3.6 Extension-host smoke tests: the tip appears for the first deck opened and is silenced by the setting (shared fixture); the registration offer, ordered/escaped `slidev.include` write, declined-set memory, re-offer on a new deck and the tip's **Choose deck…** button run in a second host against a nested-project workspace (`fixture-decks/`, `projects/AIS`) with `fake-slidev` standing in for `antfu.slidev`

## 4. Docs and verification

- [x] 4.1 Update `CLAUDE.md` (VS Code editor support and scaffolding notes) and the extension README
- [x] 4.2 `pnpm lint && pnpm typecheck && pnpm test`, then `xvfb-run -a pnpm test:extension`
- [x] 4.3 Automated check against a multi-deck project nested inside a larger workspace (`deckRegistration.test.cjs`, with VS Code's real `findFiles` glob matching). Not covered: the real `antfu.slidev` picking the first `include` entry as its default (read from its source, not exercised), and opening the project as the workspace root
