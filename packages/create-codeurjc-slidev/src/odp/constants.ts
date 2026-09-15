// Every heuristic threshold the importer uses, in one place. Values were tuned
// against the 11-deck CodeURJC corpus (see the add-odp-import design); a
// misjudgement surfaces as a reported loss plus a comparison-deck entry, not
// as a silently wrong slide.

/** A shape is a title candidate when its top edge is within this fraction of the page height. */
export const TITLE_BAND_TOP_FRACTION = 0.2
export const TITLE_MAX_CHARS = 90

/** Fraction of a shape's non-whitespace characters that must be monospace for it to be code. */
export const MONO_RATIO = 0.6

/** An in-content heading (lone bold first bullet) can't be longer than this. */
export const HEADING_MAX_CHARS = 80

/**
 * A code line belongs to a highlight rectangle when its vertical center is at
 * least this many line heights inside the rectangle. Center-based (not
 * edge-based) because authors draw highlight boxes with generous padding.
 */
export const LINE_CENTER_MARGIN_LINES = 0.15
/**
 * LibreOffice grows text frames to fit their text, so box height / line count is
 * the real line height when it's close to the font-size estimate; outside this
 * ratio range the box has a fixed height and the font-size estimate is used.
 */
export const BOX_LINE_HEIGHT_RATIO = { min: 0.85, max: 1.25 }
/** A rectangle covering at least this fraction of a code shape's area is a frame around the code, not a highlight. */
export const CODE_FRAME_COVERAGE = 0.9
/** A label becomes a highlight's comment when its top edge is within this distance of the highlight's top edge. */
export const LABEL_TOP_DISTANCE_CM = 1.2
/** Max distance between a connector endpoint and the shape it attaches to. */
export const CONNECTOR_DISTANCE_CM = 0.5
/** A body frame differing from the master's body region by more than this (left/right edge) gets content geometry. */
export const GEOMETRY_TOLERANCE_CM = 0.5
/** How far outside a code shape a filename/project label may sit. */
export const LABEL_DISTANCE_CM = 1.5

/** Line height = font size x this, matching the corpus decks' ~115% paragraph line spacing. */
export const LINE_HEIGHT_FACTOR = 1.17
export const PT_TO_CM = 2.54 / 72
/** Monospace glyph advance, as a fraction of the font size. */
export const MONO_CHAR_WIDTH_EM = 0.6
/** A one-line highlight rectangle narrower than this fraction of its code shape is a substring highlight. */
export const SUBSTRING_MAX_WIDTH_FRACTION = 0.7

/** Cover detection only looks at the first slides of a deck. */
export const COVER_SEARCH_SLIDES = 3

/** Slidev's 16:9 canvas and the theme's default content box, in canvas pixels. */
export const CANVAS = { width: 980, height: 551.25 }
export const THEME_CONTENT_BOX = { x: 31, y: 98, w: 901, h: 424 }

/** Body region used when a deck's master page has no outline placeholder (corpus default for 25.4cm-wide pages). */
export const DEFAULT_BODY_REGION = { x: 1.27, y: 4.457, w: 22.859, h: 12.7 }
export const DEFAULT_BODY_REGION_PAGE_WIDTH = 25.4

export const MONO_FILENAME_RE = /^[\w.-]+\.[a-z0-9]{1,10}$/i
export const PROJECT_LABEL_RE = /^(?:ejem|ejer|ejemplo)[-A-Z_]*\d[-\w]*$/i
export const DATE_RE = /^\d{1,2}[-/]\d{4}$/
