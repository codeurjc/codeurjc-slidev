## Context

Pasting an image today (`global-top.vue`):
1. uploads `/images/paste-<ts>.<ext>` and inserts `![](…)` into the slide, either at the side editor's textarea cursor or appended via `update({ content })`;
2. polls for `.tracked-image` whose rendered `src` ends with the file name;
3. shows a Below/Right popover. A choice writes `editor.positions.content`/`image` and POSTs `/api/save-layout` with `saveAs`, creating `layouts/layout-<ts>.vue` (a full copy of the layout with `--ed-*` variables). It then sets `layout: layout-<ts>` and reloads the page.

`layouts/default.vue` pulls the last `<img>` of any slide without `geometry.images` out of flow as the layout-level `image` element (`updateTrackedImage`, `.tracked-image` CSS, `imageEverSaved`). Its default placement is a live "Below" layout. `composables/useEditor.ts` lists `image` among the five fixed elements (hidden and aspect-locked by default), `SideEditor.vue` labels it, and `vite.config.ts`'s save-layout `VAR_MAP` writes `--ed-image-*`.

Since then, per-slide `geometry` has become able to do all of this without a fork:
- `geometry.content` and `geometry.images` entries keyed by `src` (via `data-src`, see slide-image-references);
- the layout reads them from `useDynamicSlideInfo(no).info`, and Slidev caches that composable per slide number (`map[no]`). So an `update()` from `global-top.vue` refreshes the layout's geometry immediately.

`computeBelowPreset` keeps the content box's height (400 px by default at y 80), so "Below" puts the image at y ≈ 504 on the 551 px canvas.

## Goals / Non-Goals

**Goals:**
- Presets write `geometry.content` + a `src`-keyed `geometry.images` entry: no layout file, no reload, other entries preserved.
- The popover works on any `default` slide, for any number of pasted images.
- "Below" always fits the slide.
- Remove the layout-level `image` element and the extraction rule entirely.

**Non-Goals:**
- Undo integration for preset writes (the editor stays as is).
- Migrating existing `layout-<ts>` forks, or consumer layout overrides, back to `default`.
- Changing upload or insertion (`image-paste`).
- Presets on non-`default` layouts (geometry only applies to `default`).

## Decisions

### 1. Preset writes go through a pure geometry helper and the shared slide-info ref

A new pure helper `withPositionedImage(rawGeometry, content, ref, rect, srcs)` lives in `useSlideGeometry.ts`:
- it sets `content` (rounded);
- it replaces the `images` entry that already resolves to the pasted image (via `resolveGeometryImages` against `srcs`), or appends `{ src: formatImageRef(ref), …rect }`;
- it keeps every other entry as written, and migrates positional ones through the existing `withGeometryRect` path.

`global-top.vue` calls it with:
- the slide's current raw `geometry`, read fresh from `/__slidev/slides/<no>.json`, as paste already does for content;
- the pasted image's reference from `imageRefFor(srcs, index)`;
- the preset result.

It then calls `update({ frontmatter: { geometry } })` from `useDynamicSlideInfo(currentSlideNo)`. There is no `/api/save-layout` call, no `layout` change and no reload. `saveAsPerSlideLayoutFork` is deleted.

*Alternative considered:* write through the layout's own `persistGeometry`, by seeding editor keys. Rejected: that path only persists while the Layout tab is editing, and presets must work with the editor closed.

### 2. The pasted image is found by `data-src`

`waitForPastedImage(path)` polls (still bounded, 5 s) the current slide's `.content-inner img` for `authoredSrc(img) === path`. That replaces the `.tracked-image` + `endsWith(filename)` check, so a slide that already has geometry, or several pasted images, just works.
- **Anchor:** the popover anchors to that image's rect. It stays open after a choice and closes on ✕ (or when the slide changes).
- **Moving image:** after a choice the image moves, so the popover re-anchors to the image's new rect on the next frame.

### 3. Effective content rect

Presets start from the slide's effective content rect:
- `geometry.content` when the slide declares one;
- otherwise the layout's current content position, `editor.positions.content`, which carries the saved layout's `--ed-content-*` values.

Both are in the same slide-canvas pixel space `geometry` uses.

### 4. "Below" splits the height below the content's top

`computeBelowPreset(content, canvas, ratio, textHeight)` takes the canvas size (980 × 551.25, read from the layout root's `offsetWidth`/`offsetHeight`) and the content's rendered text height, measured as `.content-inner`'s rendered height divided by the deck scale.

```
available = canvas.h - content.y - BOTTOM_MARGIN (16)
contentH  = clamp(textHeight, 0.3 * available, 0.6 * available)
imageBox  = { w: 0.8 * canvas.w, h: available - contentH - GAP (24) }
image     = fit(ratio, imageBox), centred horizontally, at y = content.y + contentH + GAP
content   = { x: 0, y: content.y, w: CONTENT_DEFAULT_WIDTH, h: contentH }
```

The result always fits inside the canvas. Content autofit already shrinks text that doesn't fit the reduced box. "Right" is unchanged, apart from its content rect input (decision 3).

*Alternative considered:* keep the content box height and shrink the image to whatever remains. Rejected: with the default 400 px box, nothing remains.

### 5. Retiring the layout-level `image` element

- **`default.vue`:** remove `updateTrackedImage`'s extraction branch (keeping `updateGeometryImages` as the only image positioning), `imageEverSaved`, the `.tracked-image` CSS and the live "Below" default. The call sites that ran `updateTrackedImage` now run `updateGeometryImages`.
- **`useEditor.ts`:** remove `image` from the fixed element definitions, `IMAGE_HIDDEN_DEFAULT`/`IMAGE_ASPECT_LOCKED_DEFAULT` and any `image`-specific branches.
- **`SideEditor.vue`:** remove the "Image" label and colour.
- **`vite.config.ts`:** remove `image` from `VAR_MAP`, so saved layouts stop emitting `--ed-image-*`. Reading a saved layout that still has them is harmless: unknown variables are ignored.
- **Forks and overrides:** existing `layout-<ts>.vue` files and consumer `layouts/default.vue` overrides are full copies of the old layout, so they keep their own extraction code untouched.

### 6. Tutorial and docs

- **`tutorial.md`:** slides whose images relied on automatic placement get explicit `geometry.images` entries reproducing today's look.
- **Theme README:** a short "Behaviour change" note: images stay in flow unless positioned, and old forks are unaffected.
- **`AGENTS.md`:** drops the tracked-image bullet and the "paste presets' layout fork is unchanged" sentence.

## Risks / Trade-offs

- **[Decks without geometry change their look]** → This is intended and documented. Pasting again or adding a `geometry.images` entry restores a positioned image, and imported decks already carry geometry.
- **[Side editor open while choosing a preset]** → The Content tab's textarea holds `frontmatter + content`, and a later autosave of that textarea could write back the pre-preset frontmatter. An e2e case covers pasting with the side editor open, choosing a preset, waiting past the autosave, and checking that `geometry` survives. If it doesn't, the preset write also patches the textarea's frontmatter part before saving, the same way paste already edits that textarea.
- **[Side editor open while choosing a preset: outcome]** → Implementation confirmed the risk in two ways. First, `global-top.vue` doesn't always share the `useDynamicSlideInfo` cache the layout and the side editor read, so the write reached neither. Second, Slidev's response to a frontmatter patch still carries the old `frontmatterRaw`. So `composables/slideInfoSync.ts` publishes the slide info on `window`: the POST response right away (for the layout), and the reparsed info once the server has re-read the file (for the textarea). Both readers apply it to their own copy. An e2e case types into the textarea afterwards and checks that `geometry` survives.
- **[Slide 1 reloads]** → Slide 1's frontmatter is the deck's headmatter, and Slidev reloads the page when that changes. There, a preset still writes the geometry, but the popover closes with the reload. Presets on any other slide never reload.
- **[Text height measured under autofit]** → Autofit may have shrunk the font, so the measurement is taken as rendered; it errs towards a smaller content box, and autofit then fits the text into it.
- **[Stale layout-level `image` state]** → Nothing reads `positions.image` any more. An old undo snapshot may still contain an `image` key, which `useEditor` ignores.

## Migration Plan

This is a theme behaviour change, released as a minor version bump with the README note.
- **Existing forked slides:** keep working as frozen copies.
- **Slides without geometry that relied on automatic placement:** their images render inline until positioned.
- **Rollback:** revert the change.

## Open Questions

None.
