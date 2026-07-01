<script setup lang="ts">
import { throttledWatch, useEventListener } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useNav } from '../composables/useNav'
import { useDynamicSlideInfo } from '../composables/useSlideInfo'
import { parseSideEditorContent } from '../logic/sideEditor'
import { activeElement, editorHeight, editorWidth, isInputting, showEditor, isEditorVertical as vertical } from '../state'
import IconButton from './IconButton.vue'
import ShikiEditor from './ShikiEditor.vue'
import { useEditor } from '__USE_EDITOR_PATH__'

const props = defineProps<{
  resize?: boolean
}>()

const { currentSlideNo, openInEditor } = useNav()

const tab = ref<'content' | 'note' | 'layout'>('content')
const content = ref('')
const note = ref('')
const dirty = ref(false)

const { info, update } = useDynamicSlideInfo(currentSlideNo)

const editor = useEditor()

watch(
  info,
  (v) => {
    if (!isInputting.value) {
      note.value = (v?.note || '').trim()
      const frontmatterPart = v?.frontmatterRaw?.trim() ? `---\n${v.frontmatterRaw.trim()}\n---\n\n` : ''
      content.value = frontmatterPart + (v?.source.contentRaw || '').trim()
      dirty.value = false
    }
  },
  { immediate: true },
)

watch(tab, (t) => {
  editor.editing.value = t === 'layout'
  if (t !== 'layout') editor.selected.value = null
})

watch(showEditor, (v) => {
  if (!v) {
    editor.editing.value = false
    editor.selected.value = null
  }
})

async function save() {
  dirty.value = false
  const { content: contentOnly, frontmatterRaw } = parseSideEditorContent(content.value)
  await update({
    note: note.value || undefined,
    content: contentOnly,
    frontmatterRaw,
  })
}

async function onSaveLayout() {
  // Read hidden state from data-hidden attribute on the slide element
  const layoutEl = document.querySelector('.slidev-layout.default')
  const hiddenStr = layoutEl?.getAttribute('data-hidden') || ''
  const hiddenList = hiddenStr ? hiddenStr.split(',') : []
  const hidden = Object.fromEntries(
    Object.keys(editor.positions).map(k => [k, hiddenList.includes(k)])
  )

  const currentLayout = info.value?.frontmatter?.layout || 'default'

  editor.saving.value = true
  editor.saved.value = false
  try {
    const resp = await fetch('/api/save-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positions: { ...editor.positions },
        hidden,
        saveAs: editor.saveAs.value,
        layoutName: editor.saveLayoutName.value,
        currentLayout,
      }),
    })
    if (resp.ok) {
      const result = await resp.json()
      editor.saveLayoutName.value = result?.layoutName || ''
      if (editor.saveAs.value && result?.layoutName && result.layoutName !== currentLayout) {
        await update({ frontmatter: { layout: result.layoutName }, skipHmr: true })
        // Wait for chokidar to process slides.md changes before reloading
        await new Promise(r => setTimeout(r, 200))
        window.location.reload()
      }
    }
  } finally {
    editor.saving.value = false
    editor.saved.value = true
    setTimeout(() => { editor.saved.value = false }, 2000)
  }
}

function close() {
  showEditor.value = false
}

useEventListener('keydown', (e) => {
  if (activeElement.value?.tagName === 'TEXTAREA' && e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
    save()
    e.preventDefault()
  }
})

const contentRef = computed({
  get() { return content.value },
  set(v) {
    if (content.value.trim() !== v.trim())
      dirty.value = true
    content.value = v
  },
})

const noteRef = computed({
  get() { return note.value },
  set(v) {
    note.value = v
    dirty.value = true
  },
})

const handlerDown = ref(false)
function onHandlerDown() {
  handlerDown.value = true
}
function updateSize(v?: number) {
  if (vertical.value)
    editorHeight.value = Math.min(Math.max(300, v ?? editorHeight.value), window.innerHeight - 200)
  else
    editorWidth.value = Math.min(Math.max(318, v ?? editorWidth.value), window.innerWidth - 200)
}
function switchTab(newTab: typeof tab.value) {
  tab.value = newTab
  document.activeElement?.blur?.()
}

if (props.resize) {
  useEventListener('pointermove', (e) => {
    if (handlerDown.value) {
      updateSize(vertical.value
        ? window.innerHeight - e.pageY
        : window.innerWidth - e.pageX)
    }
  }, { passive: true })
  useEventListener('pointerup', () => {
    handlerDown.value = false
  })
  useEventListener('resize', () => {
    updateSize()
  })
}

throttledWatch(
  [content, note],
  () => {
    if (dirty.value)
      save()
  },
  { throttle: 500 },
)
</script>

<template>
  <div
    v-if="resize" class="fixed bg-gray-400 select-none opacity-0 hover:opacity-10 z-dragging"
    :class="vertical ? 'left-0 right-0 w-full h-10px' : 'top-0 bottom-0 w-10px h-full'" :style="{
      opacity: handlerDown ? '0.3' : undefined,
      bottom: vertical ? `${editorHeight - 5}px` : undefined,
      right: !vertical ? `${editorWidth - 5}px` : undefined,
      cursor: vertical ? 'row-resize' : 'col-resize',
    }" @pointerdown="onHandlerDown"
  />
  <div
    class="shadow bg-main p-2 pt-4 grid grid-rows-[max-content_1fr] h-full overflow-hidden"
    :class="resize ? 'border-l border-gray-400 border-opacity-20' : ''"
    :style="resize ? {
      height: vertical ? `${editorHeight}px` : undefined,
      width: !vertical ? `${editorWidth}px` : undefined,
    } : {}"
  >
    <div class="flex pb-2 text-xl -mt-1">
      <div class="mr-4 rounded flex">
        <IconButton
          title="Switch to content tab" :class="tab === 'content' ? 'text-primary' : ''"
          @click="switchTab('content')"
        >
          <div class="i-carbon:account" />
        </IconButton>
        <IconButton
          title="Switch to notes tab" :class="tab === 'note' ? 'text-primary' : ''"
          @click="switchTab('note')"
        >
          <div class="i-carbon:align-box-bottom-right" />
        </IconButton>
        <IconButton
          title="Switch to layout tab" :class="tab === 'layout' ? 'text-primary' : ''"
          @click="switchTab('layout')"
        >
          <div class="i-carbon:fit-to-screen" />
        </IconButton>
      </div>
      <span class="text-2xl pt-1">
        {{ tab === 'content' ? 'Slide' : tab === 'note' ? 'Notes' : 'Layout' }}
      </span>
      <div class="flex-auto" />
      <template v-if="resize">
        <IconButton v-if="vertical" title="Dock to right" @click="vertical = false">
          <div class="i-carbon:open-panel-right" />
        </IconButton>
        <IconButton v-else title="Dock to bottom" @click="vertical = true">
          <div class="i-carbon:open-panel-bottom" />
        </IconButton>
      </template>
      <IconButton title="Open in editor" @click="openInEditor()">
        <div class="i-carbon:launch" />
      </IconButton>
      <IconButton title="Close" @click="close">
        <div class="i-carbon:close" />
      </IconButton>
    </div>
    <div class="relative overflow-hidden rounded" style="background-color: var(--slidev-code-background)">
      <ShikiEditor v-show="tab === 'content'" v-model="contentRef" placeholder="Create slide content..." />
      <ShikiEditor v-show="tab === 'note'" v-model="noteRef" placeholder="Write some notes..." />
      <div v-show="tab === 'layout'" class="layout-editor-panel">
        <div class="lep-section-label">Elements</div>
        <div class="lep-elements">
          <button
            v-for="name in editor.elementNames.value"
            :key="name"
            class="lep-el"
            :class="{ active: editor.selected.value === name }"
            @click="editor.selected.value = name"
          >
            <span class="lep-dot" :style="{ background: { 'red-bar': '#cb0017', logo: '#e8792b', title: '#2563eb', content: '#16a34a' }[name] }" />
            {{ { 'red-bar': 'Red Bar', logo: 'Logo', title: 'Title', content: 'Content' }[name] }}
          </button>
        </div>
        <div v-if="editor.selected.value" class="lep-props-section">
          <div class="lep-section-label">Properties</div>
          <div class="lep-props">
            <label>X: <input v-model.number="editor.positions[editor.selected.value].x" type="number" class="lep-input"></label>
            <label>Y: <input v-model.number="editor.positions[editor.selected.value].y" type="number" class="lep-input"></label>
            <label>W: <input v-model.number="editor.positions[editor.selected.value].w" type="number" class="lep-input"></label>
            <label>H: <input v-model.number="editor.positions[editor.selected.value].h" type="number" class="lep-input"></label>
          </div>
        </div>
        <div class="lep-save-section">
          <label class="lep-checkbox">
            <input type="checkbox" v-model="editor.saveAs.value">
            <span>Save as new layout</span>
          </label>
          <div v-if="editor.saveAs.value" class="lep-name-row">
            <input v-model="editor.saveLayoutName.value" placeholder="layout-timestamp" class="lep-input">
          </div>
          <div v-else class="lep-warning">
            ⚠ This will overwrite the current layout. Other slides using it may change.
          </div>
        </div>
        <div class="lep-actions">
          <button
            class="lep-btn"
            :class="{ disabled: !editor.canUndo.value }"
            :disabled="!editor.canUndo.value"
            @click="editor.undo()"
          >Undo</button>
          <button
            class="lep-btn"
            :class="{ disabled: !editor.dirty.value }"
            :disabled="!editor.dirty.value"
            @click="editor.resetLayout()"
          >Reset</button>
          <button class="lep-btn lep-btn-primary" @click="onSaveLayout()">
            {{ editor.saving.value ? '...' : editor.saved.value ? 'Done' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout-editor-panel {
  padding: 8px;
  font-size: 12px;
  font-family: system-ui, sans-serif;
  color: var(--slidev-code-foreground, #ccc);
  height: 100%;
  overflow-y: auto;
}

.lep-section-label {
  padding: 4px 2px;
  font-size: 10px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.lep-elements {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
}

.lep-el {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 3px;
  text-align: left;
  font-size: 12px;
}

.lep-el:hover {
  background: rgba(128,128,128,0.1);
}

.lep-el.active {
  background: rgba(128,128,128,0.2);
}

.lep-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.lep-props-section {
  margin-bottom: 12px;
}

.lep-props {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 8px;
  padding: 2px;
}

.lep-props label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #999;
}

.lep-input {
  width: 100%;
  background: rgba(128,128,128,0.08);
  border: 1px solid rgba(128,128,128,0.15);
  color: inherit;
  padding: 2px 4px;
  border-radius: 2px;
  font-size: 11px;
  font-family: monospace;
  outline: none;
}

.lep-input:focus {
  border-color: #2563eb;
}

.lep-save-section {
  margin-bottom: 8px;
  padding: 6px 2px;
  border-top: 1px solid rgba(128,128,128,0.15);
  padding-top: 8px;
}

.lep-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #ccc;
  cursor: pointer;
  margin-bottom: 4px;
}

.lep-checkbox input {
  accent-color: #2563eb;
}

.lep-name-row {
  margin-left: 18px;
  margin-top: 4px;
}

.lep-warning {
  margin-left: 18px;
  font-size: 10px;
  color: #f59e0b;
  line-height: 1.4;
}

.lep-actions {
  display: flex;
  gap: 4px;
  padding: 2px;
}

.lep-btn {
  flex: 1;
  padding: 6px 4px;
  border: none;
  border-radius: 3px;
  background: rgba(128,128,128,0.12);
  color: inherit;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
}

.lep-btn:not(.disabled):hover {
  background: rgba(128,128,128,0.2);
}

.lep-btn.disabled {
  opacity: 0.35;
  cursor: default;
}

.lep-btn-primary {
  background: #2563eb;
  color: white;
}

.lep-btn-primary:hover {
  background: #1d4ed8;
}

</style>
