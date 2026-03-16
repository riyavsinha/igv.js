# Hi-C Module

## Purpose

The Hi-C module enables igv.js to load and display chromatin interaction data from `.hic` files (the format produced by tools like Juicebox). It provides a data source that reads contact matrices at appropriate resolutions, applies normalization, and converts interaction records into genomic features suitable for rendering as arcs or other interaction visualizations. It also includes utilities for translating Juicebox sessions into igv.js sessions.

## Genomic Context

Hi-C is a chromosome conformation capture technique that measures the 3D spatial proximity of genomic loci. The resulting data is a contact matrix where each cell represents the interaction frequency between two genomic bins. This data reveals topologically associating domains (TADs), chromatin loops, and large-scale compartmentalization of chromosomes. Hi-C data is stored in `.hic` files at multiple resolutions (bin sizes), allowing visualization from whole-chromosome down to kilobase resolution. Normalization (e.g., KR, VC, VC_SQRT) corrects for biases such as GC content and mappability.

## Key Classes & Files

### `hic/hicColorScale.ts`
Implements `HicColorScale`, a color scale that maps contact frequency values to RGBA colors with alpha-based intensity. The scale uses a configurable threshold (default 2000) and base RGB color (default blue: 0,0,255). Values are binned into 2000 bins for caching efficiency -- once a color string is computed for a bin, it is reused. Supports serialization (`stringify()`) and deserialization (`parse()`) for session persistence. The `parse()` method includes a dead code path for `RatioColorScale` (referenced but never defined), suggesting legacy support for ratio-based coloring.

### `hic/hicSource.ts`
`HicSource` is the data source that reads `.hic` files via the `hic-straw` library (`HicFile`). Key responsibilities:
- **Resolution selection**: Given `bpPerPixel`, selects the finest resolution where the bin size is still >= bpPerPixel, ensuring appropriate detail for the current zoom level.
- **Contact record retrieval**: Fetches intra-chromosomal contact records from the `.hic` file for a given region and bin size, with caching (one entry per chromosome/binSize).
- **Normalization**: Optionally applies normalization vectors (KR, VC, etc.) by dividing raw counts by the product of normalization values for the two interacting bins. Normalization vectors are cached using an LRU cache (capacity 10).
- **Thresholding**: When >1000 features exist, computes a percentile-based threshold (default 80th percentile) to limit rendered features, preventing visual overload.
- **Feature construction**: Converts contact records into `HicFeature` objects with `chr1/start1/end1` and `chr2/start2/end2` coordinates plus a normalized `score` (200-800 range mapped from 5th-95th percentile).
- Records near the diagonal (within `binThreshold` bins, default 5) are excluded as they represent trivially close interactions.

### `hic/shoeboxUtils.ts`
Provides `translateSession()`, which converts a Juicebox (Hi-C visualization tool) session JSON into an igv.js session configuration. It reads the `.hic` file header to determine resolution and chromosome information, maps the Juicebox viewport state (zoom level, x/y position) to an igv.js locus string, and creates a "shoebox" track configuration. Filters out Juicebox-specific tracks (refgene, cellType) that are not applicable in igv.js.

## Data Flow

```
.hic file (binary contact matrix)
    |
    v
HicFile (hic-straw library)    -->  raw ContactRecord[] (bin1, bin2, counts)
    |
    v
HicSource.getRecords()          -->  cached contact records for chr/binSize
    |
    v
HicSource.getFeatures()         -->  resolution selection
    |                                 normalization vector application
    |                                 diagonal filtering (binThreshold)
    |                                 percentile thresholding
    |                                 HicFeature[] construction
    v
Track (e.g., InteractionTrack)   -->  rendering as arcs/heatmap
```

For Juicebox session translation:
```
Juicebox session JSON
    |
    v
translateSession()              -->  reads HicFile header
    |                                 extracts locus from state
    |                                 creates shoebox track config
    v
igv.js session config           -->  loaded by Browser
```

## Dependencies

**Depends on:**
- `hic-straw` (external, `node_modules/hic-straw/src/hicFile.js`) -- core `.hic` file reading: initialization, contact record retrieval, normalization vectors, resolution lists
- `js/util/lruCache.ts` (`LRU`) -- LRU cache for normalization vectors
- `igv-utils` (external) -- `IGVMath.clamp()` for color scale value clamping

**Depended on by:**
- `js/feature/interactionTrack.ts` -- uses `HicSource` as its data source for `type: "interaction"` tracks with `.hic` format
- `js/trackFactory.js` -- creates `HicSource` when track config specifies a `.hic` file
- `js/browser.js` -- may use `translateSession()` when loading Juicebox sessions
- `hicColorScale.ts` is used by interaction track renderers that need Hi-C-specific color mapping
