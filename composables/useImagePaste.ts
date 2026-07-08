const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export function findPastedImage(clipboardData: DataTransfer | null): File | null {
  if (!clipboardData) return null
  for (const item of clipboardData.items) {
    if (item.kind === 'file' && SUPPORTED_IMAGE_TYPES.has(item.type)) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}

export function buildImageMarkdown(path: string): string {
  return `![](${path})`
}

export async function uploadImage(file: File | Blob): Promise<{ filename: string, path: string }> {
  const resp = await fetch('/api/save-image', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!resp.ok) throw new Error(`Failed to upload image: ${resp.status}`)
  return resp.json()
}

export function appendImageMarkdown(contentRaw: string, markdown: string): string {
  const separator = contentRaw.trim() ? '\n\n' : ''
  return contentRaw + separator + markdown
}

export function insertAtCursor(textarea: HTMLTextAreaElement, text: string): void {
  const start = textarea.selectionStart ?? textarea.value.length
  const end = textarea.selectionEnd ?? textarea.value.length
  const before = textarea.value.slice(0, start)
  const after = textarea.value.slice(end)
  textarea.value = before + text + after
  const cursor = start + text.length
  textarea.setSelectionRange(cursor, cursor)
  // useIME's onInput only reacts to real InputEvents (it ignores plain
  // Events), so a synthetic 'input' event must be an InputEvent to update
  // Slidev's underlying v-model.
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
}
