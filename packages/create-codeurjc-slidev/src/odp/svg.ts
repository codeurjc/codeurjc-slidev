import type { Element } from '@xmldom/xmldom'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

// Splits LibreOffice's multi-slide SVG export (`soffice --convert-to svg`) into
// one standalone SVG per slide. The export holds every visible slide in a
// `SlideGroup`, master pages in `<defs>`, a `ooo:meta_slides` table mapping
// each slide group to its master, and a navigation script. A standalone slide
// keeps the root `<svg>` attributes and shared `<defs>`, references its master
// with `<use>`, and contains its own slide group -- no script, no metadata.
// Slides are keyed by their preserved ODP page name (`ooo:name`, e.g. `page16`).

const OOO_NS = 'http://xml.openoffice.org/svg/export'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

function elements(root: Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagName(localName)) as Element[]
}

function childElements(el: Element): Element[] {
  const out: Element[] = []
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1)
      out.push(n as Element)
  }
  return out
}

/** Returns standalone SVG text per ODP page name, for the requested names (or all exported slides). */
export function splitSvgSlides(svg: string, wanted?: Set<string>): Map<string, string> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement as Element | null
  const result = new Map<string, string>()
  if (!root)
    return result

  const masterBySlideId = new Map<string, string>()
  for (const g of elements(root, 'g')) {
    const slideId = g.getAttributeNS(OOO_NS, 'slide')
    const masterId = g.getAttributeNS(OOO_NS, 'master')
    if (slideId && masterId)
      masterBySlideId.set(slideId, masterId)
  }

  const sharedDefs = childElements(root).filter(c => c.localName === 'defs' && c.getAttribute('id') !== 'presentation-animations')

  for (const slide of elements(root, 'g').filter(g => g.getAttribute('class') === 'Slide')) {
    const id = slide.getAttribute('id')
    const page = childElements(slide).find(c => c.getAttribute('class') === 'Page')
    const name = page?.getAttributeNS(OOO_NS, 'name')
    if (!id || !name || id === 'dummy-slide' || (wanted && !wanted.has(name)))
      continue

    const out = root.cloneNode(false) as Element
    for (const defs of sharedDefs) {
      const copy = defs.cloneNode(true) as Element
      for (const meta of elements(copy, 'g').filter(g => g.getAttribute('id') === 'ooo:meta_slides'))
        meta.parentNode?.removeChild(meta)
      out.appendChild(copy)
    }
    const masterId = masterBySlideId.get(id)
    if (masterId) {
      const use = doc.createElementNS(root.namespaceURI ?? 'http://www.w3.org/2000/svg', 'use')
      use.setAttributeNS(XLINK_NS, 'xlink:href', `#${masterId}`)
      out.appendChild(use)
    }
    const container = slide.parentNode as Element | null
    const content = (container && container.getAttribute('id') === `container-${id}` ? container : slide).cloneNode(true) as Element
    content.removeAttribute('visibility')
    out.appendChild(content)
    result.set(name, `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(out)}`)
  }
  return result
}
