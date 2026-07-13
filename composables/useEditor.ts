import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// The content box's full (non-narrowed) width, used both as its own default
// and as the reset target for the image-position "Below" preset.
export const CONTENT_DEFAULT_WIDTH = 876

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
    initial: { x: 0, y: 0, w: 980, h: 10 },
    cssOutput: (pos) => [
      'position: absolute',
      `top: ${pos.y}px`,
      `left: ${pos.x}px`,
      `width: ${pos.w}px`,
      `height: ${pos.h}px`,
      'background-color: #cb0017',
      'z-index: 100',
    ].map(l => `  ${l};`).join('\n'),
  },
  logo: {
    label: 'Logo',
    color: '#e8792b',
    initial: { x: 24, y: 20, w: 80, h: 48 },
    invertX: true,
    cssOutput: (pos) => [
      'position: absolute',
      `top: ${pos.y}px`,
      `right: ${pos.x}px`,
      `width: ${pos.w}px`,
      `height: ${pos.h}px`,
      'z-index: 50',
    ].map(l => `  ${l};`).join('\n'),
  },
  title: {
    label: 'Title',
    color: '#2563eb',
    initial: { x: 24, y: 20, w: 400, h: 48 },
    cssOutput: (pos) => [
      'position: absolute',
      `top: ${pos.y}px`,
      `left: ${pos.x}px`,
      'margin: 0',
      `width: ${pos.w}px`,
      `min-height: ${pos.h}px`,
      'display: flex',
      'align-items: center',
      'overflow-wrap: break-word',
      'font-weight: 700',
      'color: #cb0017',
      'font-size: 36pt',
    ].map(l => `  ${l};`).join('\n'),
  },
  content: {
    label: 'Content',
    color: '#16a34a',
    initial: { x: 0, y: 80, w: CONTENT_DEFAULT_WIDTH, h: 400 },
    cssOutput: (pos) => [
      `margin-top: ${pos.y}px`,
      `margin-left: ${pos.x}px`,
      `width: ${pos.w}px`,
      `min-height: ${pos.h}px`,
    ].map(l => `  ${l};`).join('\n'),
  },
  image: {
    label: 'Image',
    color: '#9333ea',
    initial: { x: 438, y: 80, w: 400, h: 300 },
    cssOutput: (pos) => [
      'position: absolute',
      `top: ${pos.y}px`,
      `left: ${pos.x}px`,
      `width: ${pos.w}px`,
      `height: ${pos.h}px`,
      'object-fit: contain',
      'z-index: 40',
    ].map(l => `  ${l};`).join('\n'),
  },
}

// Unlike the other elements (which always exist on every slide using a
// layout), `image` only has meaning once a slide's content actually has a
// trackable pasted image — its hidden/aspect-lock defaults are inverted
// from the rest: hidden until one is detected, locked once it exists (an
// arbitrarily-stretched photo looks broken in a way a stretched logo/red-bar
// usually doesn't).
const IMAGE_HIDDEN_DEFAULT = true
const IMAGE_ASPECT_LOCKED_DEFAULT = true

interface Snapshot {
  positions: Record<string, Rect>
  hidden: Record<string, boolean>
  aspectLocked: Record<string, boolean>
}

const _sharedEditing = ref(false)
const _sharedSelected = ref<string | null>(null)
// Which SideEditor tab is active. Lives here (rather than as local state in
// _override/SideEditor.vue) so other entry points -- e.g. global-top.vue's
// double-click-to-edit handler -- can switch to the Content tab themselves.
const _sharedActiveTab = ref<'content' | 'note' | 'layout'>('content')
const _sharedHidden = reactive<Record<string, boolean>>({})
const _sharedAspectLocked = reactive<Record<string, boolean>>({})
const _sharedPositions = reactive<Record<string, Rect>>({})
for (const key of Object.keys(ELEMENTS)) {
  _sharedPositions[key] = { ...ELEMENTS[key].initial }
  _sharedHidden[key] = key === 'image' ? IMAGE_HIDDEN_DEFAULT : false
  _sharedAspectLocked[key] = key === 'image' ? IMAGE_ASPECT_LOCKED_DEFAULT : false
}
const _sharedUndoStack = ref<Snapshot[]>([])
const _sharedUndoCheckpoint = ref<Snapshot | null>(null)

export function useEditor() {
  const editing = _sharedEditing
  const selected = _sharedSelected
  const activeTab = _sharedActiveTab
  const positions = _sharedPositions
  const hidden = _sharedHidden
  const aspectLocked = _sharedAspectLocked

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
    invertX: boolean
    ratio: number | null
  } | null>(null)

  function toggle() {
    editing.value = !editing.value
    if (!editing.value) selected.value = null
  }

  const undoStack = _sharedUndoStack
  const undoCheckpoint = _sharedUndoCheckpoint

  const canUndo = computed(() => undoStack.value.length > 0)

  function pushUndoCheckpoint() {
    undoCheckpoint.value = { positions: clonePositions(), hidden: cloneHidden(), aspectLocked: cloneAspectLocked() }
  }

  function commitUndo() {
    if (undoCheckpoint.value) {
      // only push if something actually changed
      const c = undoCheckpoint.value
      const positionsChanged = Object.keys(c.positions).some(key =>
        c.positions[key].x !== positions[key].x || c.positions[key].y !== positions[key].y ||
        c.positions[key].w !== positions[key].w || c.positions[key].h !== positions[key].h
      )
      const hiddenChanged = Object.keys(c.hidden).some(key => c.hidden[key] !== hidden[key])
      const aspectLockedChanged = Object.keys(c.aspectLocked).some(key => c.aspectLocked[key] !== aspectLocked[key])
      if (positionsChanged || hiddenChanged || aspectLockedChanged) undoStack.value.push(undoCheckpoint.value)
      undoCheckpoint.value = null
    }
  }

  function undo() {
    const prev = undoStack.value.pop()
    if (!prev) return
    for (const key of Object.keys(prev.positions)) {
      if (prev.positions[key]) Object.assign(positions[key], prev.positions[key])
    }
    for (const key of Object.keys(prev.hidden)) {
      hidden[key] = prev.hidden[key]
    }
    for (const key of Object.keys(prev.aspectLocked)) {
      aspectLocked[key] = prev.aspectLocked[key]
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
    const elCfg = ELEMENTS[name]
    resizeState.value = {
      el: name, startX: e.clientX, startY: e.clientY,
      origW: p.w, origH: p.h,
      scale: getContainerScale(),
      invertX: elCfg?.invertX ?? false,
      ratio: aspectLocked[name] ? p.w / p.h : null,
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
    const xMul = resizeState.value.invertX ? -1 : 1
    const rawW = resizeState.value.origW + dx * xMul
    const rawH = resizeState.value.origH + dy
    const ratio = resizeState.value.ratio
    if (ratio) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        p.w = Math.round(Math.max(20, rawW))
        p.h = Math.round(Math.max(10, p.w / ratio))
      } else {
        p.h = Math.round(Math.max(10, rawH))
        p.w = Math.round(Math.max(20, p.h * ratio))
      }
    } else {
      p.w = Math.round(Math.max(20, rawW))
      p.h = Math.round(Math.max(10, rawH))
    }
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
    const i = positions.image
    return {
      '--ed-title-x': t ? `${t.x}px` : '24px',
      '--ed-title-y': t ? `${t.y}px` : '20px',
      '--ed-title-w': t ? `${t.w}px` : 'auto',
      '--ed-title-h': t ? `${t.h}px` : 'auto',
      '--ed-content-y': c ? `${c.y}px` : '80px',
      '--ed-content-x': c ? `${c.x}px` : '0px',
      '--ed-content-w': c ? `${c.w}px` : '876px',
      '--ed-content-h': c ? `${c.h}px` : '200px',
      '--ed-logo-y': l ? `${l.y}px` : '20px',
      '--ed-logo-rx': l ? `${l.x}px` : '24px',
      '--ed-logo-w': l ? `${l.w}px` : '80px',
      '--ed-logo-h': l ? `${l.h}px` : '48px',
      '--ed-red-y': r ? `${r.y}px` : '0px',
      '--ed-red-x': r ? `${r.x}px` : '0px',
      '--ed-red-w': r ? `${r.w}px` : '100%',
      '--ed-red-h': r ? `${r.h}px` : '10px',
      '--ed-image-y': i ? `${i.y}px` : '80px',
      '--ed-image-x': i ? `${i.x}px` : '438px',
      '--ed-image-w': i ? `${i.w}px` : '400px',
      '--ed-image-h': i ? `${i.h}px` : '300px',
      '--ed-title-d': hidden.title ? 'none' : 'flex',
      '--ed-content-d': hidden.content ? 'none' : 'block',
      '--ed-image-d': hidden.image ? 'none' : 'block',
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
    pushUndoCheckpoint()
    _sharedHidden[name] = !_sharedHidden[name]
    if (_sharedHidden[name] && selected.value === name) selected.value = null
    commitUndo()
  }

  function setHidden(h: Record<string, boolean>) {
    for (const [key, val] of Object.entries(h)) {
      if (key in _sharedHidden) {
        _sharedHidden[key] = val
      }
    }
  }

  function toggleAspectLock(name: string) {
    pushUndoCheckpoint()
    _sharedAspectLocked[name] = !_sharedAspectLocked[name]
    commitUndo()
  }

  function setAspectLocked(al: Record<string, boolean>) {
    for (const [key, val] of Object.entries(al)) {
      if (key in _sharedAspectLocked) {
        _sharedAspectLocked[key] = val
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

  function cloneHidden(): Record<string, boolean> {
    return { ...hidden }
  }

  function cloneAspectLocked(): Record<string, boolean> {
    return { ...aspectLocked }
  }

  const snapshot = ref<Snapshot>({ positions: clonePositions(), hidden: cloneHidden(), aspectLocked: cloneAspectLocked() })

  const dirty = computed(() => {
    for (const key of Object.keys(positions)) {
      const p = positions[key]
      const s = snapshot.value.positions[key]
      if (!p || !s) return false
      if (p.x !== s.x || p.y !== s.y || p.w !== s.w || p.h !== s.h) return true
    }
    for (const key of Object.keys(hidden)) {
      if (hidden[key] !== snapshot.value.hidden[key]) return true
    }
    for (const key of Object.keys(aspectLocked)) {
      if (aspectLocked[key] !== snapshot.value.aspectLocked[key]) return true
    }
    return false
  })

  function resetLayout() {
    for (const key of Object.keys(snapshot.value.positions)) {
      const s = snapshot.value.positions[key]
      if (s) Object.assign(positions[key], s)
    }
    for (const key of Object.keys(snapshot.value.hidden)) {
      hidden[key] = snapshot.value.hidden[key]
    }
    for (const key of Object.keys(snapshot.value.aspectLocked)) {
      aspectLocked[key] = snapshot.value.aspectLocked[key]
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
          aspectLocked: { ...aspectLocked },
          saveAs: saveAs.value,
          layoutName: saveLayoutName.value,
        }),
      })
      if (resp.ok) {
        const result = await resp.json()
        if (result?.layoutName) {
          saveLayoutName.value = result.layoutName
        }
        snapshot.value = { positions: clonePositions(), hidden: cloneHidden(), aspectLocked: cloneAspectLocked() }
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

  // Dynamic (non-fixed) position entries, e.g. one per code-highlight
  // callout keyed as `callout:<highlight-id>`. Unlike the five fixed
  // ELEMENTS, these aren't seeded up front (their count varies per slide) --
  // callers register them on demand. Undo/snapshot/save already iterate
  // positions/hidden/aspectLocked generically by key, so once registered a
  // dynamic entry participates in drag, undo, and save exactly like a fixed
  // element, with no further changes needed to those code paths.
  function ensurePosition(key: string, initial: Rect) {
    if (!(key in _sharedPositions)) {
      _sharedPositions[key] = { ...initial }
      _sharedHidden[key] = false
      _sharedAspectLocked[key] = false
    }
  }

  // Drops dynamic entries under `prefix` whose suffix isn't in `validSuffixes`
  // -- used to clean up callouts whose highlight marker was removed from the
  // source so their position data doesn't accumulate indefinitely.
  function pruneDynamicKeys(prefix: string, validSuffixes: Set<string>) {
    for (const key of Object.keys(_sharedPositions)) {
      if (!key.startsWith(prefix)) continue
      if (validSuffixes.has(key.slice(prefix.length))) continue
      delete _sharedPositions[key]
      delete _sharedHidden[key]
      delete _sharedAspectLocked[key]
    }
  }

  function updateSnapshot() {
    snapshot.value = { positions: clonePositions(), hidden: cloneHidden(), aspectLocked: cloneAspectLocked() }
  }

  return {
    editing,
    selected,
    activeTab,
    positions,
    hidden,
    aspectLocked,
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
    toggleAspectLock,
    setAspectLocked,
    updateSnapshot,
    ensurePosition,
    pruneDynamicKeys,
  }
}
