<script setup lang="ts">
import { useEditor } from '../composables/useEditor'
import { ref, onMounted, watch } from 'vue'

const VAR_MAP: Record<string, Record<string, string>> = {
  'red-bar': { h: '--ed-red-h' },
  logo: { y: '--ed-logo-y', x: '--ed-logo-rx' },
  title: { y: '--ed-title-y', x: '--ed-title-x', w: '--ed-title-w', h: '--ed-title-h' },
  content: { y: '--ed-content-y', x: '--ed-content-x', w: '--ed-content-w', h: '--ed-content-h' },
}

const editor = useEditor()
const rootEl = ref<HTMLElement | null>(null)

onMounted(() => {
  const el = rootEl.value
  if (!el) return
  // Use data-styles (never overridden by :style) so saved positions survive editor re-open
  const style = el.getAttribute('data-styles') || el.getAttribute('style') || ''
  const hiddenStr = el.getAttribute('data-hidden') || ''

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
    const h: Record<string, boolean> = {}
    for (const key of Object.keys(editor.positions)) {
      h[key] = hiddenStr.split(',').includes(key)
    }
    editor.setHidden(h)
  }
})

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
</script>

<template>
    <div
      ref="rootEl"
      class="slidev-layout default relative h-full w-full bg-white text-black"
      :class="{ editing: editor.editing.value }"
      style="--ed-title-y: 20px; --ed-title-x: 24px; --ed-title-w: 400px; --ed-title-h: 36px; --ed-title-d: block; --ed-content-y: 80px; --ed-content-x: 24px; --ed-content-w: 700px; --ed-content-h: 400px; --ed-logo-y: 20px; --ed-logo-rx: 24px; --ed-red-h: 10px;"
      data-styles="--ed-title-y: 20px; --ed-title-x: 24px; --ed-title-w: 400px; --ed-title-h: 36px; --ed-title-d: block; --ed-content-y: 80px; --ed-content-x: 24px; --ed-content-w: 700px; --ed-content-h: 400px; --ed-logo-y: 20px; --ed-logo-rx: 24px; --ed-red-h: 10px;"
      :style="editor.editing.value ? editor.rootStyle.value : {}"
    >
    <div
      v-if="!editor.hidden['red-bar']"
      class="red-bar"
      :class="{ 'el-active': editor.editing.value && editor.selected.value === 'red-bar' }"
      @mousedown.stop="editor.startDrag($event, 'red-bar')"
    >
      <div
        v-if="editor.editing.value && editor.selected.value === 'red-bar'"
        class="resize-handle b"
        @mousedown.stop="editor.startResize($event, 'red-bar')"
      />
      <div
        v-if="editor.editing.value && editor.selected.value === 'red-bar'"
        class="delete-btn"
        @mousedown.stop="editor.removeElement('red-bar')"
      >✕</div>
    </div>

    <div
      v-if="!editor.hidden['logo']"
      class="logo"
      :class="{ 'el-active': editor.editing.value && editor.selected.value === 'logo' }"
      @mousedown.stop="editor.startDrag($event, 'logo')"
    >
      <img src="/images/logo.png" alt="Logo">
      <div
        v-if="editor.editing.value && editor.selected.value === 'logo'"
        class="resize-handle se"
        @mousedown.stop="editor.startResize($event, 'logo')"
      />
      <div
        v-if="editor.editing.value && editor.selected.value === 'logo'"
        class="delete-btn"
        @mousedown.stop="editor.removeElement('logo')"
      >✕</div>
    </div>

    <div
      class="content"
      :class="{ 'el-active': editor.editing.value && editor.selected.value === 'content' }"
    >
      <slot />
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

    <div v-if="editor.editing.value && Object.values(editor.hidden).some(v => v)" class="restore-bar">
      <span class="restore-label">Deleted:</span>
      <template v-for="[name, isHidden] of Object.entries(editor.hidden)" :key="name">
        <button v-if="isHidden" class="restore-btn" @mousedown.stop="editor.removeElement(name)">{{ { 'red-bar': 'Red Bar', logo: 'Logo', title: 'Title', content: 'Content' }[name] || name }}</button>
      </template>
    </div>
  </div>
</template>

<style>
.slidev-layout.default h1:first-child {
  display: var(--ed-title-d, block);
  position: absolute;
  top: var(--ed-title-y, 20px);
  left: var(--ed-title-x, 24px);
  width: var(--ed-title-w, auto);
  min-height: var(--ed-title-h, auto);
  margin: 0;
  overflow-wrap: break-word;
  font-weight: 700;
  color: #cb0017;
  font-size: 1.5rem;
  line-height: 1.2;
}

.slidev-layout.default h1:first-child + p {
  margin-top: 0;
  opacity: 1;
}

.title-overlay {
  position: absolute;
  width: var(--ed-title-w, 400px);
  height: var(--ed-title-h, 36px);
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

.content {
  margin-top: var(--ed-content-y, 80px);
  margin-left: var(--ed-content-x, 24px);
  width: var(--ed-content-w, 700px);
  min-height: var(--ed-content-h, 200px);
  padding: 0 24px 24px;
  overflow-wrap: break-word;
}

.content-overlay {
  position: absolute;
  top: var(--ed-content-y, 80px);
  left: var(--ed-content-x, 24px);
  width: var(--ed-content-w, 700px);
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
  top: 0;
  left: 0;
  width: 100%;
  height: var(--ed-red-h, 10px);
  background-color: #cb0017;
  z-index: 100;
}

.logo {
  position: absolute;
  top: var(--ed-logo-y, 20px);
  right: var(--ed-logo-rx, 24px);
  z-index: 50;
}

.logo img {
  height: 48px;
  width: auto;
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

.resize-handle.b {
  bottom: -6px;
  left: 50%;
  margin-left: -6px;
  cursor: ns-resize;
}

.restore-bar {
  position: absolute;
  bottom: 8px;
  left: 8px;
  display: flex;
  gap: 4px;
  align-items: center;
  background: rgba(0, 0, 0, 0.7);
  padding: 4px 8px;
  border-radius: 4px;
  z-index: 200;
  pointer-events: auto;
}

.restore-label {
  font-size: 10px;
  color: #ccc;
  font-weight: 600;
  margin-right: 4px;
}

.restore-btn {
  font-size: 10px;
  padding: 2px 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
  color: #f59e0b;
  cursor: pointer;
  pointer-events: auto;
}

.restore-btn:hover {
  background: rgba(255, 255, 255, 0.2);
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
