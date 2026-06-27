import { ref, reactive, computed } from 'vue'

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
      `padding-top: ${pos.y}px`,
      `padding-right: ${pos.x}px`,
      'padding-left: 24px',
    ].map(l => `  ${l};`).join('\n'),
  },
}

export function useEditor() {
  const editing = ref(false)
  const selected = ref<string | null>(null)

  const positions = reactive<Record<string, Rect>>({})

  const dragState = ref<{
    el: string
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  const resizeState = ref<{
    el: string
    startX: number
    startY: number
    origW: number
    origH: number
  } | null>(null)

  for (const key of Object.keys(ELEMENTS)) {
    positions[key] = { ...ELEMENTS[key].initial }
  }

  function toggle() {
    editing.value = !editing.value
    if (!editing.value) selected.value = null
  }

  function startDrag(e: MouseEvent, name: string) {
    if (!editing.value) return
    e.preventDefault()
    selected.value = name
    const p = positions[name]
    if (!p) return
    dragState.value = { el: name, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y }
    window.addEventListener('mousemove', onDrag)
    window.addEventListener('mouseup', stopDrag)
  }

  function onDrag(e: MouseEvent) {
    if (!dragState.value) return
    const p = positions[dragState.value.el]
    if (!p) return
    const dx = e.clientX - dragState.value.startX
    const dy = e.clientY - dragState.value.startY
    p.x = Math.round(Math.max(0, dragState.value.origX + dx))
    p.y = Math.round(Math.max(0, dragState.value.origY + dy))
  }

  function stopDrag() {
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
    resizeState.value = { el: name, startX: e.clientX, startY: e.clientY, origW: p.w, origH: p.h }
    window.addEventListener('mousemove', onResize)
    window.addEventListener('mouseup', stopResize)
  }

  function onResize(e: MouseEvent) {
    if (!resizeState.value) return
    const p = positions[resizeState.value.el]
    if (!p) return
    p.w = Math.max(20, resizeState.value.origW + e.clientX - resizeState.value.startX)
    p.h = Math.max(10, resizeState.value.origH + e.clientY - resizeState.value.startY)
  }

  function stopResize() {
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
      '--ed-content-py': c ? `${c.y}px` : '80px',
      '--ed-content-pr': c ? `${c.x}px` : '0px',
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

  async function saveLayout() {
    saving.value = true
    saved.value = false
    try {
      const resp = await fetch('/api/save-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions: { ...positions } }),
      })
      if (resp.ok) {
        snapshot.value = clonePositions()
        saved.value = true
        setTimeout(() => { saved.value = false }, 2000)
      }
    } catch {
      saved.value = false
    } finally {
      saving.value = false
    }
  }

  const elementNames = computed(() => Object.keys(ELEMENTS))

  return {
    editing,
    selected,
    positions,
    elementNames,
    saving,
    saved,
    dirty,
    toggle,
    startDrag,
    startResize,
    rootStyle,
    exportCss,
    saveLayout,
    resetLayout,
  }
}
