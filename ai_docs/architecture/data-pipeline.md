# Data Pipeline: Reader → Source → Cache → Track → Viewport

## Overview

Data flows through a multi-stage pipeline from remote files to rendered pixels:

```
Remote File (BAM, VCF, BED, BigWig, ...)
        │
        ▼
    ┌─────────┐
    │  Reader  │  Handles file format parsing, index lookups, HTTP range requests
    └────┬────┘
         │  raw features / alignments / data points
         ▼
    ┌─────────┐
    │  Source  │  Adds caching, chromosome aliasing, filtering, transformations
    └────┬────┘
         │  processed features for a genomic region
         ▼
    ┌──────────────┐
    │ FeatureCache │  LRU-like cache keyed by genomic region
    └──────┬───────┘
           │  cached features matching current viewport
           ▼
    ┌─────────┐
    │  Track  │  Decides layout, color, display mode (EXPANDED/SQUISHED/COLLAPSED)
    └────┬────┘
         │  draw instructions
         ▼
    ┌───────────┐
    │  Viewport │  Canvas rendering, scrolling, mouse events
    └───────────┘
```

## Stage 1: Readers

Readers handle the low-level concerns of fetching and parsing data from remote or local files.

### Responsibilities
- HTTP range requests for indexed random access
- Binary format parsing (BAM, BigWig, TDF, CRAM)
- Text format parsing (BED, GFF, VCF, WIG via FeatureParser)
- Index file loading and coordinate-to-byte-offset lookups

### Reader implementations
| Reader | Module | Formats |
|--------|--------|---------|
| `BamReader` | js/bam/bamReader.ts | BAM (indexed) |
| `BamReaderNonIndexed` | js/bam/bamReaderNonIndexed.ts | BAM (small, no index) |
| `ShardedBamReader` | js/bam/shardedBamReader.ts | Sharded BAM (multiple files) |
| `BamWebserviceReader` | js/bam/bamWebserviceReader.ts | BAM via web service |
| `CramReader` | js/cram/cramReader.ts | CRAM |
| `BWReader` | js/bigwig/bwReader.ts | BigWig, BigBed |
| `TDFReader` | js/tdf/tdfReader.ts | TDF |
| `FeatureFileReader` | js/feature/featureFileReader.ts | BED, GFF, VCF, WIG, etc. (text) |
| `CustomServiceReader` | js/feature/customServiceReader.ts | Custom REST APIs |
| `UCSCServiceReader` | js/feature/ucscServiceReader.ts | UCSC data services |
| `GTExReader` | js/qtl/gtexReader.ts | GTEx eQTL API |
| `HtsgetBamReader` | js/htsget/htsgetBamReader.ts | BAM via HTSget |
| `HtsgetVariantReader` | js/htsget/htsgetVariantReader.ts | VCF via HTSget |
| `HDF5IndexedReader` | js/cnvpytor/HDF5IndexedReader.ts | HDF5 (CNVpytor) |

### Index structures
Indexed access is critical for large genomic files. igv.js supports:
- **BAI** (BAM Index): `js/bam/bamIndex.ts` — standard BAM index
- **CSI** (Coordinate-Sorted Index): `js/bam/csiIndex.ts` — supports large chromosomes
- **Tabix** (TBI): Uses same code path as BAI for VCF, BED, GFF
- **Tribble**: `js/feature/tribble.ts` — GATK/Picard index format
- **B+ tree**: `js/bigwig/bpTree.ts`, `js/genome/bpt.ts` — BigWig/BigBed index
- **R+ tree**: `js/bigwig/rpTree.ts` — spatial index for BigWig data blocks

The `indexFactory` (`js/bam/indexFactory.ts`) selects the appropriate index type based on file extension.

## Stage 2: Sources

Sources sit between readers and tracks, adding:
- **Caching**: Avoids re-fetching data for the same region
- **Chromosome aliasing**: Translates between naming conventions (chr1 ↔ 1)
- **Filtering**: Applies user-defined feature filters
- **Transformations**: Sort, group, compute coverage

### Source implementations
| Source | Module | Used by |
|--------|--------|---------|
| `FeatureSource` | js/feature/featureSource.ts | Most text-format tracks (BED, GFF, VCF, etc.) |
| `BaseFeatureSource` | js/feature/baseFeatureSource.ts | Base class for feature sources |
| `TextFeatureSource` | js/feature/textFeatureSource.ts | In-memory text data |
| `StaticFeatureSource` | js/feature/staticFeatureSource.ts | Pre-loaded feature arrays |
| `ListFeatureSource` | js/feature/listFeatureSource.ts | Feature lists from API |
| `BamSource` | js/bam/bamSource.ts | BAM/CRAM alignments |
| `BWSource` | js/bigwig/bwSource.ts | BigWig/BigBed |
| `TDFSource` | js/tdf/tdfSource.ts | TDF |
| `HicSource` | js/hic/hicSource.ts | Hi-C contact data |
| `GenbankFeatureSource` | js/gbk/genbankFeatureSource.ts | GenBank features |

### FeatureSource factory pattern
`FeatureSource()` in `js/feature/featureSource.ts` is actually a factory function (not a class constructor). It examines the config and returns the appropriate source implementation:
- Custom service → `CustomServiceReader`
- UCSC service → `UCSCServiceReader`
- GTEx → `GTExReader`
- Default → `BaseFeatureSource` wrapping a `FeatureFileReader`

## Stage 3: FeatureCache

`FeatureCache` (`js/feature/featureCache.ts`) stores loaded features keyed by genomic region:
- Keyed by `{chr, start, end}` — the region that was queried
- Features typed as `unknown` because they can be arrays, alignment containers, coverage objects, etc.
- Checked on each `loadFeatures()` call: if the cached region contains the viewport region, skip the fetch
- Invalidated on track reload or reference frame change

In `TrackViewport`, the cache is accessed via the `featureCache` / `cachedFeatures` accessors.

## Stage 4: Track

Tracks are responsible for:
- Defining `getFeatures(chr, start, end, bpPerPixel)` to delegate to their source
- Implementing `draw(drawConfiguration)` to render features onto a canvas
- Computing pixel height based on feature density (`computePixelHeight()`)
- Providing popup data on click (`popupData()`)
- Defining menu items for the gear menu (`menuItemList()`)

### The draw cycle
```
Browser.updateViews()
  └── for each TrackView:
      TrackView.updateViews()
        └── for each Viewport:
            TrackViewport.loadFeatures()
              └── track.getFeatures(chr, start, end, bpPerPixel)
                    └── source.getFeatures(...)
                          └── reader.readFeatures(...)
            TrackViewport.repaint()
              └── track.draw(drawConfiguration)
                    └── IGVGraphics.* (canvas drawing)
```

### DrawConfiguration object
Passed to every `track.draw()` call:
```typescript
interface DrawConfiguration {
    context: CanvasRenderingContext2D  // the canvas to draw on
    features: unknown                  // features from the cache
    pixelWidth: number                 // viewport width in pixels
    pixelHeight: number                // viewport height in pixels
    bpStart: number                    // genomic start position
    bpPerPixel: number                 // zoom level
    bpEnd: number                      // genomic end position
    viewportWidth: number              // same as pixelWidth
    referenceFrame: ReferenceFrame     // coordinate system
    selection?: Map                    // selected features
    genome: Genome                     // reference genome
    // ... track-specific additional properties
}
```

## Stage 5: Viewport Rendering

`TrackViewport` manages the canvas:
1. Creates an offscreen canvas sized to the content area
2. Gets a 2D rendering context
3. Builds a `DrawConfiguration` object
4. Calls `track.draw(drawConfiguration)`
5. Copies the offscreen canvas to the visible canvas (accounting for content scrolling)

For **SVG export**, the same `draw()` methods are called but with a `C2SContext` (Canvas2SVG) instead of a real canvas context. Since `C2SContext` extends `CanvasRenderingContext2D`, this works transparently.

## Concurrency Model

- All data fetching is async (`async/await`)
- `Browser.updateViews()` triggers parallel feature loading across all track views
- Group autoscale tracks wait for all features before computing data range
- `Promise.all()` used for concurrent track loading and viewport updates
- No Web Workers currently — all parsing happens on the main thread (see modernization docs)
