import { describe, it, expect, vi } from 'vitest'
import { useEditor } from '../useEditor'
import { ref } from 'vue'

// Mock global fetch
global.fetch = vi.fn()

describe('useEditor', () => {
  it('initializes with correct defaults', () => {
    const { saveAs, saveLayoutName, positions, editing, selected, elementNames } = useEditor()
    expect(saveAs.value).toBe(true)
    expect(saveLayoutName.value).toBe('')
    expect(positions.title).toBeDefined()
  })

  it('editing and selected start with correct defaults', () => {
    const { editing, selected, elementNames } = useEditor()
    expect(editing.value).toBe(false)
    expect(selected.value).toBeNull()
    expect(elementNames.value).toEqual(['red-bar', 'logo', 'title', 'content', 'image'])
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

  it('all elements except image start with aspectLocked false', () => {
    const { aspectLocked, elementNames } = useEditor()
    for (const name of elementNames.value) {
      if (name === 'image') continue
      expect(aspectLocked[name]).toBe(false)
    }
  })

  it('image starts hidden and aspect-locked, unlike the other elements', () => {
    const { hidden, aspectLocked } = useEditor()
    expect(hidden.image).toBe(true)
    expect(aspectLocked.image).toBe(true)
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
})
