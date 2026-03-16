# GCNV Module

## Purpose

The GCNV (Germline Copy Number Variation) module provides a specialized track type for visualizing multi-sample copy number variation data as overlaid line plots. It consists of a BED-style decoder that parses per-sample numeric values from columnar data and a track class that renders connected line segments across genomic bins, with support for sample highlighting, click-based sample identification, autoscaling, and configurable guide lines.

## Genomic Context

Copy number variation (CNV) data represents the estimated number of copies of a genomic segment across multiple samples. Tools like GATK gCNV produce BED-like output where each row represents a genomic interval (bin) and columns beyond the first three (chr, start, end) contain per-sample copy number values. Visualizing this as a multi-sample line plot allows researchers to identify samples with aberrant copy number relative to the cohort -- deletions appear as dips below the baseline and duplications as peaks above it. The GCNV track loads entire chromosomes at once (`visibilityWindow = -1`) because the line-drawing algorithm needs features beyond the current view to render connecting segments between bins.

## Key Classes & Files

| File | Class/Function | Role |
|------|---------------|------|
| `js/gcnv/gcnvDecoder.ts` | `decodeGcnv()` | BED-style decoder that parses a tab-delimited line into `{ chr, start, end, values }` where `values` is a `number[]` of per-sample values from columns 4+. Validates that the number of value columns matches the expected sample count from the header's `columnNames`. Logs a warning and returns `undefined` for rows with mismatched column counts. |
| `js/gcnv/gcnvTrack.ts` | `GCNVTrack` | Track class extending `TrackBase` that renders multi-sample CNV data as connected line segments. Manages a `clickDetectorCache` for identifying which sample line was clicked, supports sample highlighting via config (`highlightSamples`, `clickToHighlight`), draws configurable guide lines (solid or dotted), performs autoscaling across all sample values, and provides popup data showing sample name and value at clicked positions. |

### GCNVTrack Key Properties

- **`sampleKeys`**: Array of sample names extracted from header column names (columns 4+).
- **`clickDetectorCache`**: Object keyed by x-pixel coordinate, storing arrays of `[x1, y1, x2, y2, sampleName, color]` tuples representing rendered line segments. Rebuilt on every `draw()` call to enable efficient click detection.
- **`visibilityWindow`**: Hardcoded to `-1` (whole chromosome), since the drawing algorithm needs features before and after the visible window to render connecting line segments between bins.

### GCNVTrack Key Methods

- **`draw(options)`**: Iterates features, computing x/y coordinates for each sample value. Draws gray connector lines between adjacent bins and horizontal feature lines within bins. Highlighted samples are drawn last with custom colors and increased line width for visibility.
- **`popupData(clickState)`**: Uses `clickDetectorCache` to find the nearest line segment to the click position. Returns sample name and value for the closest sample. Uses perpendicular distance from point to line segment for hit detection.
- **`getFeatures(chr, start, end)`**: Loads the entire chromosome from the feature source, then trims to include one feature before and one feature after the visible range (needed for connecting line segments at view boundaries).
- **`doAutoscale(features)`**: Scans all sample values across all features to determine min/max for the data range.

## Data Flow

```
  BED-like file with per-sample columns
  (chr  start  end  sample1  sample2  sample3 ...)
            |
    FeatureSource()          -- factory selects TextFeatureSource
            |
    FeatureFileReader
            |
    FeatureParser + decodeGcnv()
            |
        Features: { chr, start, end, values: number[] }
            |
    GCNVTrack.getFeatures()  -- loads whole chromosome, trims to view ± 1 bin
            |
    GCNVTrack.draw()
        |
        +-- For each feature, for each sample:
        |     compute x from bp position, y from value via yScale
        |     draw connector line (previous bin → current bin)
        |     draw feature line (within current bin)
        |     store line segments in clickDetectorCache
        |
        +-- Draw highlighted samples last (on top, thicker lines)
        |
        +-- Draw guide lines (configurable horizontal references)
            |
    GCNVTrack.popupData()
        |
        +-- Look up clickDetectorCache by x pixel
        +-- Find nearest line segment by perpendicular distance
        +-- Return sample name + value
```

1. **Loading**: `GCNVTrack.init()` creates a `FeatureSource` (via the standard feature module factory), which selects `TextFeatureSource` with `FeatureFileReader` and `FeatureParser`.
2. **Decoding**: `decodeGcnv()` is registered as the decoder for the `"gcnv"` format. It parses each line into a feature with a `values` array containing one numeric value per sample.
3. **Header**: `postInit()` reads the header to extract `sampleKeys` (column names after chr/start/end) and processes track-line properties including `highlight`, `clickToHighlight`, and `onlyHandleClicksForHighlightedSamples`.
4. **Feature Retrieval**: `getFeatures()` loads the entire chromosome (since `visibilityWindow = -1`) and returns a slice that includes one bin before and one bin after the visible range.
5. **Rendering**: `draw()` iterates over features and samples, drawing line segments and populating the `clickDetectorCache`. Non-highlighted samples are drawn first in gray; highlighted samples are drawn on top with configured colors and thicker lines.
6. **Interaction**: `popupData()` uses the `clickDetectorCache` to identify which sample's line segment is nearest to the click location, returning the sample name and value.

## Dependencies

### Internal Dependencies
- `js/feature/featureSource.ts` -- Factory function for creating the data source (dispatches to `TextFeatureSource`)
- `js/trackBase.ts` -- `TrackBase` parent class providing `init()`, `setTrackProperties()`, `numericDataMenuItems()`, and other shared track infrastructure
- `js/igv-canvas.ts` -- `IGVGraphics` for canvas line drawing (`strokeLine`, `dashedLine`)
- `js/util/igvUtils.ts` -- `isSimpleType()` for popup data formatting
- `js/util/paintAxis.ts` -- `paintAxis()` for drawing the y-axis scale
- `js/types/config.ts` -- `TrackConfig` type
- `js/types/ui.ts` -- `DrawConfiguration`, `ClickState` types
- `js/types/feature.ts` -- `GenomicFeature`, `PopupData` types

### External Dependencies
- `igv-utils` -- `StringUtils.numberFormatter()` for numeric display formatting
