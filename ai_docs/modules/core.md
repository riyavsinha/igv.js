# Core Module

## Purpose

The core module (`js/` top-level files) forms the architectural backbone of igv.js. It implements the genome browser's main orchestrator (`Browser`), the track rendering pipeline (`TrackBase` -> `TrackView` -> `Viewport` -> `TrackViewport`), coordinate transformation (`ReferenceFrame`), the public API surface (`index.ts`, `igv-create.ts`), the track type registry (`trackFactory.ts`), and all built-in "chrome" tracks (ruler, ideogram, sequence). Together these files define how genomic data is loaded, laid out, rendered to canvas, exported to SVG, and interacted with by users.

## Genomic Context

A genome browser must solve several fundamental problems: mapping genomic coordinates (base pairs on chromosomes) to pixel coordinates on screen, managing multiple simultaneous "panels" or loci, rendering diverse data types (alignments, variants, annotations, signals) through a common pipeline, and providing navigation controls (zoom, pan, search). The core module addresses all of these concerns, providing the framework that all track-type modules plug into.

## Key Classes & Files

### `browser.ts` -- Browser (Main Orchestrator)

The `Browser` class is the central hub of igv.js, roughly 2,000 lines of code. It manages:

- **DOM structure**: Creates a Shadow DOM root with embedded CSS, containing the navigation bar, column container (for multi-locus panels), and overlay dialogs (input, color picker, data range, slider).
- **Track lifecycle**: `loadTrack(config)` creates tracks via `trackFactory`, wraps them in `TrackView`, manages ordering. `removeTrack(track)` disposes the view. `reorderTracks()` sorts by `track.order`.
- **Reference frames**: `referenceFrameList` holds one `ReferenceFrame` per locus panel. Multi-locus view creates multiple panels side by side.
- **Navigation**: `search(term)` parses locus strings or searches gene names/features. `zoomIn()` / `zoomOut()` scale the bpPerPixel. `gotoMultilocusPanel()` focuses a single panel.
- **Session management**: `loadSession({url})` restores state from JSON/XML. `toJSON()` serializes current state. `compressedSession()` produces a URL-safe compressed string. `loadSessionObject(config)` initializes genome, tracks, loci.
- **Rendering pipeline**: `updateViews()` triggers data loading and repainting across all viewports. `repaintViews()` repaints without reloading data. `visibilityChange()` handles tab switches.
- **SVG export**: `toSVG()` creates a canvas2svg context, renders all tracks into it, and returns SVG markup.
- **Event system**: Delegates to `EventEmitter` via `on()`, `off()`, `fireEvent()`. Key events: `locuschange`, `trackremoved`, `trackorderchanged`, `trackclick`, `trackdrag`, `columnlayoutchange`.
- **Mouse/touch handling**: Complex drag, scroll, and click handling on the column container. Distinguishes between drag-to-pan, drag-to-scroll (vertical), drag-to-reorder-tracks, and click events using configurable thresholds.
- **Layout management**: `layoutChange()` recalculates viewport widths accounting for axis, scrollbar, drag handle, gear menu, sample info, and sample name columns. `calculateViewportWidth()` computes available width for genomic data.
- **ROI (Regions of Interest)**: `roiManager` handles loading, displaying, and managing regions of interest overlays.
- **Sample info/names**: Manages sample metadata display in dedicated viewports alongside tracks.
- **Circular view integration**: Optional JBrowse circular view for structural variant visualization.

Key declared fields include: `config`, `genome`, `referenceFrameList`, `trackViews`, `sampleInfo`, `roiManager`, `navbar`, `columnContainer`, `eventEmitter`, `qtlSelections`.

### `trackBase.ts` -- TrackBase (Abstract Base)

The abstract base class for all data tracks (roughly 800 lines). Responsibilities:

- **Config merging**: `init(config)` merges class-specific `defaults` with user config into `this` properties. Uses an index signature (`[key: string]: any`) because track properties are dynamically set from config.
- **Standard properties**: `name`, `url`, `type`, `id`, `order`, `height`, `color`, `altColor`, `visibilityWindow`, `displayMode`, `autoHeight`, `autoscale`, `dataRange`, `featureSource`, etc.
- **Feature retrieval**: Provides a default `getFeatures(chr, start, end, bpPerPixel)` that delegates to `this.featureSource`.
- **Click handling**: `clickedFeatures(clickState)` finds features under the click from cached viewport data. `popupData(clickState)` generates popup content.
- **Menu items**: `menuItemList()` returns standard menu items (track name, height adjustment, color picker, display mode, auto-scale, data range dialog, filter dialog). Subclasses override/extend.
- **State persistence**: `getState()` serializes track config for session save. Preserves URL, name, color, height, display mode, auto-scale settings.
- **Static utilities**: `getCravatLink()` generates links to the CRAVAT cancer variant annotation tool for SNPs. `inferTrackType()` determines track type from file extension.
- **Filter support**: `setFilter(filter)` applies a feature filter function, `getFilterableAttributes()` returns attributes available for filtering.

### `trackView.ts` -- TrackView (Track Container)

Wraps a `Track` with its DOM elements and manages the track's row in the browser layout:

- **DOM structure**: Creates axis column, viewport column(s), sample info viewport, sample name viewport, scrollbar, drag handle, and gear menu.
- **Viewport management**: `createViewports()` instantiates the correct viewport type (TrackViewport, RulerViewport, IdeogramViewport) for each reference frame.
- **Rendering**: `updateViews()` loads features and repaints. `repaintViews()` repaints from cache. `renderSVGContext(context, ...)` renders track content into a C2S SVG context.
- **Auto-scale**: Coordinates auto-scaling across viewports and auto-scale groups.
- **Content height**: `checkContentHeight()` computes the required pixel height and adjusts scrollable content.
- **Scrolling**: Track scrollbar allows vertical scrolling of tall content (e.g., dense alignment tracks).
- **Drag reordering**: Drag handle enables track reordering via mouse drag.

Key field: `viewports: Viewport[]` -- one viewport per locus panel.

### `viewport.ts` -- Viewport (Base Class)

The base viewport class that all viewport types extend:

- **DOM element**: Creates a `div.igv-viewport` element appended to the viewport column.
- **Dimensions**: `setWidth()`, `setHeight()`, `contentTop`, `contentHeight` manage the viewport's visible area.
- **Abstract interface**: Declares empty/default implementations for `initializationHelper()`, `loadFeatures()`, `repaint()`, `draw()`, `clearCache()`, `shift()`, `checkZoomIn()`, `startSpinner()`, `stopSpinner()`, `setTrackLabel()` -- all overridden by subclasses.
- **Messages**: `showMessage()` / `hideMessage()` for displaying status text (e.g., error messages).
- **Alert dialog**: Creates an `AlertDialog` for the sequence track (used to copy reference sequence).

### `trackViewport.ts` -- TrackViewport (Data Viewport)

Extends `Viewport` with full data rendering capabilities (the workhorse viewport for most tracks):

- **Canvas rendering**: Maintains an off-screen `canvas` element. `repaint()` configures a hi-DPI canvas, builds a `DrawConfiguration`, and calls `track.draw()`. The drawn canvas is positioned via CSS transforms for smooth scrolling and panning.
- **Feature caching**: `FeatureCache` stores loaded features with their genomic range. `loadFeatures()` fetches data from the track's feature source when the cache doesn't cover the current view. Prevents redundant loads with a `loading` sentinel.
- **Zoom-in notice**: Shows "Zoom in to see features" when bpPerPixel exceeds the track's visibility window.
- **Track labels**: Creates and manages per-viewport track labels with click-to-expand popovers.
- **Click/hover handling**: Translates mouse events to genomic coordinates, delegates to `track.clickedFeatures()` and `track.popupData()`. Supports single-click popovers, double-click zoom, long-press context menus, and hover updates.
- **Selection**: Implements drag-to-select regions (used by ruler sweeper).
- **ROI overlay**: Renders region-of-interest highlights on top of track data.
- **Shift optimization**: `shift()` reuses the existing canvas by translating it when panning small distances, only repainting the newly exposed region.

### `referenceFrame.ts` -- ReferenceFrame (Coordinate Transformation)

Maps between genomic (base pair) coordinates and pixel coordinates:

- **Core state**: `chr`, `start`, `end`, `bpPerPixel`, `genome`.
- **Coordinate conversion**: `toPixels(bp)` converts base pairs to pixels. `toBP(pixels)` converts pixels to base pairs.
- **Navigation**: `shift(delta)` moves by base pairs. `shiftPixels(pixels, viewportWidth, clamp)` moves by pixels with optional clamping to chromosome boundaries. `zoomWithScaleFactor()` zooms centered on a point.
- **Clamping**: `clampStart()` prevents panning past chromosome boundaries.
- **Display strings**: `getLocusString()`, `getMultiLocusLabel()`, `getPresentationLocusComponents()` format the current locus for display in the navigation bar and ruler labels.
- **Factory function**: `createReferenceFrameList(loci, genome, ...)` creates reference frames from parsed locus objects, applying flanking regions and genomic extent validation.

### `igv-create.ts` -- Browser Factory

The entry point for creating igv.js browser instances:

- **`createBrowser(parentDiv, config)`**: The main public API function. Initializes known genomes, sets defaults, configures authentication (Google OAuth, API keys), creates a `Browser` instance, loads the session or config, and optionally starts a WebSocket client. Returns the Browser instance.
- **`removeBrowser(browser)`**: Disposes and removes a browser instance.
- **`removeAllBrowsers()`**: Removes all browser instances.
- **`visibilityChange()`**: Notifies all browsers of visibility changes.
- **`extractQuery(config)`**: Parses URL query parameters for IGV desktop-style URL parameters (`file`, `index`, `name`, `genome`, `locus`, `session`).
- **`createTrack(config, browser)`**: Creates a standalone track without adding it to the browser.

Manages a module-level `allBrowsers` array tracking all active instances.

### `trackFactory.ts` -- Track Type Registry

Maps track type strings to constructor functions:

- **Registry**: A `Map<string, TrackCreator>` mapping type names to factory functions. Pre-registered types: `ideogram`, `sequence`, `feature`, `seg`, `mut`, `maf`, `shoebox`, `wig`, `merged`, `alignment`, `interaction`, `interact`, `variant`, `qtl`, `eqtl`, `gwas`, `arc`, `gcnv`, `junction`, `blat`, `cnvpytor`, `image`.
- **`getTrack(type, config, browser)`**: Resolves aliases (e.g., `annotation` -> `feature`, `junctions` -> `junction`) and instantiates the track.
- **Extension points**: `registerTrackClass(type, trackClass)` and `registerTrackCreatorFunction(type, creator)` allow third-party track types to be registered.
- **`knownTrackTypes()`**: Returns the set of all registered type names.

### `events.ts` -- EventEmitter

A simple publish/subscribe event system:

- **`on(eventName, fn)`**: Register a handler.
- **`off(eventName?, fn?)`**: Remove specific handler, all handlers for an event, or all handlers.
- **`emit(eventName, args?, thisObj?)`**: Fire an event, returning the first handler's result (used by `trackclick` event).
- Handlers stored in a `Map<string, EventHandler[]>`.

### `index.ts` -- Public API

Defines the `igv` default export object with all public API functions and classes: `createBrowser`, `removeBrowser`, `removeAllBrowsers`, `visibilityChange`, `createTrack`, `version`, `setApiKey`, `setGoogleOauthToken`, `setOauthToken`, `setCORSProxy`, `oauth`, `registerTrackClass`, `registerTrackCreatorFunction`, `registerFileFormats`, `loadSessionFile`, `loadHub`, `uncompressSession`, `createIcon`, `createWebSocketClient`, plus utility classes `TrackBase`, `TrackUtils`, `IGVGraphics`, `MenuUtils`, `DataRangeDialog`, `AlertDialog`.

### `sequenceTrack.ts` -- SequenceTrack

Renders the DNA reference sequence at high zoom levels:

- **Threshold**: Only renders when `bpPerPixel < 10` (the `bppSequenceThreshold` constant).
- **Features**: Displays color-coded nucleotide letters (A=green, C=blue, G=yellow, T=red by default via `nucleotideColors`).
- **Three-frame translation**: Optional mode that shows amino acid translations in all three reading frames below the sequence, increasing track height from 25px to 115px.
- **Reverse complement**: Toggle to show the reverse strand.
- **BLAT integration**: Context menu option to BLAT-search the visible sequence.
- **Non-removable**: Has `removable = false` and a fixed order at the very bottom of the track stack (`Number.MIN_SAFE_INTEGER`).

### `rulerTrack.ts` -- RulerTrack

Renders the genomic coordinate ruler at the top of the browser:

- **Tick marks**: Draws major and minor tick marks with base pair labels, automatically choosing appropriate intervals based on zoom level.
- **Whole genome view**: In whole-genome mode, draws chromosome boundaries with alternating colors and chromosome labels.
- **Fixed properties**: Non-removable, no gear menu, no track menu, fixed height of 40px, order just above sequence track.

### `rulerViewport.ts` -- RulerViewport

Extends `TrackViewport` with ruler-specific UI elements:

- **Multi-locus controls**: Close button (X) to remove a locus panel, clickable label showing the current locus/region.
- **Tooltip**: Displays genomic coordinates on hover with automatic timeout (10 seconds).
- **Locus label**: Shows chromosome, start-end, and region size. Clickable to focus on that panel.
- **Whole genome chromosomes**: In whole-genome view, renders clickable chromosome segments.

### `rulerSweeper.ts` -- RulerSweeper

Implements click-and-drag region selection on the ruler:

- **Sweep to zoom**: User drags across the ruler to select a genomic region, which then becomes the new view.
- **Visual feedback**: Shows a semi-transparent blue overlay (`rgba(68, 134, 247, 0.25)`) during the drag.
- **ROI creation**: If a region of interest is being defined, the sweeper creates it instead of zooming.
- **Observer pattern**: Listens to `locuschange` events to enable/disable mouse handlers (disabled in whole-genome view).

### `ideogramTrack.ts` -- IdeogramTrack

Renders a chromosome ideogram (cytogenetic banding pattern) at the very top of the browser:

- **Cytoband rendering**: Draws the characteristic chromosome shape with colored bands representing cytogenetic staining patterns (gneg, gpos25-100, acen, gvar, stalk).
- **Optional cytoband names**: Configurable display of cytoband names within the ideogram.
- **Fixed properties**: Non-removable, no gear menu, fixed height (16-20px), lowest possible order value.

### `ideogramViewport.ts` -- IdeogramViewport

Extends `TrackViewport` with ideogram-specific behavior:

- **Cytoband caching**: Custom `IdeogramFeatureCache` keyed by chromosome name.
- **Red box overlay**: Draws a red rectangle indicating the currently visible region within the full chromosome.
- **Mouse interaction**: Click on the ideogram navigates to that chromosomal region. Hover shows cytoband tooltip with band name.
- **SVG rendering**: Custom `renderSVGContext()` for SVG export.

### `igv-canvas.ts` -- IGVGraphics (Canvas Utilities)

A collection of static helper functions for canvas rendering:

- **Hi-DPI support**: `configureHighDPICanvas(ctx, w, h)` scales canvas for Retina/high-DPI displays.
- **Drawing primitives**: `strokeLine()`, `fillRect()`, `fillPolygon()`, `strokePolygon()`, `fillCircle()`, `strokeCircle()`, `fillText()`, `strokeText()`, `fillTextInRect()` -- all accept an optional `properties` object applied to the context.
- **Convenience**: All coordinates are floor'd and offset by 0.5px for crisp line rendering on canvas.

### `locus.ts` -- Locus

A simple data class representing a genomic interval:

- **Fields**: `chr`, `start`, `end`.
- **Methods**: `contains(locus)`, `overlaps(locus)`, `extend(locus)`, `getLocusString()`.
- **Parsing**: `Locus.fromLocusString("chr1:1,000-2,000")` parses locus strings. `Locus.isSingleBaseLocusString()` detects single-position loci.
- Used throughout the codebase for region arithmetic.

### `search.ts` -- Search

Implements the search box functionality:

- **Multi-locus search**: Splits input by spaces, resolves each term independently, creates multiple reference frames for multi-locus view.
- **Search cascade**: Tries each approach in order:
  1. HGVS notation (e.g., "NM_000546.6:c.215C>G")
  2. "all" / "*" for whole-genome view
  3. Locus string parsing (e.g., "chr1:1000-2000")
  4. Feature search across searchable tracks
  5. Web service search (configurable URL, defaults to igv.org/genomes/locus.php)
- Returns an array of locus objects used to create reference frames.

### `searchFeatures.ts` -- Feature Search

Implements feature-name search across loaded tracks and web services:

- **Local search**: Queries MANE transcripts from the genome, then searches all tracks with `searchable = true`.
- **Web service**: Configurable REST endpoint with template variables `$GENOME$` and `$FEATURE$`. Supports plain text and JSON response formats.
- **Default service**: `https://igv.org/genomes/locus.php?genome=$GENOME$&name=$FEATURE$`

### `binary.ts` -- BinaryParser

Low-level binary data parser for reading binary file formats:

- **DataView wrapper**: Wraps a `DataView` with a position cursor and convenience methods.
- **Type readers**: `getByte()`, `getShort()`, `getUShort()`, `getInt()`, `getUInt()`, `getLong()`, `getFloat()`, `getDouble()`.
- **String readers**: `getString()` (null-terminated), `getFixedLengthString(len)`, `getFixedLengthTrimmedString(len)`.
- **Endianness**: Configurable little/big endian (defaults to little-endian).
- Used by BAM, bigBed, bigWig, TDF, and other binary format readers.

### `canvas2svg.ts` -- Canvas2SVG (C2S)

A vendored library (Canvas2SVG v1.0.19) that implements a mock `CanvasRenderingContext2D` that builds an SVG document:

- **`@ts-nocheck`**: Vendored code with minimal typing at the boundary.
- **C2SContext type**: Exported as `CanvasRenderingContext2D & C2SVGExtensions`, allowing it to flow into `DrawConfiguration.context` without casts.
- **SVG-specific methods**: `saveWithTranslationAndClipRect()`, `setHeight()`, `getSerializedSvg()`.
- Used by `Browser.toSVG()` and `TrackView.renderSVGContext()` to export the entire browser view as an SVG image.

### `responsiveNavbar.ts` -- ResponsiveNavbar

The navigation bar at the top of the browser:

- **Components**: IGV logo, genome selector, chromosome dropdown (`ChromosomeSelectWidget`), search input, window size panel, zoom widget.
- **Toggle buttons**: Overlay track, multi-track select, cursor guide, center line, track labels, ROI table, sample info, sample names, save image.
- **Responsive layout**: `navbarDidResize()` adapts button presentation (text vs. icon) based on available width.
- **Search integration**: Search input dispatches to `browser.search()` and updates locus display.

### `viewportColumnManager.ts` -- Viewport Column Manager

Utility object for managing DOM columns in multi-locus view:

- **`createColumns(container, count)`**: Creates viewport column divs with shim separators.
- **`removeColumnAtIndex(i, column)`**: Removes a column and its adjacent shim.
- **`insertAfter(referenceElement)`**: Inserts a new column after the given element.
- **`insertBefore(referenceElement, count)`**: Inserts columns before the given element.
- **`indexOfColumn(container, column)`**: Returns the index of a column within the container.

### `windowSizePanel.ts` -- WindowSizePanel

Displays the current viewport width in base pairs:

- Listens to `locuschange` events and updates the display.
- Shows formatted base pair count (e.g., "1.5 Mb") in single-locus mode.
- Hidden in multi-locus mode (empty string).

## Data Flow

The core rendering pipeline follows this path:

```
User Action (navigate, zoom, resize, load track)
  |
  v
Browser -- updates ReferenceFrame(s), triggers updateViews()
  |
  v
TrackView.updateViews() -- for each track
  |
  v
TrackViewport.loadFeatures() -- fetches data via Track.getFeatures()
  |                              which delegates to FeatureSource
  |                              (from feature module)
  v
FeatureCache -- stores features with genomic range
  |
  v
TrackViewport.repaint() -- creates DrawConfiguration:
  |   { context, pixelWidth, pixelHeight, bpPerPixel,
  |     bpStart, pixelTop, features, referenceFrame, ... }
  |
  v
Track.draw(drawConfiguration) -- renders to canvas context
  |                                (track-type specific rendering)
  v
Canvas element positioned in DOM via CSS transform
  |
  v
(Optional) ROI overlay rendered on top
  |
  v
User sees rendered track in viewport
```

For SVG export:
```
Browser.toSVG()
  |
  v
Creates C2S context (Canvas2SVG)
  |
  v
TrackView.renderSVGContext() -- for each track
  |
  v
Track.draw() with C2S context -- builds SVG DOM
  |
  v
C2S.getSerializedSvg() -- returns SVG markup string
```

Multi-locus view:
```
Browser.search("chr1:1000-2000 chr2:3000-4000")
  |
  v
Creates 2 ReferenceFrames
  |
  v
viewportColumnManager.createColumns(container, 2)
  |
  v
Each TrackView creates 2 viewports (one per column)
  |
  v
Each viewport renders independently with its own ReferenceFrame
```

## Dependencies

### External Dependencies:
- `igv-utils` -- provides `igvxhr` (HTTP/XHR), `StringUtils`, `IGVColor`, `FileUtils`, `URIUtils`, `BGZip`, `FeatureUtils`, `IGVMath`, `GoogleAuth`
- Shadow DOM and `CSSStyleSheet` APIs for style isolation

### Internal Module Dependencies:
- `js/genome/` -- genome loading, chromosome data, sequence retrieval
- `js/feature/` -- `FeatureSource`, `FeatureTrack`, `WigTrack`, `SegTrack`, etc.
- `js/bam/` -- `BAMTrack` and alignment data
- `js/variant/` -- `VariantTrack` and VCF data
- `js/qtl/` -- `QTLTrack` and eQTL data
- `js/gwas/` -- `GWASTrack`
- `js/roi/` -- `ROIManager`, `ROISet`, `TrackROISet`
- `js/sample/` -- `SampleInfo`, `SampleInfoViewport`, `SampleNameViewport`
- `js/ui/` -- all UI components (dialogs, menus, controls, icons)
- `js/websocket/` -- WebSocket remote control
- `js/session/` -- XML session parsing
- `js/jbrowse/` -- circular view integration
- `js/ucsc/` -- UCSC hub loading, image tracks
- `js/util/` -- various utilities (colors, file formats, DOM helpers, autoscale)

### Depended on by:
- Every track type module depends on `TrackBase`, `Browser`, and the viewport hierarchy.
- External consumers use `igv.createBrowser()` from `index.ts` as the primary entry point.
- The WebSocket module depends on `Browser` for command execution.
- Session save/restore depends on `Browser.toJSON()` / `Browser.loadSession()`.
