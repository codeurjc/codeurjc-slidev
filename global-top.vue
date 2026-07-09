<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { showEditor } from '@slidev/client/state/storage.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import { useDynamicSlideInfo } from '@slidev/client/composables/useSlideInfo.ts'
import { useEditor, CONTENT_DEFAULT_WIDTH } from './composables/useEditor'
import { computeBelowPreset, computeRightPreset } from './composables/useImagePosition'
import { findPastedImage, buildImageMarkdown, uploadImage, insertAtCursor, appendImageMarkdown } from './composables/useImagePaste'
import { resolveBlockRange } from './composables/useTextClickToEdit'

const { currentSlideNo } = useNav()
const { update } = useDynamicSlideInfo(currentSlideNo)
const editor = useEditor()

const popoverVisible = ref(false)
const popoverStyle = ref<Record<string, string>>({})

async function onPaste(e: ClipboardEvent) {
  const file = findPastedImage(e.clipboardData)
  if (!file) return
  e.preventDefault()

  const { path } = await uploadImage(file)
  const markdown = buildImageMarkdown(path)

  if (showEditor.value) {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-editor="content"] textarea')
    if (textarea) {
      insertAtCursor(textarea, markdown)
      waitForTrackedImage(path)
      return
    }
  }

  // Read the slide's current content fresh from the server rather than
  // relying on useDynamicSlideInfo's reactive `info` ref: that ref is
  // populated by its own async fetch on mount, which may not have resolved
  // yet if the user pastes shortly after page load, silently wiping the
  // slide's content instead of appending to it.
  const currentInfo: { source?: { contentRaw?: string } } = await fetch(`/__slidev/slides/${currentSlideNo.value}.json`).then(r => r.json())
  const contentRaw = currentInfo.source?.contentRaw ?? ''
  await update({ content: appendImageMarkdown(contentRaw, markdown) })
  waitForTrackedImage(path)
}

// Waits for the slide to re-render with the newly-pasted image (identified
// by its upload path, not just any .tracked-image, since a second paste on
// the same slide could otherwise anchor to a stale previously-tracked one)
// before showing the position popover. Bounded: if it never appears in
// time, the popover is silently skipped -- the image still renders inline
// in normal flow either way.
function waitForTrackedImage(path: string) {
  // Compare by filename rather than exact src equality: the /images/ dev-time
  // resolve.alias (see vite.config.ts) rewrites the rendered <img>'s actual
  // src to an absolute /@fs/... filesystem path, not the original upload path.
  const filename = path.split('/').pop()
  const deadline = Date.now() + 5000
  function check() {
    const img = document.querySelector<HTMLImageElement>('.tracked-image')
    if (img && filename && img.getAttribute('src')?.endsWith(filename)) {
      showPopover(img)
      return
    }
    if (Date.now() < deadline) {
      setTimeout(check, 50)
    }
  }
  check()
}

function showPopover(img: HTMLImageElement) {
  const rect = img.getBoundingClientRect()
  popoverStyle.value = { top: `${rect.bottom + 8}px`, left: `${rect.left}px` }
  popoverVisible.value = true
}

function imageAspectRatio(): number {
  const img = document.querySelector<HTMLImageElement>('.tracked-image')
  if (img && img.naturalWidth && img.naturalHeight) return img.naturalWidth / img.naturalHeight
  return 1
}

function slideWidth(): number {
  return document.querySelector('.slidev-layout.default')?.getBoundingClientRect().width || 980
}

async function choosePreset(preset: 'below' | 'right') {
  const content = editor.positions.content
  const ratio = imageAspectRatio()
  const result = preset === 'below'
    ? computeBelowPreset(content, slideWidth(), ratio, CONTENT_DEFAULT_WIDTH)
    : computeRightPreset(content, ratio)

  Object.assign(editor.positions.content, result.content)
  Object.assign(editor.positions.image, result.image)
  editor.hidden.image = false

  await saveAsPerSlideLayoutFork()
  popoverVisible.value = false
}

async function saveAsPerSlideLayoutFork() {
  const slideNo = currentSlideNo.value
  const currentInfo: { frontmatter?: { layout?: string } } = await fetch(`/__slidev/slides/${slideNo}.json`).then(r => r.json())
  const currentLayout = currentInfo.frontmatter?.layout || 'default'
  // A previous preset choice on this slide forks it onto its own
  // `layout-<timestamp>` file (see /api/save-layout's naming). Reading this
  // from the persisted frontmatter, rather than tracking it in memory,
  // survives the page reload below (which wipes any in-memory state) --
  // any slide already on one of our auto-generated fork names is safe to
  // update in place rather than forking again.
  const alreadyForked = currentLayout.startsWith('layout-')

  const resp = await fetch('/api/save-layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      positions: { ...editor.positions },
      hidden: { ...editor.hidden },
      aspectLocked: { ...editor.aspectLocked },
      saveAs: !alreadyForked,
      currentLayout,
    }),
  })
  if (!resp.ok) return
  const result: { layoutName?: string } = await resp.json()
  if (!result.layoutName) return

  if (result.layoutName !== currentLayout) {
    // Mirrors SideEditor.vue's onSaveLayout: skipHmr avoids a premature
    // auto-reload racing with our own reload below, and the wait gives
    // Slidev's layouts virtual module time to pick up the newly-forked file
    // via its own fs watcher before the reload's fresh slide-info fetch
    // tries to resolve it -- without this, that fetch can hit "Unknown
    // layout" since the layouts list is otherwise cached until invalidated.
    await update({ frontmatter: { layout: result.layoutName }, skipHmr: true })
    await new Promise(r => setTimeout(r, 200))
    window.location.reload()
  }
}

function dismissPopover() {
  popoverVisible.value = false
}

// Waits (bounded) for the Content tab's textarea to mount after opening the
// SideEditor / switching tabs -- mirrors waitForTrackedImage's bounded-poll
// pattern above, since both wait on a render cycle triggered just before.
function waitForContentTextarea(): Promise<HTMLTextAreaElement | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + 2000
    function check() {
      const el = document.querySelector<HTMLTextAreaElement>('[data-editor="content"] textarea')
      if (el) { resolve(el); return }
      if (Date.now() < deadline) setTimeout(check, 30)
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
  if (!import.meta.env.DEV) return
  if (editor.editing.value) return // Layout tab already repurposes clicks/drags
  const target = e.target as Element | null
  if (!target) return
  const container = document.querySelector('.content-inner')
  if (!container || !container.contains(target)) return

  showEditor.value = true
  editor.activeTab.value = 'content'

  const textarea = await waitForContentTextarea()
  if (!textarea) return

  // Read fresh from the server rather than trusting useDynamicSlideInfo's
  // reactive `info` (same rationale as onPaste above): it may not have
  // resolved yet, or may be stale relative to unsaved textarea edits.
  const currentInfo: { source?: { contentRaw?: string } } = await fetch(`/__slidev/slides/${currentSlideNo.value}.json`).then(r => r.json())
  const source = (currentInfo.source?.contentRaw ?? '').trim()
  // The textarea's value is `frontmatterPart + source` (see SideEditor.vue).
  // If it doesn't end with `source` -- e.g. there are unsaved in-flight
  // edits -- there's no confident way to locate the body's offset within it,
  // so leave the existing selection alone rather than guessing wrong.
  if (!source || !textarea.value.endsWith(source)) return

  const range = resolveBlockRange(container, target, source)
  if (!range) return

  const bodyStart = textarea.value.length - source.length
  textarea.focus()
  textarea.setSelectionRange(bodyStart + range.start, bodyStart + range.end)
}

onMounted(() => {
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
    <button type="button" title="Below" @click="choosePreset('below')">↓ Below</button>
    <button type="button" title="Right" @click="choosePreset('right')">→ Right</button>
    <button type="button" class="dismiss" title="Dismiss" @click="dismissPopover">✕</button>
  </div>
</template>

<style scoped>
.image-position-popover {
  position: fixed;
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
