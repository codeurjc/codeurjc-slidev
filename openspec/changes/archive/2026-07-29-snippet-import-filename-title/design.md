## Context

Every fence Slidev renders (including this project's `<<<` snippet imports) already passes through the built-in `CodeBlockWrapper` component, via a `wrapper_default` codeblock transformer that parses the fence's info string with `RE_BLOCK_INFO` into `lang [title] {ranges} {options}`. `CodeBlockWrapper` already renders a `.slidev-code-block-title` bar (with an icon looked up from a static extension/keyword map in `TitleIcon.vue`) whenever `title` is non-empty. Nothing in this project has ever populated that `[title]` slot — this change only needs to start doing so for `<<<`-imported code, entirely within `composables/useSnippetImport.ts` and `setup/transformers.ts`. No Slidev core code changes, and no `slides.md` edits are required for existing imports to pick this up.

## Goals / Non-Goals

**Goals:**
- Show the imported file's basename as a title bar on `<<<`-imported code blocks, using Slidev's existing native mechanism.
- Let a presenter opt out per-import via a `notitle` keyword.

**Non-Goals:**
- Forcing a file-type icon for languages Slidev's `TitleIcon.vue` doesn't already recognize (e.g. `.java`) — text-only titles are acceptable.
- Any new directive-line syntax (mirroring `[!mark:...]` anchor lines) for the opt-out — a single trailing keyword on the `<<<` line is sufficient and keeps the opt-out colocated with the import it affects.
- Changing behavior of manually-authored (non-`<<<`) fenced code blocks in `slides.md` — those are untouched by this change.

## Decisions

- **Title text = basename only** (not the full `@/code/...` path or the code-root-relative path). Rationale: shortest, cleanest render; matches how Slidev users conventionally title code blocks elsewhere. Accepted trade-off: two same-named files imported from different exercises on nearby slides are visually indistinguishable by title alone — acceptable since slide headings/context already disambiguate in practice.
- **Opt-out via trailing `notitle` keyword on the `<<<` line itself** (e.g. `<<< @/code/path[selector] java notitle`), rather than a separate standalone directive line. `parseSnippetImportLine`'s `lang` field today swallows the rest of the line verbatim and nothing currently relies on trailing content after the language token, so this is a backward-compatible, additive grammar extension. Keeping it on the same line (vs. a new line like the anchor-declaration mechanism) avoids introducing a second parallel "declarations following an import" concept for a single boolean flag.
- **No forced icon override.** `TitleIcon.vue` supports a `~icon-name~` embedded-in-title override, which could force a Java icon, but that's an unnecessary refinement for this change; text-only titles for unrecognized extensions are explicitly accepted.

## Risks / Trade-offs

- [Basename collisions across exercises] → Accepted; disambiguation is left to slide context, consistent with how the deck already presents multiple exercises.
- [Extending `lang` parsing to look for a trailing keyword could misparse an unusual existing language token] → Low risk: Shiki language identifiers are single tokens with no internal whitespace, and no current slide passes anything beyond a bare language after the selector.
