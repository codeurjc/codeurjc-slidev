import { describe, expect, it, vi } from 'vitest'
import { useEditor } from '../useEditor'

// Mock global fetch
globalThis.fetch = vi.fn()

describe('useEditor', () => {
  it('initializes with correct defaults', () => {
    const { saveAs, saveLayoutName, positions } = useEditor()
    expect(saveAs.value).toBe(true)
    expect(saveLayoutName.value).toBe('')
    expect(positions.title).toBeDefined()
  })

  it('editing and selected start with correct defaults', () => {
    const { editing, selected, elementNames } = useEditor()
    expect(editing.value).toBe(false)
    expect(selected.value).toBeNull()
    expect(elementNames.value).toEqual(['red-bar', 'logo', 'title', 'content'])
  })

  it('toggle switches editing on and off', () => {
    const { editing, toggle } = useEditor()
    expect(editing.value).toBe(false)
    toggle()
    expect(editing.value).toBe(true)
    toggle()
    expect(editing.value).toBe(false)
  })

  it('toggle clears selected when turning off', () => {
    const { editing, selected, toggle } = useEditor()
    editing.value = true
    selected.value = 'title'
    toggle()
    expect(editing.value).toBe(false)
    expect(selected.value).toBeNull()
  })

  it('selected can be set and cleared', () => {
    const { editing, selected } = useEditor()
    editing.value = true
    selected.value = 'red-bar'
    expect(selected.value).toBe('red-bar')
    selected.value = null
    expect(selected.value).toBeNull()
  })

  it('all elements have initial positions', () => {
    const { positions, elementNames } = useEditor()
    for (const name of elementNames.value) {
      expect(positions[name]).toBeDefined()
      expect(positions[name].x).toBeTypeOf('number')
      expect(positions[name].y).toBeTypeOf('number')
      expect(positions[name].w).toBeTypeOf('number')
      expect(positions[name].h).toBeTypeOf('number')
    }
  })

  it('undo is disabled when no changes have been made', () => {
    const { canUndo } = useEditor()
    expect(canUndo.value).toBe(false)
  })

  it('undo is enabled after a drag operation', () => {
    const { startDrag, canUndo, editing, clearUndo } = useEditor()
    clearUndo()
    editing.value = true
    const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 })
    startDrag(mouseDown, 'title')
    const mouseMove = new MouseEvent('mousemove', { clientX: 200, clientY: 200 })
    window.dispatchEvent(mouseMove)
    const mouseUp = new MouseEvent('mouseup')
    window.dispatchEvent(mouseUp)
    expect(canUndo.value).toBe(true)
  })

  it('undo restores positions and disables undo again', () => {
    const { startDrag, canUndo, undo, positions, editing, clearUndo } = useEditor()
    clearUndo()
    editing.value = true
    const origX = positions.title.x
    const origY = positions.title.y
    // Perform drag
    const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 })
    startDrag(mouseDown, 'title')
    const mouseMove = new MouseEvent('mousemove', { clientX: 200, clientY: 200 })
    window.dispatchEvent(mouseMove)
    const mouseUp = new MouseEvent('mouseup')
    window.dispatchEvent(mouseUp)
    expect(positions.title.x).not.toBe(origX)
    expect(positions.title.y).not.toBe(origY)
    expect(canUndo.value).toBe(true)
    // Undo
    undo()
    expect(positions.title.x).toBe(origX)
    expect(positions.title.y).toBe(origY)
    expect(canUndo.value).toBe(false)
  })

  it('rootStyle includes title and content width/height when editing', () => {
    const { editing, rootStyle } = useEditor()
    editing.value = true
    const style = rootStyle.value
    expect(style['--ed-title-w']).toMatch(/\d+px/)
    expect(style['--ed-title-h']).toMatch(/\d+px/)
    expect(style['--ed-content-w']).toMatch(/\d+px/)
    expect(style['--ed-content-h']).toMatch(/\d+px/)
  })

  it('resize updates title width and height', () => {
    const { startResize, editing, clearUndo, positions } = useEditor()
    clearUndo()
    editing.value = true
    const origW = positions.title.w
    const origH = positions.title.h
    const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 })
    startResize(mouseDown, 'title')
    const mouseMove = new MouseEvent('mousemove', { clientX: 150, clientY: 130 })
    window.dispatchEvent(mouseMove)
    const mouseUp = new MouseEvent('mouseup')
    window.dispatchEvent(mouseUp)
    expect(positions.title.w).toBeGreaterThan(origW)
    expect(positions.title.h).toBeGreaterThan(origH)
  })

  it('resize rounds width and height to integers, so saved CSS px values can be restored on reload', () => {
    const { startResize, editing, clearUndo, positions } = useEditor()
    clearUndo()
    editing.value = true
    // A mouse delta chosen to produce a non-integer raw offset
    const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 })
    startResize(mouseDown, 'title')
    const mouseMove = new MouseEvent('mousemove', { clientX: 137, clientY: 111 })
    window.dispatchEvent(mouseMove)
    const mouseUp = new MouseEvent('mouseup')
    window.dispatchEvent(mouseUp)
    expect(Number.isInteger(positions.title.w)).toBe(true)
    expect(Number.isInteger(positions.title.h)).toBe(true)
  })

  it('resize updates content width and height', () => {
    const { startResize, editing, clearUndo, positions } = useEditor()
    clearUndo()
    editing.value = true
    const origW = positions.content.w
    const origH = positions.content.h
    const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 })
    startResize(mouseDown, 'content')
    const mouseMove = new MouseEvent('mousemove', { clientX: 200, clientY: 150 })
    window.dispatchEvent(mouseMove)
    const mouseUp = new MouseEvent('mouseup')
    window.dispatchEvent(mouseUp)
    expect(positions.content.w).toBeGreaterThan(origW)
    expect(positions.content.h).toBeGreaterThan(origH)
  })

  it('removeElement hides an element and enables undo', () => {
    const { removeElement, hidden, canUndo, clearUndo } = useEditor()
    clearUndo()
    hidden.logo = false
    removeElement('logo')
    expect(hidden.logo).toBe(true)
    expect(canUndo.value).toBe(true)
  })

  it('undo restores a deleted element', () => {
    const { removeElement, undo, hidden, clearUndo } = useEditor()
    clearUndo()
    hidden.logo = false
    removeElement('logo')
    expect(hidden.logo).toBe(true)
    undo()
    expect(hidden.logo).toBe(false)
  })

  it('removeElement clears selection if the removed element was selected', () => {
    const { removeElement, selected, hidden, clearUndo } = useEditor()
    clearUndo()
    hidden.logo = false
    selected.value = 'logo'
    removeElement('logo')
    expect(selected.value).toBeNull()
  })

  it('undo restores both position and hidden state from the same checkpoint', () => {
    const { startDrag, removeElement, undo, positions, hidden, editing, clearUndo } = useEditor()
    clearUndo()
    hidden.content = false
    editing.value = true
    const origY = positions.title.y

    const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 })
    startDrag(mouseDown, 'title')
    const mouseMove = new MouseEvent('mousemove', { clientX: 100, clientY: 150 })
    window.dispatchEvent(mouseMove)
    window.dispatchEvent(new MouseEvent('mouseup'))
    expect(positions.title.y).not.toBe(origY)

    removeElement('content')
    expect(hidden.content).toBe(true)

    undo()
    expect(hidden.content).toBe(false)
    // The drag was a separate, already-committed checkpoint
    expect(positions.title.y).not.toBe(origY)
  })

  it('saveLayout updates saveLayoutName on success', async () => {
    const { saveLayout, saveLayoutName } = useEditor()

    // Mock successful response
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ layoutName: 'new-layout' }),
    })

    const result = await saveLayout()
    expect(result?.layoutName).toBe('new-layout')
    expect(saveLayoutName.value).toBe('new-layout')
  })

  it('saveLayout returns null on failure', async () => {
    const { saveLayout } = useEditor()

    // Mock failed response
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
    })

    const result = await saveLayout()
    expect(result).toBeNull()
  })

  it('every fixed element starts with aspectLocked false', () => {
    const { aspectLocked, elementNames } = useEditor()
    for (const name of elementNames.value)
      expect(aspectLocked[name]).toBe(false)
  })

  it('has no layout-level image element', () => {
    const { positions, rootStyle, editing } = useEditor()
    expect(positions.image).toBeUndefined()
    editing.value = true
    expect(Object.keys(rootStyle.value).some(key => key.startsWith('--ed-image'))).toBe(false)
    editing.value = false
  })

  it('toggleAspectLock flips the flag for a single element and enables undo', () => {
    const { toggleAspectLock, aspectLocked, canUndo, clearUndo } = useEditor()
    clearUndo()
    aspectLocked.title = false
    toggleAspectLock('title')
    expect(aspectLocked.title).toBe(true)
    expect(aspectLocked.content).toBe(false)
    expect(canUndo.value).toBe(true)
  })

  it('undo restores aspectLocked state', () => {
    const { toggleAspectLock, undo, aspectLocked, clearUndo } = useEditor()
    clearUndo()
    aspectLocked.title = true
    toggleAspectLock('title')
    expect(aspectLocked.title).toBe(false)
    undo()
    expect(aspectLocked.title).toBe(true)
  })

  it('resetLayout restores aspectLocked to the last snapshot', () => {
    const { toggleAspectLock, resetLayout, updateSnapshot, aspectLocked, clearUndo } = useEditor()
    clearUndo()
    aspectLocked.logo = true
    updateSnapshot()
    toggleAspectLock('logo')
    expect(aspectLocked.logo).toBe(false)
    resetLayout()
    expect(aspectLocked.logo).toBe(true)
  })

  it('dirty reflects aspectLocked changes', () => {
    const { toggleAspectLock, dirty, updateSnapshot, aspectLocked, clearUndo } = useEditor()
    clearUndo()
    aspectLocked.content = true
    updateSnapshot()
    expect(dirty.value).toBe(false)
    toggleAspectLock('content')
    expect(dirty.value).toBe(true)
  })

  it('locked resize preserves the aspect ratio captured at gesture start', () => {
    const { startResize, editing, clearUndo, positions, aspectLocked } = useEditor()
    clearUndo()
    editing.value = true
    aspectLocked.title = true
    const origRatio = positions.title.w / positions.title.h
    const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 })
    startResize(mouseDown, 'title')
    // Diagonal drag with width as the dominant delta
    const mouseMove = new MouseEvent('mousemove', { clientX: 180, clientY: 130 })
    window.dispatchEvent(mouseMove)
    window.dispatchEvent(new MouseEvent('mouseup'))
    const newRatio = positions.title.w / positions.title.h
    expect(newRatio).toBeCloseTo(origRatio, 0)
  })

  it('unlocked resize changes width and height independently', () => {
    const { startResize, editing, clearUndo, positions, aspectLocked } = useEditor()
    clearUndo()
    editing.value = true
    aspectLocked.title = false
    const origRatio = positions.title.w / positions.title.h
    const mouseDown = new MouseEvent('mousedown', { clientX: 100, clientY: 100 })
    startResize(mouseDown, 'title')
    const mouseMove = new MouseEvent('mousemove', { clientX: 180, clientY: 130 })
    window.dispatchEvent(mouseMove)
    window.dispatchEvent(new MouseEvent('mouseup'))
    const newRatio = positions.title.w / positions.title.h
    expect(newRatio).not.toBeCloseTo(origRatio, 1)
  })

  it('invertX element (logo) resize handle tracks the cursor: moving left grows width', () => {
    const { startResize, editing, clearUndo, positions, aspectLocked } = useEditor()
    clearUndo()
    editing.value = true
    aspectLocked.logo = false
    const origW = positions.logo.w
    const mouseDown = new MouseEvent('mousedown', { clientX: 200, clientY: 100 })
    startResize(mouseDown, 'logo')
    // Cursor moves left (toward the anchored right edge's opposite side)
    const mouseMove = new MouseEvent('mousemove', { clientX: 150, clientY: 100 })
    window.dispatchEvent(mouseMove)
    window.dispatchEvent(new MouseEvent('mouseup'))
    expect(positions.logo.w).toBeGreaterThan(origW)
  })

  it('invertX element (logo) resize handle tracks the cursor: moving right shrinks width', () => {
    const { startResize, editing, clearUndo, positions, aspectLocked } = useEditor()
    clearUndo()
    editing.value = true
    aspectLocked.logo = false
    const origW = positions.logo.w
    const mouseDown = new MouseEvent('mousedown', { clientX: 150, clientY: 100 })
    startResize(mouseDown, 'logo')
    const mouseMove = new MouseEvent('mousemove', { clientX: 170, clientY: 100 })
    window.dispatchEvent(mouseMove)
    window.dispatchEvent(new MouseEvent('mouseup'))
    expect(positions.logo.w).toBeLessThan(origW)
  })

  it('rootStyle includes logo and red-bar width/height when editing', () => {
    const { editing, rootStyle } = useEditor()
    editing.value = true
    const style = rootStyle.value
    expect(style['--ed-logo-w']).toMatch(/\d+px/)
    expect(style['--ed-logo-h']).toMatch(/\d+px/)
    expect(style['--ed-red-w']).toMatch(/\d+px/)
    expect(style['--ed-red-h']).toMatch(/\d+px/)
  })

  describe('dynamic (callout) position entries', () => {
    it('ensurePosition adds a new key without touching the fixed elements', () => {
      const { ensurePosition, positions, elementNames } = useEditor()
      ensurePosition('callout:abc', { x: 1, y: 2, w: 100, h: 40 })
      expect(positions['callout:abc']).toEqual({ x: 1, y: 2, w: 100, h: 40 })
      // Dynamic keys aren't listed as editable elements in the SideEditor
      expect(elementNames.value).not.toContain('callout:abc')
    })

    it('ensurePosition does not overwrite an already-registered key', () => {
      const { ensurePosition, positions } = useEditor()
      ensurePosition('callout:keep', { x: 1, y: 1, w: 10, h: 10 })
      ensurePosition('callout:keep', { x: 99, y: 99, w: 10, h: 10 })
      expect(positions['callout:keep']).toEqual({ x: 1, y: 1, w: 10, h: 10 })
    })

    it('a dynamic key participates in drag like a fixed element', () => {
      const { ensurePosition, positions, editing, startDrag } = useEditor()
      ensurePosition('callout:drag', { x: 10, y: 10, w: 50, h: 50 })
      editing.value = true
      startDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }), 'callout:drag')
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 }))
      window.dispatchEvent(new MouseEvent('mouseup'))
      expect(positions['callout:drag'].x).toBeGreaterThan(10)
    })

    it('a dynamic key participates in undo', () => {
      const { ensurePosition, positions, editing, startDrag, undo } = useEditor()
      ensurePosition('callout:undo-me', { x: 5, y: 5, w: 50, h: 50 })
      editing.value = true
      startDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }), 'callout:undo-me')
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 0 }))
      window.dispatchEvent(new MouseEvent('mouseup'))
      expect(positions['callout:undo-me'].x).toBeGreaterThan(5)
      undo()
      expect(positions['callout:undo-me'].x).toBe(5)
    })

    it('pruneDynamicKeys removes stale entries under a prefix but keeps valid ones', () => {
      const { ensurePosition, positions, pruneDynamicKeys } = useEditor()
      ensurePosition('callout:stale', { x: 0, y: 0, w: 1, h: 1 })
      ensurePosition('callout:fresh', { x: 0, y: 0, w: 1, h: 1 })
      pruneDynamicKeys('callout:', new Set(['fresh']))
      expect(positions['callout:stale']).toBeUndefined()
      expect(positions['callout:fresh']).toBeDefined()
    })
  })
})

describe('useEditor dynamic entries and layout saves', () => {
  it('seeds aspect lock only when a dynamic entry is first registered', () => {
    const { ensurePosition, aspectLocked, toggleAspectLock } = useEditor()
    ensurePosition('geometry:99:image:0', { x: 1, y: 2, w: 3, h: 4 }, { aspectLocked: true })
    expect(aspectLocked['geometry:99:image:0']).toBe(true)
    toggleAspectLock('geometry:99:image:0')
    ensurePosition('geometry:99:image:0', { x: 1, y: 2, w: 3, h: 4 }, { aspectLocked: true })
    expect(aspectLocked['geometry:99:image:0']).toBe(false)
  })

  it('defaults dynamic entries to unlocked', () => {
    const { ensurePosition, aspectLocked } = useEditor()
    ensurePosition('callout:dyn-default', { x: 0, y: 0, w: 10, h: 10 })
    expect(aspectLocked['callout:dyn-default']).toBe(false)
  })

  it('is not interacting while no drag or resize is active', () => {
    expect(useEditor().isInteracting.value).toBe(false)
  })

  it('saveLayout only sends the fixed layout elements', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false })
    globalThis.fetch = fetchMock
    const { ensurePosition, saveLayout } = useEditor()
    ensurePosition('geometry:98:content', { x: 1, y: 1, w: 100, h: 100 })
    ensurePosition('geometry:98:image:0', { x: 1, y: 1, w: 100, h: 100 }, { aspectLocked: true })
    ensurePosition('callout:98', { x: 1, y: 1, w: 100, h: 100 })
    await saveLayout()
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    const fixed = ['red-bar', 'logo', 'title', 'content']
    expect(Object.keys(body.positions)).toEqual(fixed)
    expect(Object.keys(body.hidden)).toEqual(fixed)
    expect(Object.keys(body.aspectLocked)).toEqual(fixed)
  })
})

describe('useEditor drag scale', () => {
  it('keeps drag positions finite when the layout under the pointer has no measurable size', () => {
    const layout = document.createElement('div')
    layout.className = 'slidev-layout default'
    const handle = document.createElement('div')
    layout.appendChild(handle)
    document.body.appendChild(layout)
    const { editing, ensurePosition, positions, startDrag } = useEditor()
    editing.value = true
    ensurePosition('geometry:77:image:0', { x: 100, y: 120, w: 300, h: 200 })
    const down = new MouseEvent('mousedown', { clientX: 10, clientY: 10, bubbles: true })
    handle.dispatchEvent(down)
    startDrag(down, 'geometry:77:image:0')
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 10 }))
    window.dispatchEvent(new MouseEvent('mouseup'))
    expect(positions['geometry:77:image:0']).toEqual({ x: 150, y: 120, w: 300, h: 200 })
    editing.value = false
    layout.remove()
  })
})
