## Why

The paste-to-add-image feature (shipped) always inserts an image inline in the flow of the text, with no way to place it beside the content instead of below it. The README roadmap calls out configurable image placement (below vs. beside text) as the next step. Doing this well means the image needs to become a real, independently positioned element in the existing layout editor — the same drag/resize/aspect-lock machinery `red-bar`, `logo`, `title`, and `content` already have — rather than a one-off CSS trick.

## What Changes

- A pasted image is extracted from the rendered slide content (via CSS selector, the same technique already used to pull the title `<h1>` out of flow) and becomes a 5th element in `useEditor.ts`'s registry: `image`, with `x/y/w/h`, drag, resize, and aspect-lock — everything the other four elements get today.
- New images default to aspect-locked (unlike the other four, which start unlocked), using the pasted image's real natural aspect ratio.
- Right after a paste inserts an image and the slide re-renders with it, a transient popover appears anchored to the image with two presets: **Below** (default/pre-selected — centered under the text, content box full width) and **Right** (image takes the right portion of the content box; content box automatically shrinks to make room, avoiding overlap).
- Picking a preset computes the image's and content box's `x/y/w/h` and **saves immediately** — no separate "Save Layout" step, consistent with how paste-to-markdown already auto-saves. Since element positions are stored in the layout `.vue` file itself (shared by every slide using that layout), and an image's position is inherently per-slide, this save always goes through the existing "save as new layout" path (never overwrite) — auto-cloning the current layout and pointing just this slide's frontmatter at the clone, exactly as manually checking "Save as new layout" already does today. This avoids the alternative of silently repositioning images (and shrinking the content box) on every other slide sharing that layout.
- v1 scope is one draggable image per slide. If a second image is pasted, the newest one (last in document order) becomes the tracked/draggable element; earlier pasted images remain plain inline images with no overlay.
- Once positioned, the image behaves exactly like any other layout element for further adjustment (drag, resize, lock/unlock) via the existing Layout tab UI — no new UI there beyond it appearing in the element list.

## Capabilities

### New Capabilities
- `image-position`: extracting a pasted image into a draggable layout element, the below/right preset popover shown after paste, preset-driven coordinate computation (including auto-shrinking the content box for "right"), and immediate auto-save of the chosen preset.

### Modified Capabilities
- `layout-editor-resize`: the "Every layout element is fully resizable" requirement's enumerated element set (`red-bar`, `logo`, `title`, `content`) grows to include `image`, and the "Per-element aspect-ratio lock defaults to off" requirement gains an exception for newly-created image elements, which default to locked.

## Impact

- `composables/useEditor.ts` — new `image` entry in the `ELEMENTS` registry; default-aspect-locked-on-creation exception.
- `layouts/default.vue` — CSS selector extracting the tracked `<img>` out of flow into its own overlay box, mirroring the existing title extraction; draggable/resizable overlay markup for the `image` element.
- `global-top.vue` — after a successful paste + slide re-render, show the position-preset popover anchored to the new image.
- New popover UI component (below/right preset picker).
- `vite.config.ts` / `e2e/vite.config.ts` — layout-save logic needs to be reachable from the popover's auto-save path (likely reusing the existing `/api/save-layout` endpoint).
- Existing `openspec/specs/layout-editor-resize/spec.md` gets a delta for the expanded element set and the aspect-lock-default exception.
