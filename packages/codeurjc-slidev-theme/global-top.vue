<script setup lang="ts">
import { useNav } from '@slidev/client/composables/useNav.ts'
import { useDynamicSlideInfo } from '@slidev/client/composables/useSlideInfo.ts'
import { showEditor } from '@slidev/client/state/storage.ts'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { publishSlideInfo } from './composables/slideInfoSync'
import { CONTENT_DEFAULT_WIDTH, useEditor } from './composables/useEditor'
import { appendImageMarkdown, buildImageMarkdown, findPastedImage, insertAtCursor, uploadImage } from './composables/useImagePaste'
import { computeBelowPreset, computeRightPreset } from './composables/useImagePosition'
import { authoredSrc, imageRefFor } from './composables/useImageRefs'
import { parseSlideGeometry, withPositionedImage } from './composables/useSlideGeometry'
import { resolveBlockRange } from './composables/useTextClickToEdit'

const { currentSlideNo, slides } = useNav()
const { update } = useDynamicSlideInfo(currentSlideNo)
const editor = useEditor()

const popoverVisible = ref(false)
const popoverStyle = ref<Record<string, string>>({})
// The upload path of the image the popover is for: the image is looked up
// again by it each time, since a content update re-renders it.
const popoverImagePath = ref<string | null>(null)
const POPOVER_HEIGHT = 40

interface SlideJson {
  frontmatter?: Record<string, unknown>
  frontmatterRaw?: string
  source?: { contentRaw?: string }
}

function fetchSlide(no: number): Promise<SlideJson> {
  return fetch(`/__slidev/slides/${no}.json`).then(r => r.json())
}

function slideLayout(no: number): string {
  const frontmatter = slides.value[no - 1]?.meta.slide?.frontmatter as Record<string, unknown> | undefined
  return (frontmatter?.layout as string | undefined) ?? 'default'
}

async function onPaste(e: ClipboardEvent) {
  const file = findPastedImage(e.clipboardData)
  if (!file)
    return
  e.preventDefault()

  const slideNo = currentSlideNo.value
  const { path } = await uploadImage(file)
  const markdown = buildImageMarkdown(path)

  if (showEditor.value) {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-editor="content"] textarea')
    if (textarea) {
      insertAtCursor(textarea, markdown)
      offerPresets(slideNo, path)
      return
    }
  }

  // Read the slide's current content fresh from the server rather than
  // relying on useDynamicSlideInfo's reactive `info` ref: that ref is
  // populated by its own async fetch on mount, which may not have resolved
  // yet if the user pastes shortly after page load, silently wiping the
  // slide's content instead of appending to it.
  const contentRaw = (await fetchSlide(slideNo)).source?.contentRaw ?? ''
  await update({ content: appendImageMarkdown(contentRaw, markdown) })
  offerPresets(slideNo, path)
}

// The current slide's root layout element and the canvas scale it's shown at.
function currentLayoutEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-slidev-no="${currentSlideNo.value}"] .slidev-layout.default`)
}

// The pasted image, found by its authored src (the `data-src` stamped by
// markdownImageSrc.ts): the rendered src is a bundled asset URL.
function findPastedImageEl(path: string): HTMLImageElement | null {
  const images = currentLayoutEl()?.querySelectorAll<HTMLImageElement>('.content-inner img') ?? []
  return Array.from(images).find(img => authoredSrc(img) === path) ?? null
}

// Waits for the slide to re-render with the newly-pasted image before showing
// the position popover. Bounded: if it never appears in time, the popover is
// silently skipped -- the image still renders inline in normal flow either
// way. Presets only exist for `default`-layout slides, the only layout that
// reads `geometry`.
function offerPresets(slideNo: number, path: string) {
  if (slideLayout(slideNo) !== 'default')
    return
  const deadline = Date.now() + 5000
  function check() {
    if (currentSlideNo.value !== slideNo)
      return
    if (findPastedImageEl(path)) {
      popoverImagePath.value = path
      popoverVisible.value = true
      anchorPopover()
      return
    }
    if (Date.now() < deadline)
      setTimeout(check, 50)
  }
  check()
}

// Anchors the popover under the pasted image, in slide-canvas pixels: the
// popover renders inside the slide container, which is scaled by a transform.
function anchorPopover() {
  const layoutEl = currentLayoutEl()
  const img = popoverImagePath.value ? findPastedImageEl(popoverImagePath.value) : null
  if (!layoutEl || !img)
    return
  const origin = layoutEl.getBoundingClientRect()
  const scale = layoutEl.offsetWidth ? origin.width / layoutEl.offsetWidth : 1
  const rect = img.getBoundingClientRect()
  const top = Math.min((rect.bottom - origin.top) / scale + 8, layoutEl.offsetHeight - POPOVER_HEIGHT)
  const left = Math.max(0, (rect.left - origin.left) / scale)
  popoverStyle.value = { top: `${Math.max(0, top)}px`, left: `${left}px` }
}

// The content's rendered text height, without the pasted image when it still
// sits in normal flow. offsetHeight ignores the slide's scale transform.
function contentTextHeight(layoutEl: HTMLElement, img: HTMLImageElement): number {
  const inner = layoutEl.querySelector<HTMLElement>('.content-inner')
  if (!inner)
    return 0
  const previous = img.style.display
  img.style.display = 'none'
  const height = inner.offsetHeight
  img.style.display = previous
  return height
}

async function choosePreset(preset: 'below' | 'right') {
  const slideNo = currentSlideNo.value
  const path = popoverImagePath.value
  const layoutEl = currentLayoutEl()
  const img = path ? findPastedImageEl(path) : null
  if (!path || !layoutEl || !img)
    return

  // Fresh from the server, like paste's content read: the info ref may not
  // have loaded yet, and a hand edit may have changed the geometry since.
  const frontmatter = (await fetchSlide(slideNo)).frontmatter ?? {}
  const content = parseSlideGeometry(frontmatter).content ?? { ...editor.positions.content }
  const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1
  const result = preset === 'below'
    ? computeBelowPreset(content, { w: layoutEl.offsetWidth, h: layoutEl.offsetHeight }, ratio, contentTextHeight(layoutEl, img), CONTENT_DEFAULT_WIDTH)
    : computeRightPreset(content, ratio)

  const images = Array.from(layoutEl.querySelectorAll<HTMLImageElement>('.content-inner img'))
  const srcs = images.map(authoredSrc)
  const imageRef = imageRefFor(srcs, images.indexOf(img))
  if (imageRef.kind !== 'src')
    return
  const geometry = withPositionedImage(frontmatter.geometry, result.content, imageRef, result.image, srcs)
  const info = await update({ frontmatter: { geometry } })
  if (!info)
    return
  publishSlideInfo(slideNo, info)
  // The image moves once the layout applies the new geometry.
  await nextTick()
  requestAnimationFrame(anchorPopover)
  publishReparsedSlideInfo(slideNo, info.frontmatterRaw)
}

// Slidev's response to a frontmatter patch still carries the slide's old
// `frontmatterRaw` text, which the side editor's textarea is built from; a
// later textarea save would write that old frontmatter back. The server
// re-reads the file right after writing it, so wait (bounded) for the fresh
// text and publish the slide again.
async function publishReparsedSlideInfo(slideNo: number, staleRaw: string | undefined) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100))
    const info = await fetchSlide(slideNo)
    if (info.frontmatterRaw !== staleRaw) {
      publishSlideInfo(slideNo, info)
      return
    }
  }
}

function dismissPopover() {
  popoverVisible.value = false
  popoverImagePath.value = null
}

watch(currentSlideNo, dismissPopover)

// Waits (bounded) for the Content tab's textarea to mount after opening the
// SideEditor / switching tabs -- mirrors offerPresets's bounded-poll
// pattern above, since both wait on a render cycle triggered just before.
function waitForContentTextarea(): Promise<HTMLTextAreaElement | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + 2000
    function check() {
      const el = document.querySelector<HTMLTextAreaElement>('[data-editor="content"] textarea')
      if (el) {
        resolve(el)
        return
      }
      if (Date.now() < deadline)
        setTimeout(check, 30)
      else resolve(null)
    }
    check()
  })
}

// Double-click-to-edit only exists during rehearsal/prep on the dev server --
// showEditor/SideEditor and the /__slidev/* APIs this relies on have no
// equivalent in an exported/presented build, so gating on import.meta.env.DEV
// mirrors that reachability rather than adding a separate mode check.
async function onDblClick(e: MouseEvent) {
  if (!import.meta.env.DEV)
    return
  if (editor.editing.value)
    return // Layout tab already repurposes clicks/drags
  const target = e.target as Element | null
  if (!target)
    return
  const container = document.querySelector('.content-inner')
  if (!container || !container.contains(target))
    return

  showEditor.value = true
  editor.activeTab.value = 'content'

  const textarea = await waitForContentTextarea()
  if (!textarea)
    return

  // Read fresh from the server rather than trusting useDynamicSlideInfo's
  // reactive `info` (same rationale as onPaste above): it may not have
  // resolved yet, or may be stale relative to unsaved textarea edits.
  const source = ((await fetchSlide(currentSlideNo.value)).source?.contentRaw ?? '').trim()
  // The textarea's value is `frontmatterPart + source` (see SideEditor.vue).
  // If it doesn't end with `source` -- e.g. there are unsaved in-flight
  // edits -- there's no confident way to locate the body's offset within it,
  // so leave the existing selection alone rather than guessing wrong.
  if (!source || !textarea.value.endsWith(source))
    return

  const range = resolveBlockRange(container, target, source)
  if (!range)
    return

  const bodyStart = textarea.value.length - source.length
  textarea.focus()
  textarea.setSelectionRange(bodyStart + range.start, bodyStart + range.end)
}

// Slide callouts (composables/useSlideCallouts.ts) are resolved and rendered by
// `layouts/default.vue`, so a `callouts` list on any other layout silently does
// nothing. The warning has to live here, globally: the layout that would report
// it is precisely the one that never mounts for those slides.
function warnAboutNonDefaultLayoutCallouts() {
  for (const slide of slides.value) {
    const frontmatter = slide.meta.slide?.frontmatter as Record<string, unknown> | undefined
    if (frontmatter?.callouts == null)
      continue
    const layout = (frontmatter.layout as string | undefined) ?? 'default'
    if (layout !== 'default')
      console.warn(`[codeurjc-slidev-theme] slide ${slide.no}: callouts are only supported on the default layout (this slide uses "${layout}"), so they are ignored`)
  }
}

onMounted(() => {
  warnAboutNonDefaultLayoutCallouts()
  window.addEventListener('paste', onPaste)
  window.addEventListener('dblclick', onDblClick)
})
onUnmounted(() => {
  window.removeEventListener('paste', onPaste)
  window.removeEventListener('dblclick', onDblClick)
})
</script>

<template>
  <div
    v-if="popoverVisible"
    class="image-position-popover"
    :style="popoverStyle"
  >
    <button type="button" title="Below" @click="choosePreset('below')">
      ↓ Below
    </button>
    <button type="button" title="Right" @click="choosePreset('right')">
      → Right
    </button>
    <button type="button" class="dismiss" title="Dismiss" @click="dismissPopover">
      ✕
    </button>
  </div>
</template>

<style scoped>
.image-position-popover {
  position: absolute;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 4px;
  background: white;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  font-size: 12px;
  font-family: system-ui, sans-serif;
}

.image-position-popover button {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  color: #111;
}

.image-position-popover button:hover {
  background: #f3f3f3;
}

.image-position-popover .dismiss {
  padding: 4px 6px;
  color: #888;
}
</style>
