import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const ELEMENTS: Record<string, {
  label: string
  color: string
  initial: Rect
  cssOutput: (pos: Rect) => string
  invertX?: boolean
}> = {
  'red-bar': {
    label: 'Red Bar',
    color: '#cb0017',
    initial: { x: 0, y: 0, w: 100, h: 10 },
    cssOutput: (pos) => [
      'position: absolute',
      'top: 0',
      'left: 0',
      'width: 100%',
      `height: ${pos.h}px`,
      'background-color: #cb0017',
      'z-index: 100',
    ].map(l => `  ${l};`).join('\n'),
  },
  logo: {
    label: 'Logo',
    color: '#e8792b',
    initial: { x: 24, y: 20, w: 120, h: 48 },
    invertX: true,
    cssOutput: (pos) => [
      'position: absolute',
      `top: ${pos.y}px`,
      `right: ${pos.x}px`,
      'z-index: 50',
    ].map(l => `  ${l};`).join('\n'),
  },
  title: {
    label: 'Title',
    color: '#2563eb',
    initial: { x: 24, y: 20, w: 400, h: 36 },
    cssOutput: (pos) => [
      'position: absolute',
      `top: ${pos.y}px`,
      `left: ${pos.x}px`,
      'margin: 0',
      `width: ${pos.w}px`,
      'overflow-wrap: break-word',
      'font-weight: 700',
      'color: #cb0017',
      'font-size: 1.5rem',
    ].map(l => `  ${l};`).join('\n'),
  },
  content: {
    label: 'Content',
    color: '#16a34a',
    initial: { x: 24, y: 80, w: 700, h: 400 },
    cssOutput: (pos) => [
      `margin-top: ${pos.y}px`,
      `margin-left: ${pos.x}px`,
      `width: ${pos.w}px`,
      `min-height: ${pos.h}px`,
    ].map(l => `  ${l};`).join('\n'),
  },
}

const _sharedEditing = ref(false)
const _sharedSelected = ref<string | null>(null)
const _sharedHidden = reactive<Record<string, boolean>>({})
const _sharedPositions = reactive<Record<string, Rect>>({})
for (const key of Object.keys(ELEMENTS)) {
  _sharedPositions[key] = { ...ELEMENTS[key].initial }
  _sharedHidden[key] = false
}
const _sharedUndoStack = ref<Record<string, Rect>[]>([])
const _sharedUndoCheckpoint = ref<Record<string, Rect> | null>(null)

export function useEditor() {
  const editing = _sharedEditing
  const selected = _sharedSelected
  const positions = _sharedPositions
  const hidden = _sharedHidden

  const dragState = ref<{
    el: string
    startX: number
    startY: number
    origX: number
    origY: number
    scale: number
    invertX: boolean
  } | null>(null)

  const resizeState = ref<{
    el: string
    startX: number
    startY: number
    origW: number
    origH: number
    scale: number
  } | null>(null)

  function toggle() {
    editing.value = !editing.value
    if (!editing.value) selected.value = null
  }

  const undoStack = _sharedUndoStack
  const undoCheckpoint = _sharedUndoCheckpoint

  const canUndo = computed(() => undoStack.value.length > 0)

  function pushUndoCheckpoint() {
    undoCheckpoint.value = clonePositions()
  }

  function commitUndo() {
    if (undoCheckpoint.value) {
      // only push if something actually changed
      const c = undoCheckpoint.value
      const changed = Object.keys(c).some(key =>
        c[key].x !== positions[key].x || c[key].y !== positions[key].y ||
        c[key].w !== positions[key].w || c[key].h !== positions[key].h
      )
      if (changed) undoStack.value.push(undoCheckpoint.value)
      undoCheckpoint.value = null
    }
  }

  function undo() {
    const prev = undoStack.value.pop()
    if (!prev) return
    for (const key of Object.keys(prev)) {
      if (prev[key]) Object.assign(positions[key], prev[key])
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      undo()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown))
  onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

  function getContainerScale(): number {
    const container = document.querySelector('.slidev-layout.default')
    if (!container) return 1
    return container.getBoundingClientRect().width / container.scrollWidth
  }

  function startDrag(e: MouseEvent, name: string) {
    if (!editing.value) return
    e.preventDefault()
    selected.value = name
    const p = positions[name]
    if (!p) return
    pushUndoCheckpoint()
    const elCfg = ELEMENTS[name]
    dragState.value = {
      el: name, startX: e.clientX, startY: e.clientY,
      origX: p.x, origY: p.y,
      scale: getContainerScale(),
      invertX: elCfg?.invertX ?? false,
    }
    window.addEventListener('mousemove', onDrag)
    window.addEventListener('mouseup', stopDrag)
  }

  function onDrag(e: MouseEvent) {
    if (!dragState.value) return
    const p = positions[dragState.value.el]
    if (!p) return
    const dx = (e.clientX - dragState.value.startX) / dragState.value.scale
    const dy = (e.clientY - dragState.value.startY) / dragState.value.scale
    const xMul = dragState.value.invertX ? -1 : 1
    p.x = Math.round(Math.max(0, dragState.value.origX + dx * xMul))
    p.y = Math.round(Math.max(0, dragState.value.origY + dy))
  }

  function stopDrag() {
    commitUndo()
    dragState.value = null
    window.removeEventListener('mousemove', onDrag)
    window.removeEventListener('mouseup', stopDrag)
  }

  function startResize(e: MouseEvent, name: string) {
    if (!editing.value) return
    e.preventDefault()
    e.stopPropagation()
    selected.value = name
    const p = positions[name]
    if (!p) return
    pushUndoCheckpoint()
    resizeState.value = {
      el: name, startX: e.clientX, startY: e.clientY,
      origW: p.w, origH: p.h,
      scale: getContainerScale(),
    }
    window.addEventListener('mousemove', onResize)
    window.addEventListener('mouseup', stopResize)
  }

  function onResize(e: MouseEvent) {
    if (!resizeState.value) return
    const p = positions[resizeState.value.el]
    if (!p) return
    const dx = (e.clientX - resizeState.value.startX) / resizeState.value.scale
    const dy = (e.clientY - resizeState.value.startY) / resizeState.value.scale
    p.w = Math.max(20, resizeState.value.origW + dx)
    p.h = Math.max(10, resizeState.value.origH + dy)
  }

  function stopResize() {
    commitUndo()
    resizeState.value = null
    window.removeEventListener('mousemove', onResize)
    window.removeEventListener('mouseup', stopResize)
  }

  const rootStyle = computed((): Record<string, string> => {
    if (!editing.value) return {}
    const t = positions.title
    const c = positions.content
    const l = positions.logo
    const r = positions['red-bar']
    return {
      '--ed-title-x': t ? `${t.x}px` : '24px',
      '--ed-title-y': t ? `${t.y}px` : '20px',
      '--ed-title-w': t ? `${t.w}px` : 'auto',
      '--ed-title-h': t ? `${t.h}px` : 'auto',
      '--ed-content-y': c ? `${c.y}px` : '80px',
      '--ed-content-x': c ? `${c.x}px` : '24px',
      '--ed-content-w': c ? `${c.w}px` : '700px',
      '--ed-content-h': c ? `${c.h}px` : '200px',
      '--ed-logo-y': l ? `${l.y}px` : '20px',
      '--ed-logo-rx': l ? `${l.x}px` : '24px',
      '--ed-red-h': r ? `${r.h}px` : '10px',
    }
  })

  function exportCss(): string {
    return Object.entries(ELEMENTS).map(([name, el]) => {
      const p = positions[name]
      if (!p) return ''
      return `.${name} {\n${el.cssOutput(p)}\n}`
    }).join('\n\n')
  }

  function removeElement(name: string) {
    _sharedHidden[name] = !_sharedHidden[name]
  }

  function setHidden(h: Record<string, boolean>) {
    for (const [key, val] of Object.entries(h)) {
      if (key in _sharedHidden) {
        _sharedHidden[key] = val
      }
    }
  }

  const saving = ref(false)
  const saved = ref(false)

  function clonePositions(): Record<string, Rect> {
    const copy: Record<string, Rect> = {}
    for (const key of Object.keys(positions)) {
      copy[key] = { ...positions[key] }
    }
    return copy
  }

  const snapshot = ref<Record<string, Rect>>(clonePositions())

  const dirty = computed(() => {
    for (const key of Object.keys(positions)) {
      const p = positions[key]
      const s = snapshot.value[key]
      if (!p || !s) return false
      if (p.x !== s.x || p.y !== s.y || p.w !== s.w || p.h !== s.h) return true
    }
    return false
  })

  function resetLayout() {
    for (const key of Object.keys(snapshot.value)) {
      const s = snapshot.value[key]
      if (s) Object.assign(positions[key], s)
    }
  }

  const saveAs = ref(true)
  const saveLayoutName = ref('')

  async function saveLayout(hiddenOverride?: Record<string, boolean>) {
    saving.value = true
    saved.value = false
    try {
      const resp = await fetch('/api/save-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions: { ...positions },
          hidden: hiddenOverride ?? { ...hidden },
          saveAs: saveAs.value,
          layoutName: saveLayoutName.value,
        }),
      })
      if (resp.ok) {
        const result = await resp.json()
        if (result?.layoutName) {
          saveLayoutName.value = result.layoutName
        }
        snapshot.value = clonePositions()
        saved.value = true
        setTimeout(() => { saved.value = false }, 2000)
        return result
      }
    } catch {
      saved.value = false
    } finally {
      saving.value = false
    }
    return null
  }

  const elementNames = computed(() => Object.keys(ELEMENTS))

  function clearUndo() {
    undoStack.value.splice(0)
    undoCheckpoint.value = null
  }

  function updateSnapshot() {
    snapshot.value = clonePositions()
  }

  return {
    editing,
    selected,
    positions,
    hidden,
    elementNames,
    saving,
    saved,
    dirty,
    saveAs,
    saveLayoutName,
    canUndo,
    toggle,
    startDrag,
    startResize,
    rootStyle,
    exportCss,
    saveLayout,
    resetLayout,
    undo,
    clearUndo,
    removeElement,
    setHidden,
    updateSnapshot,
  }
}
