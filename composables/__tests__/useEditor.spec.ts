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
})
