<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { showEditor } from '@slidev/client/state/storage.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import { useDynamicSlideInfo } from '@slidev/client/composables/useSlideInfo.ts'
import { findPastedImage, buildImageMarkdown, uploadImage, insertAtCursor, appendImageMarkdown } from './composables/useImagePaste'

const { currentSlideNo } = useNav()
const { update } = useDynamicSlideInfo(currentSlideNo)

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
}

onMounted(() => window.addEventListener('paste', onPaste))
onUnmounted(() => window.removeEventListener('paste', onPaste))
</script>

<template>
  <div />
</template>
