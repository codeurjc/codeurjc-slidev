<script setup lang="ts">
import { useEditor, CONTENT_DEFAULT_WIDTH } from '../composables/useEditor'
import { useAutoFitText } from '../composables/useAutoFitText'
import { computeBelowPreset } from '../composables/useImagePosition'
import { placeCallout, elbowPath, pointsToSvgPath, estimateCalloutSize, type Rect, type Side } from '../composables/useHighlightLayout'
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'

const VAR_MAP: Record<string, Record<string, string>> = {
  'red-bar': { y: '--ed-red-y', x: '--ed-red-x', w: '--ed-red-w', h: '--ed-red-h' },
  logo: { y: '--ed-logo-y', x: '--ed-logo-rx', w: '--ed-logo-w', h: '--ed-logo-h' },
  title: { y: '--ed-title-y', x: '--ed-title-x', w: '--ed-title-w', h: '--ed-title-h' },
  content: { y: '--ed-content-y', x: '--ed-content-x', w: '--ed-content-w', h: '--ed-content-h' },
  image: { y: '--ed-image-y', x: '--ed-image-x', w: '--ed-image-w', h: '--ed-image-h' },
}

const editor = useEditor()
const rootEl = ref<HTMLElement | null>(null)
const contentEl = ref<HTMLElement | null>(null)
const contentInnerEl = ref<HTMLElement | null>(null)

useAutoFitText(contentEl, contentInnerEl, () => editor.positions.content?.h ?? 400)

// Whether this layout has ever had an image explicitly positioned/saved
// (distinct from the other four elements, which always exist): only trust
// the saved hidden/position state for `image` when it does. Otherwise
// `hidden.image` is derived live from whether content currently has a
// trackable image at all (see updateTrackedImage below), since a shared
// layout that predates this feature (or was never used with a pasted image)
// has no meaningful saved state for it.
let imageEverSaved = false

onMounted(() => {
  const el = rootEl.value
  if (!el) return
  // Use data-styles (never overridden by :style) so saved positions survive editor re-open
  const style = el.getAttribute('data-styles') || el.getAttribute('style') || ''
  const hiddenStr = el.getAttribute('data-hidden') || ''
  const lockedStr = el.getAttribute('data-aspect-locked') || ''
  imageEverSaved = /--ed-image-[xywh]:/.test(style)

  // Restore positions from static style CSS custom properties
  for (const [key, vars] of Object.entries(VAR_MAP)) {
    for (const [prop, cssVar] of Object.entries(vars)) {
      const match = style.match(new RegExp(`${cssVar}:\\s*(-?\\d+)px`))
      if (match && editor.positions[key]) {
        (editor.positions[key] as any)[prop] = parseInt(match[1], 10)
      }
    }
  }

  // Sync snapshot so Reset reverts to saved positions, not initial defaults
  editor.updateSnapshot()

  // Restore hidden state
  if (hiddenStr) {
    // `image` is excluded here: its hidden/shown state is derived at
    // runtime by updateTrackedImage() below, not from this list (see its
    // exclusion from data-hidden in the save middleware).
    const h: Record<string, boolean> = {}
    for (const key of Object.keys(editor.positions)) {
      if (key === 'image') continue
      h[key] = hiddenStr.split(',').includes(key)
    }
    editor.setHidden(h)
  }

  // Restore aspect-lock state. data-aspect-locked lists the *locked*
  // elements (unlocked is the default), so anything not listed stays unlocked.
  const lockedNames = lockedStr ? lockedStr.split(',') : []
  const al: Record<string, boolean> = {}
  for (const key of Object.keys(editor.positions)) {
    al[key] = lockedNames.includes(key)
  }
  editor.setAspectLocked(al)

  updateTrackedImage()
  nextTick(computeCallouts)
  // Callout placement measures real rendered rects (code line widths, in
  // particular), which shift once the presentation's web font finishes
  // loading -- a reflow that a MutationObserver never sees (no DOM change)
  // and that can land well after the first computeCallouts() pass. Without
  // this, callouts measured against the pre-fallback-font layout can get
  // stuck wherever that first (wrong) measurement placed them.
  document.fonts?.ready?.then(() => computeCallouts())
  const observer = new MutationObserver(() => {
    updateTrackedImage()
    computeCallouts()
  })
  if (contentInnerEl.value) {
    observer.observe(contentInnerEl.value, { childList: true, subtree: true })
  }
  window.addEventListener('resize', computeCallouts)
  onUnmounted(() => {
    observer.disconnect()
    window.removeEventListener('resize', computeCallouts)
  })
})

watch(() => editor.editing.value, () => nextTick(computeCallouts))

// --- Code-highlight callouts -------------------------------------------
// One draggable callout box per highlighted code fragment that carries a
// comment (see composables/useCodeHighlights.ts for the marker syntax and
// setup/transformers.ts for how highlights are rendered as
// `[data-highlight-id]` spans). Auto-placement/elbow-routing is pure
// geometry (composables/useHighlightLayout.ts); this just gathers DOM rects
// and wires drag -> persistence.

interface CalloutItem {
  id: string
  comment: string
  rect: Rect
  path: string
  overrideKey: string
  sourceLine: string
  // Retained so the post-render remeasure pass (see remeasureCallouts) can
  // recompute the connector path against the box's real auto-sized rect
  // without re-running placement/collision detection.
  highlightRect: Rect
  side: Side
}

const calloutItems = ref<CalloutItem[]>([])
const calloutEls = new Map<string, HTMLElement>()
function setCalloutRef(id: string, el: Element | null) {
  if (el) calloutEls.set(id, el as HTMLElement)
  else calloutEls.delete(id)
}

// Highlight ids whose callout position is presenter-controlled (either via a
// markdown `@x,y` override or an in-session drag) rather than recomputed
// fresh on every pass. Local to this mounted instance so it naturally resets
// when the layout remounts for a different slide.
const manualIds = ref(new Set<string>())

function decodeBase64(s: string): string {
  try {
    return decodeURIComponent(Array.prototype.map.call(atob(s), (c: string) =>
      `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`).join(''))
  } catch {
    return ''
  }
}

function getScale(): number {
  const el = rootEl.value
  if (!el || !el.scrollWidth) return 1
  return el.getBoundingClientRect().width / el.scrollWidth
}

function rectOf(el: Element, originRect: DOMRect, scale: number): Rect {
  const r = el.getBoundingClientRect()
  return { x: (r.left - originRect.left) / scale, y: (r.top - originRect.top) / scale, w: r.width / scale, h: r.height / scale }
}

function unionRects(rects: Rect[]): Rect {
  const x = Math.min(...rects.map(r => r.x))
  const y = Math.min(...rects.map(r => r.y))
  const right = Math.max(...rects.map(r => r.x + r.w))
  const bottom = Math.max(...rects.map(r => r.y + r.h))
  return { x, y, w: right - x, h: bottom - y }
}

// `<pre>` is a block-level element that stretches to its container's full
// width regardless of how long the actual code lines are (Shiki/the theme
// don't shrink-wrap it), so using the pre's own bounding rect as the "avoid
// this" obstacle treats a lot of genuinely blank space as occupied. Using
// the union of the individual `.line` spans' rects instead gives a tight
// box matching the widest actual line, freeing up real side margin for
// right/left placement.
function tightCodeRect(pre: Element, originRect: DOMRect, scale: number): Rect {
  const lineEls = Array.from(pre.querySelectorAll(':scope > code > .line'))
  if (lineEls.length === 0) return rectOf(pre, originRect, scale)
  return unionRects(lineEls.map(el => rectOf(el, originRect, scale)))
}

function deriveSide(rect: Rect, codeRect: Rect): Side {
  if (rect.x >= codeRect.x + codeRect.w) return 'right'
  if (rect.x + rect.w <= codeRect.x) return 'left'
  if (rect.y >= codeRect.y + codeRect.h) return 'below'
  if (rect.y + rect.h <= codeRect.y) return 'above'
  const dx = (rect.x + rect.w / 2) - (codeRect.x + codeRect.w / 2)
  const dy = (rect.y + rect.h / 2) - (codeRect.y + codeRect.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'below' : 'above'
}

function computeCallouts() {
  const root = rootEl.value
  const container = contentInnerEl.value
  if (!root || !container) {
    calloutItems.value = []
    return
  }
  const scale = getScale()
  const originRect = root.getBoundingClientRect()
  const slideRect: Rect = { x: 0, y: 0, w: originRect.width / scale, h: originRect.height / scale }

  const groups = new Map<string, Element[]>()
  for (const el of Array.from(container.querySelectorAll('[data-highlight-id]'))) {
    const id = el.getAttribute('data-highlight-id')
    if (!id) continue
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id)!.push(el)
  }

  const codeRectCache = new Map<Element, Rect>()
  function codeRectFor(pre: Element): Rect {
    let r = codeRectCache.get(pre)
    if (!r) {
      r = tightCodeRect(pre, originRect, scale)
      codeRectCache.set(pre, r)
    }
    return r
  }

  const items: CalloutItem[] = []
  const placed: Rect[] = []
  for (const [id, els] of groups) {
    const first = els[0]
    const comment = first.getAttribute('data-comment')
    if (!comment) continue // highlight without a comment: no callout, style-only

    const sourceLineB64 = first.getAttribute('data-source-line')
    const sourceLine = sourceLineB64 ? decodeBase64(sourceLineB64) : ''
    const pre = first.closest('pre')
    const codeRect = pre ? codeRectFor(pre) : slideRect
    const highlightRect = unionRects(els.map(el => rectOf(el, originRect, scale)))
    const overrideKey = `callout:${id}`
    const calloutSize = estimateCalloutSize(comment)

    const overrideX = first.getAttribute('data-override-x')
    const overrideY = first.getAttribute('data-override-y')
    if (overrideX !== null && overrideY !== null && !manualIds.value.has(overrideKey)) {
      manualIds.value.add(overrideKey)
      editor.ensurePosition(overrideKey, { x: Number(overrideX), y: Number(overrideY), ...calloutSize })
    }

    let rect: Rect
    let side: Side
    if (manualIds.value.has(overrideKey)) {
      editor.ensurePosition(overrideKey, { x: highlightRect.x, y: highlightRect.y, ...calloutSize })
      const p = editor.positions[overrideKey]
      rect = { x: p.x, y: p.y, w: calloutSize.w, h: calloutSize.h }
      side = deriveSide(rect, codeRect)
    } else {
      const placement = placeCallout({ codeRect, highlightRect, calloutSize, slideRect, placed })
      rect = placement.rect
      side = placement.side
      editor.ensurePosition(overrideKey, rect)
      Object.assign(editor.positions[overrideKey], rect)
    }
    placed.push(rect)
    const path = pointsToSvgPath(elbowPath(highlightRect, rect, side))
    items.push({ id, comment, rect, path, overrideKey, sourceLine, highlightRect, side })
  }
  calloutItems.value = items
  editor.pruneDynamicKeys('callout:', new Set(groups.keys()))
  nextTick(remeasureCallouts)
}

// The rendered box is CSS auto-sized to its text (width: max-content capped
// by max-width, height: auto), so the estimate used for placement above can
// be off by a few pixels. Once the real box exists, re-read its actual
// rect and recompute just the connector path so the line always meets the
// box's true edge -- cheap, and avoids re-running placement/collision.
function remeasureCallouts() {
  const root = rootEl.value
  if (!root) return
  const scale = getScale()
  const originRect = root.getBoundingClientRect()
  for (const item of calloutItems.value) {
    const el = calloutEls.get(item.id)
    if (!el) continue
    const real = rectOf(el, originRect, scale)
    if (Math.abs(real.w - item.rect.w) < 1 && Math.abs(real.h - item.rect.h) < 1) continue
    item.rect.w = real.w
    item.rect.h = real.h
    item.path = pointsToSvgPath(elbowPath(item.highlightRect, item.rect, item.side))
  }
}

function startCalloutDrag(e: MouseEvent, item: CalloutItem) {
  if (!editor.editing.value) return
  manualIds.value.add(item.overrideKey)
  editor.startDrag(e, item.overrideKey)
  const onUp = () => {
    window.removeEventListener('mouseup', onUp)
    saveCalloutPosition(item.overrideKey, item.sourceLine)
  }
  window.addEventListener('mouseup', onUp)
}

async function saveCalloutPosition(overrideKey: string, sourceLine: string) {
  const pos = editor.positions[overrideKey]
  if (!pos || !sourceLine) return
  try {
    await fetch('/api/save-code-highlight-position', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceLine, x: pos.x, y: pos.y }),
    })
  } catch {
    // best-effort: a failed save just means the drag stays session-only
  }
}

// Finds the last <img> in document order within the slide's content (a
// plain CSS :last-of-type selector can't express this correctly once images
// sit at different nesting depths -- see design.md), marks it as the single
// tracked/draggable image, and derives hidden.image + a live default position
// (when none was ever explicitly saved for this layout).
function updateTrackedImage() {
  const container = contentInnerEl.value
  if (!container) return
  const imgs = Array.from(container.querySelectorAll('img'))
  for (const img of imgs) img.classList.remove('tracked-image')
  const last = imgs[imgs.length - 1] as HTMLImageElement | undefined

  if (!last) {
    editor.hidden.image = true
    return
  }
  last.classList.add('tracked-image')

  if (imageEverSaved) {
    // Saved state (including a user's manual hide via the delete button)
    // is authoritative once this layout has ever positioned an image.
    return
  }

  const applyLiveDefault = () => {
    if (!last.naturalWidth || !last.naturalHeight) return
    const ratio = last.naturalWidth / last.naturalHeight
    const content = editor.positions.content
    const slideWidth = rootEl.value?.getBoundingClientRect().width || 980
    const { content: newContent, image } = computeBelowPreset(content, slideWidth, ratio, CONTENT_DEFAULT_WIDTH)
    Object.assign(editor.positions.content, newContent)
    Object.assign(editor.positions.image, image)
    editor.hidden.image = false
  }
  if (last.complete) applyLiveDefault()
  else last.addEventListener('load', applyLiveDefault, { once: true })
}

watch(editor.hidden, (v) => {
  const el = rootEl.value
  if (!el) return
  const hiddenNames = Object.entries(v)
    .filter(([_, isHidden]) => isHidden)
    .map(([k]) => k)
  if (hiddenNames.length > 0) {
    el.setAttribute('data-hidden', hiddenNames.join(','))
  } else {
    el.removeAttribute('data-hidden')
  }
})

watch(editor.aspectLocked, (v) => {
  const el = rootEl.value
  if (!el) return
  const lockedNames = Object.entries(v)
    .filter(([_, locked]) => locked)
    .map(([k]) => k)
  if (lockedNames.length > 0) {
    el.setAttribute('data-aspect-locked', lockedNames.join(','))
  } else {
    el.removeAttribute('data-aspect-locked')
  }
})
</script>

<template>
    <div
      ref="rootEl"
      class="slidev-layout default relative h-full w-full bg-white text-black"
      :class="{ editing: editor.editing.value }"
      style="--ed-red-y: 0px; --ed-red-x: 0px; --ed-red-w: 980px; --ed-red-h: 10px; --ed-logo-y: 20px; --ed-logo-rx: 24px; --ed-logo-w: 80px; --ed-logo-h: 48px; --ed-title-y: 20px; --ed-title-x: 24px; --ed-title-w: 843px; --ed-title-h: 48px; --ed-content-y: 98px; --ed-content-x: 31px; --ed-content-w: 901px; --ed-content-h: 424px; --ed-image-y: 80px; --ed-image-x: 438px; --ed-image-w: 400px; --ed-image-h: 300px"
      data-styles="--ed-red-y: 0px; --ed-red-x: 0px; --ed-red-w: 980px; --ed-red-h: 10px; --ed-logo-y: 20px; --ed-logo-rx: 24px; --ed-logo-w: 80px; --ed-logo-h: 48px; --ed-title-y: 20px; --ed-title-x: 24px; --ed-title-w: 843px; --ed-title-h: 48px; --ed-content-y: 98px; --ed-content-x: 31px; --ed-content-w: 901px; --ed-content-h: 424px; --ed-image-y: 80px; --ed-image-x: 438px; --ed-image-w: 400px; --ed-image-h: 300px"
      :style="editor.editing.value ? editor.rootStyle.value : {}"
    >
    <!-- ed:red-bar:start -->
    <div
      v-if="!editor.hidden['red-bar']"
      class="red-bar"
      :class="{ 'el-active': editor.editing.value && editor.selected.value === 'red-bar' }"
      @mousedown.stop="editor.startDrag($event, 'red-bar')"
    >
      <div
        v-if="editor.editing.value && editor.selected.value === 'red-bar'"
        class="resize-handle se"
        @mousedown.stop="editor.startResize($event, 'red-bar')"
      />
      <div
        v-if="editor.editing.value && editor.selected.value === 'red-bar'"
        class="delete-btn"
        @mousedown.stop="editor.removeElement('red-bar')"
      >✕</div>
    </div>
    <!-- ed:red-bar:end -->

    <!-- ed:logo:start -->
    <div
      v-if="!editor.hidden['logo']"
      class="logo"
      :class="{ 'el-active': editor.editing.value && editor.selected.value === 'logo' }"
      @mousedown.stop="editor.startDrag($event, 'logo')"
    >
      <img src="/images/logo.png" alt="Logo">
      <div
        v-if="editor.editing.value && editor.selected.value === 'logo'"
        class="resize-handle sw"
        @mousedown.stop="editor.startResize($event, 'logo')"
      />
      <div
        v-if="editor.editing.value && editor.selected.value === 'logo'"
        class="delete-btn"
        @mousedown.stop="editor.removeElement('logo')"
      >✕</div>
    </div>
    <!-- ed:logo:end -->

    <div
      ref="contentEl"
      class="content"
      :class="{ 'el-active': editor.editing.value && editor.selected.value === 'content' }"
    >
      <div ref="contentInnerEl" class="content-inner">
        <slot />
      </div>
    </div>

    <div
      v-if="editor.editing.value && !editor.hidden['content']"
      class="content-overlay"
      :class="{ 'el-active': editor.selected.value === 'content' }"
      @mousedown.stop="editor.startDrag($event, 'content')"
    >
      <span class="el-tag">Content</span>
      <div
        v-if="editor.selected.value === 'content'"
        class="resize-handle se"
        @mousedown.stop="editor.startResize($event, 'content')"
      />
      <div
        v-if="editor.selected.value === 'content'"
        class="delete-btn"
        @mousedown.stop="editor.removeElement('content')"
      >✕</div>
    </div>

    <div
      v-if="editor.editing.value && !editor.hidden['title']"
      class="title-overlay"
      :style="{ top: editor.positions.title.y + 'px', left: editor.positions.title.x + 'px' }"
      :class="{ 'el-active': editor.selected.value === 'title' }"
      @mousedown.stop="editor.startDrag($event, 'title')"
    >
      <span class="el-tag">Title</span>
      <div
        v-if="editor.selected.value === 'title'"
        class="resize-handle se"
        @mousedown.stop="editor.startResize($event, 'title')"
      />
      <div
        v-if="editor.selected.value === 'title'"
        class="delete-btn"
        @mousedown.stop="editor.removeElement('title')"
      >✕</div>
    </div>

    <div
      v-if="editor.editing.value && !editor.hidden['image']"
      class="image-overlay"
      :style="{ top: editor.positions.image.y + 'px', left: editor.positions.image.x + 'px', width: editor.positions.image.w + 'px', height: editor.positions.image.h + 'px' }"
      :class="{ 'el-active': editor.selected.value === 'image' }"
      @mousedown.stop="editor.startDrag($event, 'image')"
    >
      <span class="el-tag">Image</span>
      <div
        v-if="editor.selected.value === 'image'"
        class="resize-handle se"
        @mousedown.stop="editor.startResize($event, 'image')"
      />
      <div
        v-if="editor.selected.value === 'image'"
        class="delete-btn"
        @mousedown.stop="editor.removeElement('image')"
      >✕</div>
    </div>

    <svg class="code-callout-svg" xmlns="http://www.w3.org/2000/svg">
      <path
        v-for="item in calloutItems"
        :key="`path-${item.id}`"
        class="code-callout-connector"
        :d="item.path"
      />
    </svg>
    <div
      v-for="item in calloutItems"
      :key="item.id"
      :ref="(el) => setCalloutRef(item.id, el as Element | null)"
      class="code-callout"
      :class="{ 'el-active': editor.editing.value && editor.selected.value === item.overrideKey }"
      :style="{ left: item.rect.x + 'px', top: item.rect.y + 'px' }"
      @mousedown.stop="startCalloutDrag($event, item)"
    >{{ item.comment }}</div>

  </div>
</template>

<style>
/* Slidev's base theme applies px-14 py-10 (56px/40px) padding to every
   .slidev-layout. red-bar/logo/title/content-overlay are all absolute and
   ignore it, but .content (normal flow) doesn't — override it to 0 so
   .content's own margin is the only source of its offset (matching
   content-overlay's math exactly, both horizontally and vertically).
   display: flow-root establishes a new block-formatting context so
   .content's margin-top can't collapse through root now that there's no
   padding acting as a collapse barrier (a plain padding: 0 override caused
   exactly that regression previously — content jumped to y=0 and overlapped
   the title). */
.slidev-layout.default {
  padding: 0;
  display: flow-root;
}

.slidev-layout.default h1:first-child {
  display: var(--ed-title-d, flex);
  align-items: center;
  position: absolute;
  top: var(--ed-title-y, 20px);
  left: var(--ed-title-x, 24px);
  width: var(--ed-title-w, auto);
  min-height: var(--ed-title-h, auto);
  margin: 0;
  overflow-wrap: break-word;
  font-weight: 700;
  color: #cb0017;
  font-size: 36pt;
  line-height: 1.2;
}

.slidev-layout.default h1:first-child + p {
  margin-top: 0;
  opacity: 1;
}

.slidev-layout .content :where(h2) {
  font-weight: 700;
  color: inherit;
  font-size: 29pt;
  line-height: 1.2;
  margin: 0 0 0.4em;
}

.slidev-layout .content :where(strong) {
  font-weight: 800;
}

/* Pulls the tracked image out of normal content flow, same technique as
   h1:first-child above. Uses a JS-assigned class rather than a structural
   pseudo-class (e.g. :last-of-type) because the latter only compares
   siblings under the same parent -- it can't express "last image in the
   whole subtree" once images sit at different nesting depths. */
.content-inner .tracked-image {
  display: var(--ed-image-d, block);
  position: absolute;
  top: var(--ed-image-y, 80px);
  left: var(--ed-image-x, 438px);
  width: var(--ed-image-w, 400px);
  height: var(--ed-image-h, 300px);
  object-fit: contain;
  z-index: 40;
}

.image-overlay {
  position: absolute;
  cursor: move;
  outline: 2px dashed #9333ea;
  border-radius: 2px;
  z-index: 65;
  pointer-events: auto;
}

.image-overlay.el-active {
  outline-style: solid;
}

.title-overlay {
  position: absolute;
  width: var(--ed-title-w, 400px);
  height: var(--ed-title-h, 48px);
  cursor: move;
  outline: 2px dashed #2563eb;
  border-radius: 2px;
  z-index: 60;
  display: flex;
  align-items: center;
  pointer-events: auto;
}

.title-overlay.el-active {
  outline-style: solid;
}

/* Must stay position: static — the title <h1> is nested inside .content via
   <slot />, and relies on .content being unpositioned so it can escape to
   root as its containing block (see title's absolute positioning below). */
.content {
  display: var(--ed-content-d, block);
  margin-top: var(--ed-content-y, 80px);
  margin-left: var(--ed-content-x, 0px);
  width: var(--ed-content-w, 876px);
  min-height: var(--ed-content-h, 200px);
  padding: 0;
  overflow-wrap: break-word;
  font-size: var(--content-font-size, 26pt);
  line-height: 1.2;
}

/* The theme's base styles set a fixed (non-relative) line-height on text
   elements sized for its own default font-size. Since .content's font-size
   is dynamically scaled (autofit, pt-based sizing), that fixed line-height
   no longer matches and wrapped lines overlap. :where() keeps this at zero
   added specificity beyond .content itself, but still wins over the theme's
   bare-element selectors by source order/specificity. */
.slidev-layout .content :where(p, li, ul, ol) {
  line-height: 1.2;
}

/* Spacing between separate list items (as opposed to line-height, which only
   affects wrapped lines within one item) — em-relative so it scales with the
   content font size instead of the theme's fixed-px default. The inner <p>'s
   own margin is zeroed so li's margin is the only source of the gap. */
.slidev-layout .content :where(li) {
  margin: 0.6em 0;
}

/* The theme's reset zeroes ul/ol's own padding-left to 0 (li's own 0.2em
   padding only indents text within the li, it doesn't reserve room for the
   marker). With list-style-position: outside, the bullet is drawn in that
   padding area, so at zero it renders outside the content box entirely. */
.slidev-layout .content :where(ul, ol) {
  padding-left: 1em;
}

.slidev-layout .content li :where(p) {
  margin: 0;
}

/* Slidev's v-click hides not-yet-revealed content via opacity only, still
   reserving its layout space -- which would make the auto-fit measurement
   always account for the fully-revealed state, never reacting to individual
   click steps. Collapsing it here (scoped to .content-inner only) means
   .content-inner's rendered height reflects just what's currently visible. */
.content-inner :where(.slidev-vclick-hidden) {
  display: none;
}

.content-overlay {
  position: absolute;
  top: var(--ed-content-y, 80px);
  left: var(--ed-content-x, 0px);
  width: var(--ed-content-w, 876px);
  min-height: var(--ed-content-h, 200px);
  cursor: move;
  outline: 2px dashed #16a34a;
  border-radius: 2px;
  z-index: 55;
  pointer-events: auto;
}

.content-overlay.el-active {
  outline-style: solid;
}

.el-tag {
  font-size: 10px;
  font-weight: 600;
  color: #2563eb;
  background: rgba(37, 99, 235, 0.1);
  padding: 0 4px;
  border-radius: 2px;
  margin-left: 2px;
}

.red-bar {
  position: absolute;
  top: var(--ed-red-y, 0px);
  left: var(--ed-red-x, 0px);
  width: var(--ed-red-w, 100%);
  height: var(--ed-red-h, 10px);
  background-color: #cb0017;
  z-index: 100;
}

.logo {
  position: absolute;
  top: var(--ed-logo-y, 20px);
  right: var(--ed-logo-rx, 24px);
  width: var(--ed-logo-w, 80px);
  height: var(--ed-logo-h, 48px);
  z-index: 50;
}

.logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.editing .red-bar,
.editing .logo {
  cursor: move;
  outline: 2px dashed transparent;
  transition: outline-color 0.15s;
}

.editing .red-bar { outline-color: #cb0017; }
.editing .logo { outline-color: #e8792b; }

.editing .red-bar.el-active,
.editing .logo.el-active {
  outline-style: solid;
}

.resize-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: white;
  border: 2px solid #333;
  border-radius: 2px;
  z-index: 70;
}

.resize-handle.se {
  bottom: -6px;
  right: -6px;
  cursor: nwse-resize;
}

.resize-handle.sw {
  bottom: -6px;
  left: -6px;
  cursor: nesw-resize;
}

/* Persistent code-fragment highlight (see composables/useCodeHighlights.ts).
   Distinct from Slidev's native {n-m} click-step dim/undim so the two don't
   visually collide if a code block uses both. */
.content-inner :where(.code-hl-mark) {
  background: rgba(203, 0, 23, 0.14);
  border-radius: 3px;
  box-shadow: 0 0 0 1px rgba(203, 0, 23, 0.35);
}

.code-callout-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 58;
  pointer-events: none;
  overflow: visible;
}

.code-callout-connector {
  fill: none;
  stroke: #cb0017;
  stroke-width: 1.5;
}

.code-callout {
  position: absolute;
  z-index: 59;
  padding: 8px 10px;
  background: #fff;
  border: 1.5px solid #cb0017;
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  font-size: 13px;
  line-height: 1.3;
  color: #1a1a1a;
  cursor: default;
  /* Fits the box to its comment text (composables/useHighlightLayout.ts's
     estimateCalloutSize only approximates this for placement purposes) so
     short comments don't render as mostly-empty boxes. */
  width: max-content;
  max-width: 220px;
  height: auto;
}

.editing .code-callout {
  cursor: move;
  outline: 2px dashed transparent;
  transition: outline-color 0.15s;
}

.editing .code-callout.el-active {
  outline-color: #cb0017;
  outline-style: solid;
}

.delete-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 16px;
  height: 16px;
  background: white;
  border: 2px solid #cb0017;
  border-radius: 2px;
  z-index: 80;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  line-height: 1;
  color: #cb0017;
  font-weight: bold;
  user-select: none;
}
</style>
