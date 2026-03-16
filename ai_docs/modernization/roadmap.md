# igv.js Modernization Roadmap

## Vision

Transform igv.js from a monolithic browser-embedded widget into a modular, framework-agnostic genomics visualization platform that supports:
1. **Headless operation** — Data pipeline without DOM for server-side rendering, testing, and programmatic analysis
2. **Modern UI framework integration** — React/Svelte/Web Components wrappers so users can build custom genome browsers
3. **Event-driven architecture** — Clean separation between data events and DOM events
4. **Performance at scale** — Web Workers, virtual scrolling, code splitting

## Phase Overview

```
Phase 1: Data/UI Separation          (Foundation)
    ↓
Phase 2: Headless Mode               (Enables server-side, testing)
    ↓
Phase 3: Event System Modernization  (Enables framework integration)
    ↓
Phase 4: Framework Components        (Enables custom browsers)
    ↓
Phase 5: Performance Optimization    (Scale to large datasets)
```

## Phase 1: Data/UI Separation

**Goal:** Split the codebase into a pure-data layer and a rendering/UI layer.

### Current State
The `Browser` class (~2000 LOC) mixes data orchestration with DOM manipulation. Track classes contain both data loading logic and canvas rendering. This coupling prevents headless use and framework integration.

### Target Architecture
```
@igv/core           (data layer — no DOM dependency)
├── genome/         Genome, Chromosome, Sequence providers
├── readers/        All file format readers
├── sources/        Data source abstractions
├── tracks/         Track data models (features, alignments, variants)
├── coordinate/     ReferenceFrame, Locus
├── search/         Feature search
├── session/        Session serialization
└── events/         EventEmitter

@igv/renderer       (rendering layer — Canvas/SVG)
├── canvas/         IGVGraphics, canvas utilities
├── trackRenderer/  Track-specific rendering functions
└── svg/            Canvas2SVG export

@igv/browser        (full browser — DOM + UI)
├── browser/        Browser orchestrator
├── viewport/       Viewport hierarchy
├── ui/             All UI components
└── index           Public API (backward compatible)
```

### Key refactoring tasks
1. Extract data-only track models from rendering logic
2. Move all `document.*` / DOM manipulation to the rendering/browser layer
3. Make `ReferenceFrame` independent of viewport DOM elements
4. Create pure-function renderers that take canvas context + data, return nothing

## Phase 2: Headless Mode

**Goal:** Run the data pipeline without a browser DOM.

See [headless.md](./headless.md) for detailed design.

### Use cases
- Server-side rendering (Node.js + node-canvas)
- Automated testing without jsdom
- Batch screenshot generation
- Programmatic data extraction (e.g., "get all variants in chr1:1000-2000")

## Phase 3: Event System Modernization

**Goal:** Replace the simple EventEmitter with a proper event bus supporting async handlers, typed events, and middleware.

See [ui-framework.md](./ui-framework.md) for detailed design.

### Target features
- Typed event definitions (TypeScript generics)
- Async event handlers
- Event middleware/interceptors
- Scoped subscriptions (auto-cleanup on component unmount)
- Event bubbling for component hierarchies

## Phase 4: Framework Components

**Goal:** Provide React/Svelte/Web Components wrappers for building custom genome browsers.

See [ui-framework.md](./ui-framework.md) for detailed design.

### Target API
```jsx
// React example
<GenomeBrowser genome="hg38" locus="chr1:1000-2000">
  <IdeogramTrack />
  <RulerTrack />
  <AlignmentTrack url="sample.bam" />
  <VariantTrack url="calls.vcf.gz" />
  <CustomTrack render={(ctx, features, config) => { ... }} />
</GenomeBrowser>
```

## Phase 5: Performance Optimization

**Goal:** Handle larger datasets with better performance.

See [performance.md](./performance.md) for detailed design.

### Key initiatives
- Web Workers for parsing and index operations
- Virtual scrolling for large track lists
- Code splitting per track type
- OffscreenCanvas for background rendering
- SharedArrayBuffer for worker data sharing
