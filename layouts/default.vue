<script setup lang="ts">
import { useEditor } from '../composables/useEditor'
import { ref, onMounted, watch } from 'vue'

const VAR_MAP: Record<string, Record<string, string>> = {
  'red-bar': { y: '--ed-red-y', x: '--ed-red-x', w: '--ed-red-w', h: '--ed-red-h' },
  logo: { y: '--ed-logo-y', x: '--ed-logo-rx', w: '--ed-logo-w', h: '--ed-logo-h' },
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
  const lockedStr = el.getAttribute('data-aspect-locked') || ''

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

  // Restore aspect-lock state. data-aspect-locked lists the *locked*
  // elements (unlocked is the default), so anything not listed stays unlocked.
  const lockedNames = lockedStr ? lockedStr.split(',') : []
  const al: Record<string, boolean> = {}
  for (const key of Object.keys(editor.positions)) {
    al[key] = lockedNames.includes(key)
  }
  editor.setAspectLocked(al)
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
      style="--ed-red-y: 0px; --ed-red-x: 0px; --ed-red-w: 980px; --ed-red-h: 10px; --ed-logo-y: 20px; --ed-logo-rx: 24px; --ed-logo-w: 80px; --ed-logo-h: 48px; --ed-title-y: 20px; --ed-title-x: 24px; --ed-title-w: 400px; --ed-title-h: 48px; --ed-content-y: 82px; --ed-content-x: 23px; --ed-content-w: 876px; --ed-content-h: 400px"
      data-styles="--ed-red-y: 0px; --ed-red-x: 0px; --ed-red-w: 980px; --ed-red-h: 10px; --ed-logo-y: 20px; --ed-logo-rx: 24px; --ed-logo-w: 80px; --ed-logo-h: 48px; --ed-title-y: 20px; --ed-title-x: 24px; --ed-title-w: 400px; --ed-title-h: 48px; --ed-content-y: 82px; --ed-content-x: 23px; --ed-content-w: 876px; --ed-content-h: 400px"
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
