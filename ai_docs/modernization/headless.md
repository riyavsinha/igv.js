# Headless Mode Design

## Current DOM Coupling

An audit of the codebase reveals **~107 `document.*` calls across 30 files** and **~27 `window.*` references across 11 files**. These are concentrated in:

### Heavy DOM usage (rendering + UI)
| File | `document.*` calls | Role |
|------|-------------------|------|
| `js/responsiveNavbar.ts` | 18 | Navigation bar construction |
| `js/trackViewport.ts` | 16 | Canvas creation, mouse handlers |
| `js/ui/components/dataRangeDialog.ts` | 11 | Data range editor form |
| `js/ui/components/table.ts` | 6 | Table UI component |
| `js/browser.ts` | 5 | Shadow DOM, spinner, column container |
| `js/rulerViewport.ts` | 5 | Ruler canvas, sweep overlay |
| `js/ui/menuPopup.ts` | 5 | Context menu creation |
| `js/ui/components/segFilterDialog.ts` | 5 | Filter dialog form |

### Light DOM usage (mixed data + rendering)
| File | `document.*` calls | Role |
|------|-------------------|------|
| `js/trackBase.ts` | 4 | Canvas for text measurement |
| `js/ideogramViewport.ts` | 3 | Canvas creation |
| `js/viewport.ts` | 2 | Viewport div creation |
| `js/bam/alignmentTrack.ts` | 2 | Canvas for text measurement |
| `js/feature/segTrack.ts` | 2 | Canvas for text measurement |
| `js/shoebox/shoeboxTrack.ts` | 2 | Canvas for text measurement |

### DOM-free data modules (no changes needed)
All reader, parser, and source modules are already DOM-free:
- `js/bam/bamReader.ts`, `bamSource.ts`, `bamAlignment.ts`, etc.
- `js/bigwig/bwReader.ts`, `bwSource.ts`
- `js/feature/featureFileReader.ts`, `featureParser.ts`, `featureSource.ts`
- `js/variant/vcfParser.ts`, `variant.ts`
- `js/genome/genome.ts`, `indexedFasta.ts`, `twobit.ts`
- All files in `js/types/`

## Separation Strategy

### Layer 1: Pure Data (no DOM)
Already clean — readers, parsers, sources, data models, types.

### Layer 2: Rendering (canvas context only)
Track `draw()` methods need a `CanvasRenderingContext2D` but don't create DOM elements. They can work with `node-canvas` or `OffscreenCanvas`.

**Exception: text measurement.** Several tracks create temporary `document.createElement('canvas')` for `ctx.measureText()`. This is the primary DOM dependency in track classes.

**Fix:** Create a `TextMeasurer` interface:
```typescript
interface TextMeasurer {
    measureText(text: string, font: string): { width: number; height: number }
}
```
- Browser implementation: uses a shared offscreen canvas
- Node.js implementation: uses `node-canvas`
- Test implementation: returns estimated widths

### Layer 3: Browser/UI (full DOM)
The Browser class, Viewport hierarchy, and all UI components require DOM.

## Headless Browser Design

```typescript
// Headless browser — data operations only
class HeadlessBrowser {
    genome: Genome
    referenceFrameList: ReferenceFrame[]
    tracks: TrackData[]  // Data-only track wrappers

    constructor(config: BrowserConfig)

    // Data operations
    async loadGenome(config): Promise<Genome>
    async loadTrack(config): Promise<TrackData>
    async getFeatures(trackIndex, chr, start, end): Promise<unknown[]>
    async search(query): Promise<LocusLike>
    setLocus(locus: string | LocusLike): void

    // Rendering (requires canvas provider)
    render(canvasProvider: CanvasProvider): RenderedOutput
    toSVG(): string
    toPNG(canvasProvider: CanvasProvider): Buffer

    // Session
    toJSON(): SessionObject
    loadSession(session: SessionObject): Promise<void>
}

interface CanvasProvider {
    createCanvas(width: number, height: number): CanvasRenderingContext2D
    createTextMeasurer(): TextMeasurer
}
```

### Node.js usage example
```typescript
import { HeadlessBrowser, NodeCanvasProvider } from '@igv/core'
import { createCanvas } from 'canvas'  // node-canvas

const provider = new NodeCanvasProvider(createCanvas)
const browser = new HeadlessBrowser({ genome: 'hg38' })
await browser.loadTrack({ url: 'sample.bam', type: 'alignment' })
browser.setLocus('chr1:1000-2000')

// Get data
const features = await browser.getFeatures(0, 'chr1', 1000, 2000)

// Render to PNG
const png = browser.toPNG(provider)
fs.writeFileSync('screenshot.png', png)

// Render to SVG (no canvas provider needed)
const svg = browser.toSVG()
```

## Implementation Steps

1. **Extract TextMeasurer** — Replace all `document.createElement('canvas')` for text measurement with injectable `TextMeasurer`
2. **Create CanvasProvider interface** — Abstract canvas creation away from `document`
3. **Split Browser into DataBrowser + UIBrowser** — DataBrowser has no DOM deps, UIBrowser extends it with DOM
4. **Create HeadlessBrowser** — Wraps DataBrowser with a clean API
5. **Add node-canvas adapter** — Implement CanvasProvider for Node.js
6. **Add test adapter** — Mock CanvasProvider for unit tests

## Window API Dependencies

| Usage | Files | Headless alternative |
|-------|-------|---------------------|
| `window.devicePixelRatio` | trackViewport, sampleViewports, browser | Config option (default: 1) |
| `window.addEventListener('resize')` | browser | No-op in headless |
| `window.location.href` | igv-create (query params) | Config-based locus |
| `window.innerWidth/Height` | browser | Config-provided dimensions |
| `window.getComputedStyle` | sampleViewports | Return default values |
