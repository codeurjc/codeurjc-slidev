<script setup lang="ts">
import { watch } from 'vue'
import { useEditor } from '../composables/useEditor'

const editor = useEditor()

watch(() => editor.editing.value, (editing) => {
  const styleId = 'slidev-editor-shift'
  const existing = document.getElementById(styleId)
  if (editing && !existing) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      .slidev-slide-content {
        left: calc((100% - 270px) / 2) !important;
        transition: left 0.2s;
      }
    `
    document.head.appendChild(style)
  } else if (!editing && existing) {
    existing.remove()
  }
})
</script>

<template>
  <div class="slidev-layout default relative h-full w-full bg-white text-black">
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
      :style="editor.editing.value ? editor.rootStyle.value : {}"
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

    <Teleport to="body">
      <div v-if="!editor.editing.value" class="layout-tab" @click="editor.toggle()">
        <span class="layout-tab-label">Layout</span>
      </div>
    </Teleport>

    <Teleport to="body">
      <aside v-if="editor.editing.value" class="editor-panel">
      <div class="ep-header">
        <strong>Layout Editor</strong>
        <button class="ep-close" @click="editor.toggle()">✕</button>
      </div>

      <div class="ep-body">
        <div class="ep-section-label">Elements</div>
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

        <div v-if="editor.selected.value" class="ep-props-section">
          <div class="ep-section-label">Properties</div>
          <div class="ep-props">
            <label>X: <input v-model.number="editor.positions[editor.selected.value].x" type="number" class="ep-input"></label>
            <label>Y: <input v-model.number="editor.positions[editor.selected.value].y" type="number" class="ep-input"></label>
            <label>W: <input v-model.number="editor.positions[editor.selected.value].w" type="number" class="ep-input"></label>
            <label>H: <input v-model.number="editor.positions[editor.selected.value].h" type="number" class="ep-input"></label>
          </div>
        </div>
      </div>

      <button
        class="ep-undo"
        :class="{ disabled: !editor.canUndo() }"
        :disabled="!editor.canUndo()"
        @click="editor.undo()"
      >
        Undo (Ctrl+Z)
      </button>
      <button
        class="ep-reset"
        :class="{ disabled: !editor.dirty.value }"
        :disabled="!editor.dirty.value"
        @click="editor.resetLayout()"
      >
        Reset
      </button>
      <button class="ep-save" @click="editor.saveLayout()">
        {{ editor.saving.value ? 'Saving...' : editor.saved.value ? 'Saved!' : 'Save Layout' }}
      </button>
    </aside>
    </Teleport>
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

.layout-tab {
  position: fixed;
  top: 50%;
  right: 0;
  z-index: 200;
  transform: translateY(-50%);
  background: #1a1a2e;
  color: #aaa;
  border: none;
  border-radius: 6px 0 0 6px;
  padding: 28px 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  writing-mode: vertical-lr;
  text-orientation: mixed;
  transition: background 0.15s, color 0.15s, padding 0.15s;
  user-select: none;
}

.layout-tab:hover {
  background: #2563eb;
  color: white;
  padding-right: 8px;
}

.editor-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 270px;
  height: 100%;
  z-index: 200;
  background: #1a1a2e;
  color: #e0e0e0;
  font-size: 12px;
  font-family: system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ep-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #16213e;
  font-size: 13px;
  flex-shrink: 0;
}

.ep-close {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
  border-radius: 4px;
}

.ep-close:hover {
  color: white;
  background: rgba(255,255,255,0.1);
}

.ep-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.ep-section-label {
  padding: 6px 14px 4px;
  font-size: 10px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ep-elements {
  padding: 2px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ep-el {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: #ccc;
  cursor: pointer;
  border-radius: 4px;
  text-align: left;
  font-size: 12px;
}

.ep-el:hover {
  background: rgba(255,255,255,0.06);
}

.ep-el.active {
  background: rgba(255,255,255,0.1);
  color: white;
}

.ep-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ep-props-section {
  margin-top: 4px;
}

.ep-props {
  padding: 4px 14px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
}

.ep-props label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #999;
}

.ep-input {
  width: 100%;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: white;
  padding: 3px 5px;
  border-radius: 3px;
  font-size: 11px;
  font-family: monospace;
  outline: none;
}

.ep-input:focus {
  border-color: #2563eb;
}

.ep-undo {
  width: 100%;
  padding: 10px;
  border: none;
  border-top: 1px solid rgba(255,255,255,0.08);
  background: #2a2a4e;
  color: #aaa;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}

.ep-undo:not(.disabled):hover {
  background: #3a3a6e;
  color: #e0e0e0;
}

.ep-undo.disabled {
  opacity: 0.3;
  cursor: default;
}

.ep-reset {
  width: 100%;
  padding: 8px;
  border: none;
  background: #3a3a5e;
  color: #aaa;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}

.ep-reset:not(.disabled):hover {
  background: #4a4a7e;
  color: #e0e0e0;
}

.ep-reset.disabled {
  opacity: 0.4;
  cursor: default;
}

.ep-save {
  width: 100%;
  padding: 10px;
  border: none;
  background: #2563eb;
  color: white;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.ep-save:hover {
  background: #1d4ed8;
}
</style>
