import type { Document, Element } from '@xmldom/xmldom'
import { DOMParser } from '@xmldom/xmldom'

// ODF namespaces used by the importer. Elements/attributes are always looked
// up by namespace URI, never by prefix, since prefixes are just a convention.
export const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  presentation: 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
  anim: 'urn:oasis:names:tc:opendocument:xmlns:animation:1.0',
  loext: 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0',
} as const

export type NsKey = keyof typeof NS

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml')
}

export function is(el: Element, ns: NsKey, localName: string): boolean {
  return el.namespaceURI === NS[ns] && el.localName === localName
}

/** Attribute value by namespace + local name, or undefined. */
export function attr(el: Element, ns: NsKey, localName: string): string | undefined {
  const v = el.getAttributeNS(NS[ns], localName)
  return v === null || v === '' ? undefined : v
}

export function childElements(el: Element): Element[] {
  const out: Element[] = []
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1)
      out.push(n as Element)
  }
  return out
}

export function descendants(el: Document | Element, ns: NsKey, localName: string): Element[] {
  return Array.from(el.getElementsByTagNameNS(NS[ns], localName)) as Element[]
}

export function firstChild(el: Element, ns: NsKey, localName: string): Element | undefined {
  return childElements(el).find(c => is(c, ns, localName))
}

/** Parses an ODF length (`2.5cm`, `10mm`, `1in`, `12pt`) into centimeters. */
export function lengthCm(value: string | undefined): number | undefined {
  if (!value)
    return undefined
  const m = /^(-?\d+(?:\.\d+)?)(cm|mm|in|pt|px)?$/.exec(value.trim())
  if (!m)
    return undefined
  const n = Number(m[1])
  switch (m[2]) {
    case 'mm': return n / 10
    case 'in': return n * 2.54
    case 'pt': return n * 2.54 / 72
    case 'px': return n * 2.54 / 96
    default: return n
  }
}
