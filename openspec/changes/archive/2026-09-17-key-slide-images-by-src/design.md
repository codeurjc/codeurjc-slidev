## Context

Two frontmatter features point at a slide's images by position:
- `geometry.images[N]` positions the Nth `<img>` under `.content-inner` (`default.vue`, `updateGeometryImages`);
- callout anchors `at: {image: N, x, y}` point into the Nth `<img>` (`resolveCalloutAnchor`, `movedAnchor`).

The editor creates those numbers from the DOM: "+ Callout" uses `indexOf(img)`, and geometry writes keep the list index. The ODP importer emits them too, which is why it has to append diagram SVGs after a slide's other images.

Two facts constrain a `src`-based fix:
- **The rendered `src` isn't the authored one.** A markdown image `![](/images/a.png)` goes through Slidev's asset import: the theme's `slidev-slide-image-resolver` sends `/images/…` specifiers to `public/`, and a built deck serves a hashed `/assets/a-XXXX.png`. Raw `<img>` tags inside slide markdown are compiled into the same Vue template, so they likely get the same treatment. Comparing `img.src` against the frontmatter can't work.
- **Geometry is read from a stale source.** `default.vue` reads `$frontmatter`, which a frontmatter-only patch doesn't refresh (the reason callouts moved to `useDynamicSlideInfo(no).info`). This change adds geometry writes during migration, so geometry needs the same fix.

## Goals / Non-Goals

**Goals:**
- References that survive images being inserted, removed or reordered, with `#N` for a picture repeated on one slide.
- Every writer (editor, callout authoring, importer) produces `src` references; positional references keep working and migrate on the next editor write.
- One pure reference module shared by the theme and the importer (and later the VSCode extension).

**Non-Goals:**
- Paste presets writing per-slide `geometry` instead of forking a layout (follow-up).
- VSCode diagnostics, `#N` quick fix and completion (follow-up).
- Converting existing imported decks outside editor writes; normalizing different spellings of one path (`./images/a.png` vs `/images/a.png` are different `src`s).

## Decisions

### 1. The authored `src` reaches the DOM through a stamped attribute, chosen by a spike

Each content `<img>` needs its authored `src` at runtime. Candidates, in order of preference:
1. **markdown-it rule.** A rule in Slidev's markdown pipeline sets `data-src` on image tokens, and on `<img>` tags inside `html_inline`/`html_block` tokens. Slidev builds markdown-it with a `markdownSetup(md)` hook that also runs a user-provided `markdown.markdownSetup`. The spike checks whether the theme can provide it (the theme's `vite.config.ts`, or a `setup/` entry).
2. **`pre` markdown transformer** (`setup/transformers.ts`, already used for `<<<`). It adds ` data-src="…"` to raw `<img>` tags, and rewrites `![alt](src "title")` into an equivalent `<img>` with `data-src`. It must keep Slidev's image-size syntax (`=WxH`) and skip fenced code.
3. **Runtime mapping** from the slide's own markdown source: the slide info's `content`. It takes image `src`s in document order, skipping fences and comments, and pairs them with the rendered `<img>`s. It needs no build plumbing, but depends on the content being available in a built deck and on render order matching source order.

Acceptance for the chosen approach: the authored `src` is readable in `pnpm dev` and in a `slidev build` output for a markdown image, a raw `<img>`, an `<img v-click>`, and an image inside a list item.

*Why a spike rather than a decision:* the three differ mainly in Slidev internals that only running code can settle. Their consumers are identical: `authoredSrc(img)`.

**Spike result: candidate 1.** `resolveViteConfigs` merges every root's `vite.config` (theme included) and passes the merged `slidev` key to `ViteSlidevPlugin`, whose markdown plugin calls `markdown.markdownSetup(md)`. The theme's `vite.config.ts` registers `composables/markdownImageSrc.ts`, a core rule that copies `src` into `data-src` on `image` tokens, and on static `<img src>` tags in `html_inline`/`html_block` tokens. Checked on a scratch deck (markdown image, raw `<img>`, `<img v-click>`, image in a list item; a fenced example stays untouched):
- **dev:** rendered `src` is `/public/images/a.png`, and `data-src` is `/images/a.png`;
- **`slidev build`:** rendered `src` is an inlined `data:image/png;base64,…`, and `data-src` is `/images/a.png`.

One consequence: Vite's `mergeConfig` replaces function values, so a consumer defining its own `slidev.markdown.markdownSetup` would drop the theme's. That's documented, and such a consumer can call `markdownImageSrc(md)` from theirs.

### 2. `composables/useImageRefs.ts`: one pure module for the reference grammar

```text
type ImageRef = { kind: 'src', src: string, occurrence?: number } | { kind: 'position', index: number }
parseImageRef(raw: unknown): ImageRef | null          // string → src[#N]; non-negative integer → position
formatImageRef(ref: ImageRef): string | number
imageRefFor(srcs: (string | null)[], index: number): ImageRef   // shortest unambiguous: bare src, src#N if repeated, position if no src
resolveImageRef(ref: ImageRef, srcs: (string | null)[]): { index: number, warning?: string } | { index: -1, warning: string }
```

- **Occurrence syntax:** only a trailing `#\d+` counts as an occurrence, so `icons.svg#logo` stays a plain `src`, and `#0` is invalid.
- **Unsuffixed repeats:** a bare `src` that repeats resolves to the first occurrence with a warning.
- **Callers:** everything else takes the slide's authored `srcs` array (index = DOM order). Parsing, generation and resolution are then unit-testable without a DOM, and the importer calls the same functions with its emitted images.

### 3. Geometry entries carry an optional reference; resolution claims images once

`ParsedSlideGeometry.images` becomes `({ ref: ImageRef, rect } | null)[]`. An entry without `src` gets `{ kind: 'position', index: <its list index> }`, which preserves today's meaning.

`updateGeometryImages` resolves the **src entries first** and marks their images as claimed. It then resolves positional entries, and a positional entry landing on an already claimed image is skipped with a warning. Editor keys stay `geometry:<slide>:image:<entryIndex>`: the entry's list index identifies the frontmatter entry, not an image.

### 4. Callout image anchors carry a reference

`CalloutAnchor`'s image kind becomes `{ kind: 'image', ref: ImageRef, x, y }`. The parser accepts `image:` as a string or a non-negative integer, and serialization writes `formatImageRef`.
- **Creation:** "+ Callout" on an image writes `imageRefFor(srcs, domIndex)`.
- **Anchor drags:** `movedAnchor` keeps the anchor's image and only rewrites fractions, converting a positional ref to a src ref as it writes.

### 5. Migration happens inside the writes the editor already makes

Both write helpers receive the slide's current `srcs` (from `authoredSrc` over `.content-inner img`):
- **Geometry writes** (`withGeometryRect`): each positional entry whose resolved image has a `src` is rewritten to `{ src: imageRefFor(...), x, y, w, h }`.
- **Callout writes** (`withSlideCallout` / `withoutSlideCallout`): each positional image anchor is rewritten the same way.

Entries or anchors that don't resolve are kept exactly as written, so a broken reference is never "fixed" by guessing. No write happens just to migrate: only a real edit triggers it.

*Alternative considered:* a one-shot migration on slide load. Rejected: it would write files on mere viewing, and you asked for migration on the next editor write.

### 6. Geometry reads from the slide-info ref

`geometry` is computed from `useDynamicSlideInfo(slideNo).info.frontmatter ?? $frontmatter`, the source callouts already use, so a frontmatter patch is reflected immediately.

### 7. Importer: references by `src`, rewritten when images are registered

`convertOverlay` stays pure and doesn't know final public paths, because `publicImagePath` deduplicates names when it registers them.
- **Anchors:** it builds image anchors with the archive href as a provisional `src`.
- **Registration:** `applyOverlay` registers the images, then rewrites each anchor's href to `imageRefFor(publicSrcs, index)`. The public srcs are `/images/<name>`, which is exactly what `renderDraftBody` writes into `![](…)` / `<img v-click src>`.
- **Geometry:** entries are serialized with `src` the same way.
- **Diagram SVGs** get `src`-keyed entries. The "append after other images" constraint and its spec wording go away, though appending remains fine.

## Risks / Trade-offs

- **[Spike finds no stamping route that survives `slidev build`]** → Candidate 3 needs no build plumbing. If even the source content isn't available in a built deck, stop and report before touching writers: the rest of the change depends on it.
- **[Different spellings of one image]** (`./images/a.png` vs `/images/a.png`) → The match is exact and documented, and an unresolvable reference warns rather than guessing. Writers always copy the spelling found in the content.
- **[Numeric fragment in a real URL]** (`sprite.svg#2`) → This is treated as an occurrence and documented; such fragments aren't used for slide pictures.
- **[Mixed src and positional entries]** → Src entries claim images first, and a colliding positional entry warns. Editor writes remove the mix on the next edit.
- **[Importer anchors rewritten after pass 2]** → Anchor rewriting happens once, in `applyOverlay`, on the final image list. A unit test covers a slide where a diagram candidate removed an image before the anchored one.

## Migration Plan

- **Existing decks:** positional references keep working unchanged, and a slide migrates on its first editor write.
- **New imports:** they emit `src` references.
- **Docs:** `AGENTS.md`, `tutorial.md` and the README switch their examples to `src`, and mention that numbers still work.

## Open Questions

None: the spike settled decision 1.
