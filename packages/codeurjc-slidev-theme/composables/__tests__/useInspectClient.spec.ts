import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setControllerEditing, useEditor } from '../useEditor'
import { applyInspectCommand, controlled, highlighted, inspecting } from '../useInspectClient'

const deps = () => ({ setEditing: setControllerEditing, announceDeck: vi.fn() })

describe('applyInspectCommand', () => {
  beforeEach(() => {
    applyInspectCommand({ type: 'inspect', on: false }, deps())
    applyInspectCommand({ type: 'control', on: false }, deps())
    useEditor().editing.value = false
  })

  it('turning inspection on also turns editor mode on, so drag handles appear', () => {
    applyInspectCommand({ type: 'inspect', on: true }, deps())
    expect(inspecting.value).toBe(true)
    expect(useEditor().editing.value).toBe(true)
  })

  it('turning inspection off restores whatever the Layout tab had', () => {
    const editor = useEditor()
    applyInspectCommand({ type: 'inspect', on: true }, deps())
    applyInspectCommand({ type: 'inspect', on: false }, deps())
    expect(editor.editing.value).toBe(false)

    editor.editing.value = true // the Layout tab is open
    applyInspectCommand({ type: 'inspect', on: true }, deps())
    applyInspectCommand({ type: 'inspect', on: false }, deps())
    expect(editor.editing.value).toBe(true)
  })

  it('keeps editor mode on while inspecting even if the Layout tab closes', () => {
    const editor = useEditor()
    applyInspectCommand({ type: 'inspect', on: true }, deps())
    editor.editing.value = false
    expect(editor.editing.value).toBe(true)
  })

  it('clears the highlight when inspection ends', () => {
    applyInspectCommand({ type: 'inspect', on: true }, deps())
    applyInspectCommand({ type: 'highlight', entry: { slideNo: 2, collection: 'elements', index: 0 } }, deps())
    expect(highlighted.value).toEqual({ slideNo: 2, collection: 'elements', index: 0 })
    applyInspectCommand({ type: 'inspect', on: false }, deps())
    expect(highlighted.value).toBeNull()
  })

  it('claims and releases geometry writes', () => {
    applyInspectCommand({ type: 'control', on: true }, deps())
    expect(controlled.value).toBe(true)
    applyInspectCommand({ type: 'control', on: false }, deps())
    expect(controlled.value).toBe(false)
  })

  it('answers whichDeck', () => {
    const d = deps()
    applyInspectCommand({ type: 'whichDeck' }, d)
    expect(d.announceDeck).toHaveBeenCalledOnce()
  })
})
