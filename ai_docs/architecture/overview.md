# igv.js Architecture Overview

## Four-Layer Architecture

igv.js follows a layered architecture separating concerns into data access, data modeling, rendering, and user interface.

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer                                  │
│  ResponsiveNavbar · MenuPopup · Dialogs · Controls · CursorGuide│
│  (js/ui/, js/responsiveNavbar.ts)                               │
├─────────────────────────────────────────────────────────────────┤
│                     Rendering Layer                              │
│  TrackView · Viewport hierarchy · IGVGraphics · Canvas2SVG       │
│  (js/trackView.ts, js/viewport.ts, js/trackViewport.ts,        │
│   js/igv-canvas.ts, js/canvas2svg.ts)                           │
├─────────────────────────────────────────────────────────────────┤
│                   Data Model Layer                               │
│  TrackBase · ReferenceFrame · Genome · FeatureCache · Locus      │
│  (js/trackBase.ts, js/referenceFrame.ts, js/genome/,            │
│   js/feature/featureCache.ts, js/locus.ts)                      │
├─────────────────────────────────────────────────────────────────┤
│                    Data Access Layer                              │
│  Readers · Sources · Parsers · Index structures                  │
│  (js/bam/, js/bigwig/, js/feature/, js/variant/, js/htsget/,   │
│   js/cram/, js/tdf/, js/genome/)                                │
└─────────────────────────────────────────────────────────────────┘
```

## Core Classes

### Browser (`js/browser.ts`, ~2000 LOC)
The central orchestrator. Each `igv.createBrowser()` call creates one `Browser` instance that:
- Owns the DOM tree (shadow root for CSS isolation)
- Manages the `referenceFrameList` (coordinate system for each locus column)
- Holds the ordered list of `TrackView` objects
- Coordinates the update cycle: `updateViews()` → each TrackView loads features → repaints
- Extends `EventEmitter` via composition (`this.eventEmitter`)
- Manages session load/save, track add/remove, genome switching

### TrackBase (`js/trackBase.ts`, ~800 LOC)
Abstract base class for all track types. Key behaviors:
- **Config merging**: `init()` merges `TrackBase.defaults` → subclass `defaults` → user config
- **State serialization**: `getState()` captures current track configuration for sessions
- **Track properties**: name, color, height, displayMode, visibility window, autoscale
- Uses `[key: string]: any` index signature because config properties are dynamically merged

### TrackView (`js/trackView.ts`, ~1000 LOC)
Container that manages the visual representation of a single track. Owns:
- One `Viewport` per locus column (multi-locus mode creates multiple viewports)
- Axis canvas (left side, shows data range)
- Sample info/name viewports (right side)
- Scrollbar, drag handle, gear menu
- Methods: `updateViews()`, `repaintViews()`, `renderSVGContext()`

### Viewport hierarchy
```
Viewport (js/viewport.ts)
├── TrackViewport (js/trackViewport.ts)  — most tracks
├── IdeogramViewport (js/ideogramViewport.ts)  — ideogram track
└── RulerViewport (js/rulerViewport.ts)  — ruler track
```

`TrackViewport` (~1000 LOC) handles:
- Canvas management (offscreen canvas for drawing, visible canvas for display)
- Feature loading via `track.getFeatures()` / feature source
- `FeatureCache` for caching loaded features per genomic region
- Mouse/touch event handling (click, hover, drag)
- Content scrolling (for tracks taller than the viewport)
- Popup data display on click

### ReferenceFrame (`js/referenceFrame.ts`)
Maps genomic coordinates to pixel coordinates for one locus column:
- `chr`, `start`, `end`, `bpPerPixel` — the coordinate window
- `toPixels(bp)` / `toBP(pixels)` — conversion methods
- `zoomWithScaleFactor()` — zoom centered on a point
- `shiftPixels()` — pan left/right with clamping
- Multi-locus mode: Browser has `referenceFrameList[]`, one per column

### Genome (`js/genome/genome.ts`)
Reference genome representation:
- Chromosome information (names, sizes, cytobands)
- Chromosome name aliasing (e.g., "chr1" ↔ "1")
- Sequence retrieval (FASTA, 2bit)
- Whole-genome view support (cumulative offsets)

## Module Dependency Map

```
                    Browser
                   /   |   \
            TrackView  |  Genome
           /    |      |      \
    Viewport  Track  ReferenceFrame  Sequence
       |      / | \                  Providers
    Canvas   /  |  \
           Source  TrackBase
           / | \
       Reader Parser Index
```

### Data-producing modules (each provides Reader → Source → Track):
| Module | Reader(s) | Source | Track(s) |
|--------|-----------|--------|----------|
| bam | BamReader, CramReader, ShardedBamReader | BamSource | BAMTrack (→ AlignmentTrack + CoverageTrack) |
| bigwig | BWReader | BWSource | WigTrack, FeatureTrack (BigBed) |
| feature | FeatureFileReader, CustomServiceReader | FeatureSource, TextFeatureSource | FeatureTrack, SegTrack, SpliceJunctionTrack, InteractionTrack, MergedTrack |
| variant | (VcfParser via FeatureFileReader) | FeatureSource | VariantTrack |
| gwas | (GwasParser via FeatureFileReader) | FeatureSource | GWASTrack |
| qtl | GTExReader | FeatureSource | QTLTrack |
| tdf | TDFReader | TDFSource | WigTrack |
| hic | — | HicSource | (renders via shoebox) |
| cnvpytor | HDF5IndexedReader | — | CNVPytorTrack |
| gcnv | — | FeatureSource | GCNVTrack |
| shoebox | — | FeatureSource | ShoeboxTrack |

### Support modules:
| Module | Role |
|--------|------|
| genome | Reference genome, chromosomes, sequence access |
| ui | DOM components, dialogs, controls, navbar |
| util | Color scales, LRU cache, file format utils, downsampling |
| types | TypeScript interfaces and type definitions |
| roi | Region of interest management |
| sample | Sample metadata display |
| session | IGV XML session load/save |
| ucsc | UCSC Track Hub integration |
| htsget | HTSget streaming API adapters |
| websocket | Real-time WebSocket communication |
| jbrowse | Circular genome view integration |
| vendor | Vendored third-party libraries |

## Key Design Patterns

### Track Factory Pattern
`js/trackFactory.ts` maps type strings to constructor functions:
```
"alignment" → BAMTrack
"variant"   → VariantTrack
"feature"   → FeatureTrack
...
```
Type aliases map legacy/alternative names: `"annotation"` → `"feature"`, `"junctions"` → `"junction"`.
External code can register custom track types via `registerTrackClass()` / `registerTrackCreatorFunction()`.

### Shadow DOM Isolation
Each Browser attaches a Shadow Root to its parent div. CSS is injected via `CSSStyleSheet` + `adoptedStyleSheets`, preventing style leakage in both directions.

### Event System
Simple pub/sub via `EventEmitter` (js/events.ts):
- `browser.on(eventName, handler)` / `browser.off()` / `browser.fireEvent()`
- Events: `locuschange`, `trackorderchanged`, `genomechange`, `trackclick`, `trackremoved`, etc.
- Only `trackclick` uses the return value (assumes single handler)

### Session Persistence
Browser state can be serialized to JSON or XML:
- `getState()` on each TrackBase captures configuration
- `loadSession()` / `loadSessionObject()` restores full state
- Supports IGV XML sessions for desktop IGV compatibility
