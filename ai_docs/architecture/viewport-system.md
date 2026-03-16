# Viewport System

## Viewport Hierarchy

```
Viewport (js/viewport.ts)
│   Base class — DOM element creation, height/width management,
│   content scrolling, dispose pattern
│
├── TrackViewport (js/trackViewport.ts, ~1000 LOC)
│   Used by most tracks. Handles:
│   - Offscreen canvas rendering
│   - Feature loading + caching (FeatureCache)
│   - Mouse/touch event handling
│   - Popup data display
│   - SVG export
│   - Content scrolling for tall tracks
│   - Spinner overlay during loading
│
├── IdeogramViewport (js/ideogramViewport.ts)
│   Specialized for the ideogram (karyotype) track.
│   - Draws cytogenetic bands
│   - Click-to-navigate behavior
│   - No scrollbar needed
│
└── RulerViewport (js/rulerViewport.ts)
    Specialized for the ruler/coordinate track.
    - Draws tick marks and coordinate labels
    - Locus label in multi-locus mode
    - Region sweep interaction (click-drag to zoom)
    - Uses RulerSweeper (js/rulerSweeper.ts) for sweep UI
```

## Viewport Selection

When a TrackView is created, `createViewport()` (`js/util/viewportUtils.ts`) selects the correct viewport class:

```typescript
function createViewport(trackView, viewportColumn, referenceFrame, width) {
    const track = trackView.track
    if (track.type === 'ideogram') return new IdeogramViewport(...)
    if (track.type === 'ruler')    return new RulerViewport(...)
    return new TrackViewport(...)
}
```

## Multi-Locus Mode

igv.js supports viewing multiple genomic regions simultaneously. Each region gets its own column, and each column has its own `ReferenceFrame`.

```
Browser.referenceFrameList = [RF₁, RF₂, RF₃]

┌───────────────────────────────────────────────────┐
│ Axis │ Viewport₁  │ Viewport₂  │ Viewport₃  │ Sc│
│      │ (RF₁)      │ (RF₂)      │ (RF₃)      │   │
│      │ chr1:1-100 │ chr2:50-150│ chr3:1-200 │   │
└───────────────────────────────────────────────────┘
```

`ViewportColumnManager` (`js/viewportColumnManager.ts`) manages the creation and layout of viewport columns:
- Creates `<div class="igv-column">` elements between axis and scrollbar
- Handles shim elements between columns (visual separators)
- Adjusts column widths on browser resize

## ReferenceFrame

`ReferenceFrame` (`js/referenceFrame.ts`) is the coordinate system for each viewport column:

### Properties
- `chr` — Chromosome name
- `start` — Start position in base pairs
- `end` — End position in base pairs
- `bpPerPixel` — Zoom level (base pairs per pixel)
- `genome` — Reference to the Genome object

### Coordinate Conversion
```
Genomic position → Pixel position:  (bp - start) / bpPerPixel
Pixel position → Genomic position:  start + pixel * bpPerPixel
```

Helper methods:
- `toPixels(bp)` — Convert base pairs to pixels
- `toBP(pixels)` — Convert pixels to base pairs
- `calculateEnd(pixels)` — Compute end position for a given viewport width
- `shiftPixels(pixels, viewportWidth, clamp)` — Pan, optionally clamped to chromosome bounds
- `zoomWithScaleFactor(browser, factor, viewportWidth, centerBP)` — Zoom in/out

### Whole Genome View
When `chr === 'all'`, the reference frame shows the entire genome. Chromosomes are laid out end-to-end with cumulative offsets computed by `Genome.getCumulativeOffset()`.

### Factory
`createReferenceFrameList()` creates a list of reference frames from locus specifications:
```typescript
createReferenceFrameList(loci, genome, flanking, minimumBases, viewportWidth, isSoftclipped)
```

## TrackViewport Rendering Pipeline

### Canvas Architecture
TrackViewport uses an offscreen canvas pattern:

```
1. Create offscreen canvas (sized to content area)
2. Get 2D rendering context
3. Apply HiDPI scaling (devicePixelRatio)
4. Call track.draw(drawConfiguration)
5. Draw ROI overlays
6. Copy to visible canvas element (accounting for scroll offset)
```

### Feature Loading
```typescript
async loadFeatures() {
    // Check if features are already cached for this region
    if (featureCache covers current viewport region) return cached

    // Calculate query region (with padding for smooth scrolling)
    const queryRegion = {chr, start: start - padding, end: end + padding}

    // Fetch from track's feature source
    const features = await track.getFeatures(chr, start, end, bpPerPixel)

    // Store in feature cache
    this.featureCache = new FeatureCache(chr, start, end, bpPerPixel, features)
}
```

### Mouse Event Handling
TrackViewport processes mouse events for:
- **Click** — Show popup data (`track.popupData()`)
- **Hover** — Tooltip display
- **Drag** — Pan the view (horizontal) or scroll content (vertical)
- **Double-click** — Zoom in centered on click position
- **Right-click** — Context menu

Events are captured at the viewport level, coordinates are translated to genomic positions via `ReferenceFrame`, and delegated to the track for data-specific behavior.

### Content Scrolling
For tracks taller than the viewport (e.g., many aligned reads):
- `contentTop` tracks the scroll offset
- The offscreen canvas is sized to `contentHeight` (full feature area)
- Only the visible portion is copied to the viewport canvas
- Scrollbar in the scrollbar column reflects and controls scroll position

## SVG Export

Each viewport can export its content as SVG:
```typescript
renderSVGContext(context: C2SContext, delta: {deltaX, deltaY}) {
    // C2SContext wraps SVG generation with Canvas2D API
    context.saveWithTranslationAndClipRect(...)
    track.draw({context, features, ...})
    // ROI overlays drawn on top
    context.restore()
}
```

The `C2SContext` from `canvas2svg.ts` implements `CanvasRenderingContext2D` but generates SVG elements instead of rasterizing. This allows all track `draw()` methods to work unchanged for both canvas and SVG output.
