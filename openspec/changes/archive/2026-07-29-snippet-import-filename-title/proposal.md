## Why

When a slide imports code via `<<< @/code/...`, the audience has no on-slide indication of which file they're looking at — they'd have to already know the exercise structure or ask the presenter. Slidev already ships a native code-block title bar (`` ```lang [title] ``, rendered by the built-in `CodeBlockWrapper`) that this project has never populated. Wiring the imported file's basename into it is a small, self-contained change that closes that gap.

## What Changes

- The `<<<` snippet-import transformer computes the basename of the imported file and writes it into the generated fence's `[title]` slot (e.g. `` ```java [GestorNotas.java]``), so Slidev renders its existing title bar above the code block.
- A presenter can suppress the title for a specific import by appending a `notitle` keyword after the language on the `<<<` line (e.g. `<<< @/code/.../GestorNotas.java[7-22] java notitle`).
- No icon is forced for languages missing from Slidev's built-in file-type icon map (e.g. `.java`) — the title renders text-only in that case, which is accepted as-is.
- No changes to `slides.md` content are required for this to take effect; existing `<<<` imports pick up a title automatically once shipped.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `code-snippet-import`: adds a requirement that a `<<<` import's rendered code block displays the imported file's basename as a title, with an opt-out via a `notitle` keyword.

## Impact

- `composables/useSnippetImport.ts`: `parseSnippetImportLine` gains recognition of a trailing `notitle` keyword after the language token.
- `setup/transformers.ts`: the `pre` transformer's fence-text generation splices `[basename]` into the fence info string unless `notitle` was set.
- `composables/__tests__/useSnippetImport.spec.ts`: new unit coverage for the `notitle` parsing.
- `tests/code-snippet-import.spec.ts`: new/updated e2e coverage asserting the title bar renders (and is absent under `notitle`).
- `openspec/specs/code-snippet-import/spec.md`: gains a requirement (via delta spec) covering this behavior.
