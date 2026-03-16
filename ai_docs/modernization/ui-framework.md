# UI Framework Modernization

## Current UI Architecture

igv.js uses **vanilla DOM manipulation** for all UI. The `js/ui/` directory has ~45 files across 4 subdirectories:
- Top-level: menuPopup, alert, cursorGuide, zoomWidget, chromosomeSelect, etc.
- `components/`: dialogs (alertDialog, inputDialog, dataRangeDialog, colorPicker, etc.)
- `navbarIcons/`: toolbar buttons (save, ROI, sample info, etc.)
- `utils/`: DOM utilities, icons, draggable, color palettes

### Pain points
1. **Manual DOM construction** — Every component manually creates elements via `document.createElement`, sets classes, appends children
2. **No reactive state** — UI updates require explicitly finding and modifying DOM elements
3. **Tightly coupled** — Browser owns all dialogs, controls own their DOM directly
4. **No component lifecycle** — Disposal is manual property nullification
5. **CSS via shadow DOM** — Good isolation, but CSS is a monolithic string injected at once
6. **Event handling is ad-hoc** — Mix of event delegation, direct `addEventListener`, and custom handlers

## Framework Evaluation

### Option 1: React
**Pros:** Largest ecosystem, most developers know it, excellent devtools, strong TypeScript support
**Cons:** Runtime dependency (~40KB), JSX build step, virtual DOM overhead for canvas-heavy app
**Best for:** Teams that already use React, complex interactive UIs

### Option 2: Svelte
**Pros:** No runtime, compiles to vanilla JS, excellent performance, small bundle
**Cons:** Smaller ecosystem, fewer developers familiar, less mature TypeScript support
**Best for:** Performance-sensitive applications, small bundle requirements

### Option 3: Web Components (Lit)
**Pros:** Framework-agnostic, works everywhere, already using shadow DOM, no build step required
**Cons:** Less ergonomic than React/Svelte, weaker ecosystem, state management is manual
**Best for:** Library authors who need to support all frameworks

### Recommendation: Web Components with optional React/Svelte wrappers
Since igv.js is a library consumed by other applications (not an app itself), Web Components provide the best interop. Thin React/Svelte wrappers can be published as separate packages.

## Component Extraction Plan

### Tier 1: Self-contained components (easiest)
These components have minimal external dependencies:
- `AlertDialog` → `<igv-alert>`
- `InputDialog` → `<igv-input-dialog>`
- `DataRangeDialog` → `<igv-data-range-dialog>`
- `GenericColorPicker` → `<igv-color-picker>`
- `ChromosomeSelectWidget` → `<igv-chromosome-select>`
- `ZoomWidget` → `<igv-zoom-controls>`

### Tier 2: Connected components (medium)
These need data from the browser but are conceptually independent:
- `ResponsiveNavbar` → `<igv-navbar>` (needs genome info, locus, button states)
- `MenuPopup` → `<igv-context-menu>` (needs track menu items)
- `ROITable` → `<igv-roi-table>` (needs ROI data)
- `CursorGuide` → `<igv-cursor-guide>` (needs viewport coordinates)

### Tier 3: Core rendering (hardest)
These are deeply integrated with the rendering pipeline:
- `TrackView` → `<igv-track>` (manages viewports, axis, scrollbar)
- `TrackViewport` → `<igv-viewport>` (canvas, mouse events, feature loading)
- `Browser` → `<igv-browser>` (top-level orchestrator)

## Event System Modernization

### Current system limitations
- No typed events (all handlers are `(...args: unknown[]) => unknown`)
- Synchronous only
- No scoped subscriptions
- No middleware

### Proposed typed event system
```typescript
// Event type definitions
interface BrowserEvents {
    locuschange: { referenceFrames: ReferenceFrame[] }
    genomechange: { genome: Genome }
    trackclick: { track: Track; features: PopupData[]; genomicLocation: number }
    trackadded: { track: Track }
    trackremoved: { track: Track }
    trackorderchanged: { order: number[] }
}

// Typed event bus
class TypedEventBus<Events extends Record<string, unknown>> {
    on<K extends keyof Events>(event: K, handler: (data: Events[K]) => void | Promise<void>): Unsubscribe
    once<K extends keyof Events>(event: K, handler: (data: Events[K]) => void | Promise<void>): Unsubscribe
    emit<K extends keyof Events>(event: K, data: Events[K]): Promise<void>

    // Middleware
    use<K extends keyof Events>(event: K, middleware: (data: Events[K], next: () => void) => void): void
}

type Unsubscribe = () => void
```

### Integration with Web Components
```typescript
// Components emit CustomEvents
class IGVViewport extends HTMLElement {
    // When a feature is clicked:
    this.dispatchEvent(new CustomEvent('igv-trackclick', {
        bubbles: true,
        composed: true,  // crosses shadow DOM boundary
        detail: { track, features, genomicLocation }
    }))
}

// Parent components or users can listen:
browser.addEventListener('igv-trackclick', (e) => {
    console.log(e.detail.features)
})
```

## Custom Browser Builder Vision

The end goal: users compose their own genome browsers from components.

### Minimal browser (data only)
```html
<igv-browser genome="hg38" locus="chr1:1-1000000">
  <igv-track type="alignment" url="sample.bam"></igv-track>
</igv-browser>
```

### Full browser with custom controls
```html
<igv-browser genome="hg38">
  <igv-navbar>
    <igv-chromosome-select slot="left"></igv-chromosome-select>
    <igv-locus-search slot="center"></igv-locus-search>
    <igv-zoom-controls slot="right"></igv-zoom-controls>
    <my-custom-button slot="right"></my-custom-button>
  </igv-navbar>

  <igv-track-container>
    <igv-ideogram-track></igv-ideogram-track>
    <igv-ruler-track></igv-ruler-track>
    <igv-track type="alignment" url="sample.bam">
      <igv-coverage-track slot="coverage"></igv-coverage-track>
      <igv-alignment-track slot="alignments"></igv-alignment-track>
    </igv-track>
  </igv-track-container>

  <igv-roi-panel></igv-roi-panel>
</igv-browser>
```

### React wrapper
```jsx
import { GenomeBrowser, AlignmentTrack, VariantTrack, useGenomeBrowser } from '@igv/react'

function MyBrowser() {
    const browser = useGenomeBrowser()

    return (
        <GenomeBrowser genome="hg38" locus="TP53" onLocusChange={(locus) => console.log(locus)}>
            <AlignmentTrack url="sample.bam" height={300} />
            <VariantTrack url="calls.vcf.gz" />
        </GenomeBrowser>
    )
}
```

## Migration Strategy

1. **Phase A:** Introduce Web Component base class alongside existing vanilla components
2. **Phase B:** Convert Tier 1 components to Web Components (backward-compatible)
3. **Phase C:** Add typed event bus, deprecate old EventEmitter
4. **Phase D:** Convert Tier 2 components, add state management
5. **Phase E:** Convert Tier 3 core rendering components
6. **Phase F:** Publish framework wrappers (@igv/react, @igv/svelte)

Each phase should maintain backward compatibility with the existing `igv.createBrowser()` API.
