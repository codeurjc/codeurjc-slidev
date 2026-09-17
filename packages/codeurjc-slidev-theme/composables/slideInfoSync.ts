// Slidev caches each slide's info (`useDynamicSlideInfo`) per module instance,
// and `global-top.vue` does not always share the instance the layout and the
// side editor read from. So a frontmatter write from there would reach the
// server but leave the rendered slide and the editor's textarea stale: a later
// textarea autosave would even write the old frontmatter back. The writer
// publishes the server's response on `window`, and each reader applies it to
// its own copy.

export const SLIDE_INFO_EVENT = 'codeurjc-slidev:slide-info'

export interface PublishedSlideInfo<T = unknown> {
  no: number
  info: T
}

export function publishSlideInfo<T>(no: number, info: T): void {
  window.dispatchEvent(new CustomEvent<PublishedSlideInfo<T>>(SLIDE_INFO_EVENT, { detail: { no, info } }))
}

/** Calls `handler` for every published slide info; returns the unsubscribe function. */
export function onSlideInfoPublished<T>(handler: (published: PublishedSlideInfo<T>) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<PublishedSlideInfo<T>>).detail)
  window.addEventListener(SLIDE_INFO_EVENT, listener)
  return () => window.removeEventListener(SLIDE_INFO_EVENT, listener)
}
