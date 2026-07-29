import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findPastedImage, buildImageMarkdown, insertAtCursor, uploadImage, appendImageMarkdown } from '../useImagePaste'

function fakeClipboardData(items: Array<{ kind: string, type: string, file?: File }>): DataTransfer {
  return {
    items: items.map(i => ({
      kind: i.kind,
      type: i.type,
      getAsFile: () => i.file ?? null,
    })),
  } as unknown as DataTransfer
}

describe('findPastedImage', () => {
  it('returns null when clipboardData is null', () => {
    expect(findPastedImage(null)).toBeNull()
  })

  it('returns null when there are no file items', () => {
    const data = fakeClipboardData([{ kind: 'string', type: 'text/plain' }])
    expect(findPastedImage(data)).toBeNull()
  })

  it('finds a supported image type (png)', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const data = fakeClipboardData([{ kind: 'file', type: 'image/png', file }])
    expect(findPastedImage(data)).toBe(file)
  })

  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])('recognizes %s', (type) => {
    const file = new File(['x'], 'a', { type })
    const data = fakeClipboardData([{ kind: 'file', type, file }])
    expect(findPastedImage(data)).toBe(file)
  })

  it('ignores unsupported image types', () => {
    const file = new File(['x'], 'a.bmp', { type: 'image/bmp' })
    const data = fakeClipboardData([{ kind: 'file', type: 'image/bmp', file }])
    expect(findPastedImage(data)).toBeNull()
  })

  it('uses only the first recognized image when multiple are present', () => {
    const first = new File(['1'], 'first.png', { type: 'image/png' })
    const second = new File(['2'], 'second.png', { type: 'image/png' })
    const data = fakeClipboardData([
      { kind: 'file', type: 'image/png', file: first },
      { kind: 'file', type: 'image/png', file: second },
    ])
    expect(findPastedImage(data)).toBe(first)
  })

  it('skips non-file items and unsupported types before finding a supported image', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const data = fakeClipboardData([
      { kind: 'string', type: 'text/plain' },
      { kind: 'file', type: 'image/bmp' },
      { kind: 'file', type: 'image/png', file },
    ])
    expect(findPastedImage(data)).toBe(file)
  })
})

describe('buildImageMarkdown', () => {
  it('wraps the path in an empty-alt markdown image', () => {
    expect(buildImageMarkdown('/images/paste-123.png')).toBe('![](/images/paste-123.png)')
  })
})

describe('appendImageMarkdown', () => {
  it('appends with a blank-line separator when content already exists', () => {
    expect(appendImageMarkdown('# Title\n\nSome text', '![](/images/x.png)'))
      .toBe('# Title\n\nSome text\n\n![](/images/x.png)')
  })

  it('does not prepend a separator when content is empty', () => {
    expect(appendImageMarkdown('', '![](/images/x.png)')).toBe('![](/images/x.png)')
  })

  it('does not prepend a separator when content is only whitespace', () => {
    expect(appendImageMarkdown('   \n  ', '![](/images/x.png)')).toBe('   \n  ![](/images/x.png)')
  })
})

describe('insertAtCursor', () => {
  it('splices text at the cursor position and dispatches an input event', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'hello world'
    textarea.selectionStart = 5
    textarea.selectionEnd = 5
    const onInput = vi.fn()
    textarea.addEventListener('input', onInput)

    insertAtCursor(textarea, '![](/images/x.png)')

    expect(textarea.value).toBe('hello![](/images/x.png) world')
    expect(onInput).toHaveBeenCalledTimes(1)
    expect(textarea.selectionStart).toBe(5 + '![](/images/x.png)'.length)
  })

  it('replaces a selection rather than just inserting at start', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'hello world'
    textarea.selectionStart = 6
    textarea.selectionEnd = 11
    insertAtCursor(textarea, 'there')
    expect(textarea.value).toBe('hello there')
  })

  it('appends at the end when there is no selection info', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'hello'
    // jsdom defaults selectionStart/End to the end of the value when unfocused
    insertAtCursor(textarea, ' world')
    expect(textarea.value).toBe('hello world')
  })
})

describe('uploadImage', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('posts the file with its mime type and returns the parsed JSON', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ filename: 'paste-1.png', path: '/images/paste-1.png' }),
    })

    const result = await uploadImage(file)

    expect(global.fetch).toHaveBeenCalledWith('/api/save-image', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: file,
    }))
    expect(result).toEqual({ filename: 'paste-1.png', path: '/images/paste-1.png' })
  })

  it('throws when the response is not ok', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 400 })

    await expect(uploadImage(file)).rejects.toThrow('400')
  })
})
