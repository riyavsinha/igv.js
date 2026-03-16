# Performance Optimization Plan

## Current Performance Profile

### Bottlenecks identified during TypeScript migration
See `ai_docs/optimizations.md` for bugs and inefficiencies fixed during migration. Key categories:
- O(n²) algorithms (BinnedColorScale, cloneArray)
- Per-call allocations (isSimpleType Set, format object mutation)
- Unused debug infrastructure

### Main-thread blocking
All parsing and rendering currently happens on the main thread:
- BAM/CRAM decoding (binary parsing, alignment reconstruction)
- BigWig index traversal and data decompression
- VCF parsing (especially multi-sample VCFs with many genotypes)
- Feature packing (assigning rows to overlapping features)
- Canvas rendering (all track draw methods)

### Memory usage
- FeatureCache stores all features for the loaded region
- AlignmentContainer holds all reads (with downsampling)
- No explicit memory limits — large BAM regions can consume hundreds of MB

## Optimization 1: Web Workers

### Strategy
Move CPU-intensive parsing off the main thread:

```
Main Thread                    Worker Thread
─────────────                  ─────────────
Request features ──────────►   Fetch + parse data
                               Index lookup
                               Binary decoding
Receive features ◄──────────   Return structured data
Render to canvas
```

### Priority targets (by CPU impact)
1. **BAM parsing** — Binary decoding, CIGAR processing, base quality extraction
2. **BigWig decompression** — zlib inflate of data blocks
3. **VCF parsing** — Line-by-line text parsing, genotype extraction
4. **Feature packing** — Row assignment algorithm for overlapping features
5. **CRAM decoding** — Reference-based sequence reconstruction

### Implementation approach
```typescript
// Worker pool (shared across all tracks)
class WorkerPool {
    private workers: Worker[]
    private queue: Task[]

    async execute<T>(task: string, data: Transferable): Promise<T>
}

// Track source delegates parsing to worker
class WorkerBamSource {
    async getFeatures(chr, start, end, bpPerPixel) {
        const rawData = await this.reader.fetchBytes(chr, start, end)
        // Transfer ArrayBuffer to worker (zero-copy)
        const alignments = await workerPool.execute('parseBam', rawData)
        return alignments
    }
}
```

### Data transfer strategy
- Use `Transferable` objects (ArrayBuffer) for zero-copy transfer to workers
- Return parsed features as structured cloneable objects
- Consider `SharedArrayBuffer` for large shared datasets (requires COOP/COEP headers)

## Optimization 2: Virtual Scrolling

### Problem
When many tracks are loaded (20+), all track DOM elements exist simultaneously. Each track has multiple canvases, DOM elements for axis/scrollbar/gear.

### Solution
Only render tracks visible in the viewport:

```typescript
class VirtualTrackList {
    private allTracks: TrackData[]
    private visibleRange: { start: number; end: number }
    private trackHeights: number[]  // cumulative heights for position calculation

    onScroll(scrollTop: number) {
        const { start, end } = this.calculateVisibleRange(scrollTop)
        // Create/destroy TrackViews for tracks entering/leaving viewport
        this.reconcile(start, end)
    }
}
```

### Benefits
- Constant DOM element count regardless of track count
- Faster initial load (only create visible tracks)
- Lower memory usage (cached features for off-screen tracks can be evicted)

## Optimization 3: Code Splitting

### Current bundle
The entire library is bundled as a single file (~900KB minified). All track types, parsers, and UI components are included regardless of usage.

### Proposed splits
```
igv.core.js          (~100KB) Base browser, genome, events, UI
igv.bam.js           (~150KB) BAM/CRAM support
igv.variant.js       (~50KB)  VCF support
igv.feature.js       (~100KB) BED/GFF/GTF/WIG
igv.bigwig.js        (~50KB)  BigWig/BigBed
igv.hic.js           (~30KB)  Hi-C support
igv.cnvpytor.js      (~40KB)  CNVpytor support
// etc.
```

### Implementation
Use dynamic `import()` in the track factory:
```typescript
async function getTrack(type, config, browser) {
    switch(type) {
        case 'alignment':
            const { BAMTrack } = await import('./bam/bamTrack.js')
            return new BAMTrack(config, browser)
        // ...
    }
}
```

### Trade-offs
- Adds async loading step when first using a track type
- Requires bundler configuration for chunk splitting
- CDN usage pattern changes (multiple files vs. single script)

## Optimization 4: Canvas Rendering

### OffscreenCanvas
```typescript
// Render in worker thread
const offscreen = canvas.transferControlToOffscreen()
worker.postMessage({ canvas: offscreen, drawConfig }, [offscreen])
```

Benefits:
- Rendering doesn't block main thread
- Smooth scrolling during heavy rendering

Limitations:
- Not supported in all browsers (Safari added in 16.4)
- Requires worker-compatible rendering code

### requestAnimationFrame batching
Currently, each viewport's `repaint()` can trigger immediate canvas draws. Batching multiple repaints into a single rAF frame:
```typescript
class RenderScheduler {
    private pendingRepaints: Set<TrackViewport> = new Set()

    scheduleRepaint(viewport: TrackViewport) {
        this.pendingRepaints.add(viewport)
        if (!this.rafId) {
            this.rafId = requestAnimationFrame(() => this.flush())
        }
    }

    flush() {
        for (const vp of this.pendingRepaints) {
            vp.doRepaint()
        }
        this.pendingRepaints.clear()
        this.rafId = null
    }
}
```

### Canvas reuse
Instead of creating new canvases on resize, maintain a canvas pool:
```typescript
class CanvasPool {
    private available: HTMLCanvasElement[] = []

    acquire(width, height): HTMLCanvasElement
    release(canvas): void
}
```

## Optimization 5: Data Loading

### Prefetching
When panning, prefetch data for the adjacent regions:
```
Current viewport: |   visible   |
Prefetch:     |left|   visible   |right|
```

### Smarter caching
Replace per-viewport FeatureCache with a shared LRU cache per track:
```typescript
class TrackDataCache {
    private lru: LRUCache<string, FeatureChunk>
    private maxMemoryBytes: number

    get(chr, start, end, bpPerPixel): FeatureChunk | undefined
    put(chr, start, end, bpPerPixel, features): void
    evictIfNeeded(): void  // Based on memory pressure
}
```

### Progressive loading
For dense data (BigWig, coverage), show low-resolution data first, then refine:
```
1. Quick: Load zoom-level summary → show approximate bars
2. Refine: Load full-resolution data → update with precise values
```
BigWig already has zoom levels; this optimization leverages them for perceived performance.

## Priority Order

| Optimization | Impact | Effort | Priority |
|-------------|--------|--------|----------|
| Web Workers (BAM parsing) | High | Medium | 1 |
| rAF batching | Medium | Low | 2 |
| Prefetching adjacent regions | Medium | Low | 3 |
| Code splitting | Medium | Medium | 4 |
| Virtual scrolling | High | High | 5 |
| OffscreenCanvas | Medium | High | 6 |
| SharedArrayBuffer | Low | High | 7 |
