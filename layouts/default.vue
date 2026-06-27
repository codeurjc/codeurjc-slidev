<script setup lang="ts">
import { ref } from 'vue'
import { useEditor } from '../composables/useEditor'

const editor = useEditor()
const copied = ref(false)

async function copyCss() {
  const css = editor.exportCss()
  try {
    await navigator.clipboard.writeText(css)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // fallback: select and copy from a textarea
    const ta = document.createElement('textarea')
    ta.value = css
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}
</script>

<template>
  <div
    class="slidev-layout default relative h-full bg-white text-black"
    :class="{ editing: editor.editing.value }"
    :style="editor.editing.value ? editor.rootStyle.value : {}"
  >
    <div
      class="red-bar"
      :class="{ 'el-active': editor.editing.value && editor.selected.value === 'red-bar' }"
      @mousedown.stop="editor.startDrag($event, 'red-bar')"
    >
      <div
        v-if="editor.editing.value && editor.selected.value === 'red-bar'"
        class="resize-handle b"
        @mousedown.stop="editor.startResize($event, 'red-bar')"
      />
    </div>

    <div
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
    </div>

    <div
      class="content"
      :class="{ 'el-active': editor.editing.value && editor.selected.value === 'content' }"
      @mousedown.stop="editor.startDrag($event, 'content')"
    >
      <slot />
      <div
        v-if="editor.editing.value && editor.selected.value === 'content'"
        class="resize-handle se"
        @mousedown.stop="editor.startResize($event, 'content')"
      />
    </div>

    <div
      v-if="editor.editing.value"
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
    </div>

    <div v-if="!editor.editing.value" class="edit-btn" @click="editor.toggle()">
      ✎ Edit
    </div>

    <div v-if="editor.editing.value" class="editor-panel">
      <div class="ep-header">
        <strong>Layout Editor</strong>
        <button class="ep-close" @click="editor.toggle()">✕</button>
      </div>

      <div class="ep-elements">
        <button
          v-for="name in editor.elementNames.value"
          :key="name"
          class="ep-el"
          :class="{ active: editor.selected.value === name }"
          @click="editor.selected.value = name"
        >
          <span class="ep-dot" :style="{ background: { 'red-bar': '#cb0017', logo: '#e8792b', title: '#2563eb', content: '#16a34a' }[name] }" />
          {{ { 'red-bar': 'Red Bar', logo: 'Logo', title: 'Title', content: 'Content' }[name] }}
        </button>
      </div>

      <div v-if="editor.selected.value" class="ep-props">
        <label>X: <input v-model.number="editor.positions[editor.selected.value].x" type="number" class="ep-input"></label>
        <label>Y: <input v-model.number="editor.positions[editor.selected.value].y" type="number" class="ep-input"></label>
        <label>W: <input v-model.number="editor.positions[editor.selected.value].w" type="number" class="ep-input"></label>
        <label>H: <input v-model.number="editor.positions[editor.selected.value].h" type="number" class="ep-input"></label>
      </div>

      <button class="ep-export" @click="copyCss">
        {{ copied ? 'Copied!' : 'Copy CSS' }}
      </button>
    </div>
  </div>
</template>

<style>
.slidev-layout.default h1:first-child {
  position: absolute;
  top: var(--ed-title-y, 20px);
  left: var(--ed-title-x, 24px);
  margin: 0;
  font-weight: 700;
  color: #cb0017;
  font-size: 1.5rem;
  line-height: 1.2;
}

.slidev-layout.default h1:first-child + p {
  margin-top: 0;
  opacity: 1;
}
</style>

<style scoped>
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

.content {
  padding-top: var(--ed-content-py, 80px);
  padding-right: var(--ed-content-pr, 120px);
  min-height: 200px;
}

.editing .red-bar,
.editing .logo,
.editing .content {
  cursor: move;
  outline: 2px dashed transparent;
  transition: outline-color 0.15s;
}

.editing .red-bar { outline-color: #cb0017; }
.editing .logo { outline-color: #e8792b; }
.editing .content { outline-color: #16a34a; }

.editing .red-bar.el-active,
.editing .logo.el-active,
.editing .content.el-active {
  outline-style: solid;
}

.title-overlay {
  position: absolute;
  width: 400px;
  height: 36px;
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

.el-tag {
  font-size: 10px;
  font-weight: 600;
  color: #2563eb;
  background: rgba(37, 99, 235, 0.1);
  padding: 0 4px;
  border-radius: 2px;
  margin-left: 2px;
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

.edit-btn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 200;
  background: #333;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.edit-btn:hover { opacity: 1; }

.editor-panel {
  position: fixed;
  top: 70px;
  right: 12px;
  z-index: 200;
  width: 220px;
  background: #1a1a2e;
  color: #e0e0e0;
  border-radius: 8px;
  font-size: 12px;
  font-family: system-ui, sans-serif;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  overflow: hidden;
}

.ep-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #16213e;
  font-size: 13px;
}

.ep-close {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
}

.ep-close:hover { color: white; }

.ep-elements {
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ep-el {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: none;
  background: transparent;
  color: #ccc;
  cursor: pointer;
  border-radius: 4px;
  text-align: left;
  font-size: 12px;
}

.ep-el:hover { background: rgba(255,255,255,0.08); }

.ep-el.active {
  background: rgba(255,255,255,0.12);
  color: white;
}

.ep-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ep-props {
  padding: 8px 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 8px;
}

.ep-props label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #aaa;
}

.ep-input {
  width: 100%;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  color: white;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 11px;
  font-family: monospace;
}

.ep-export {
  width: 100%;
  padding: 8px;
  border: none;
  background: #2563eb;
  color: white;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.ep-export:hover { background: #1d4ed8; }
</style>
