# GWAS Module

## Purpose

The GWAS (Genome-Wide Association Study) module provides parsing, rendering, and interaction support for GWAS data in igv.js. It displays genomic variants as a scatter plot of statistical significance (-log10 p-value) or posterior probabilities against genomic position, with chromosome-based color coding to visually distinguish signals across the genome.

## Genomic Context

GWAS studies scan the entire genome for statistical associations between genetic variants (typically SNPs) and observable traits or diseases. The key metric is the p-value, which indicates how strongly a variant is associated with the trait. Variants are plotted as a "Manhattan plot" where the y-axis shows -log10(p-value) -- higher points indicate stronger associations. The genome-wide significance threshold is conventionally 5e-8 (-log10 ~ 7.3). This visualization is essential for identifying loci harboring causal variants and is one of the most widely used plots in human genetics.

## Key Classes & Files

### `gwas/gwasColors.ts`
Defines a color lookup table (`GWASColors`) mapping chromosome identifiers to distinct RGB colors. Supports numeric chromosome names (1-48), "chr"-prefixed names (chr1, chr22, chrX), sex chromosomes (X, Y), and Roman numeral aliases (for non-human organisms like yeast). The color table enables the characteristic alternating-color pattern of Manhattan plots. A `romanize()` utility function converts integers to Roman numerals for aliasing.

### `gwas/gwasParser.ts`
Parses tab-delimited GWAS files into `GWASFeature` objects. Supports auto-detection of column roles (chromosome, position, p-value) from header names with multiple naming conventions (e.g., "chr"/"chromosome"/"chr_id" for chromosome column, "p"/"pval"/"pvalue"/"p-value"/"p.value" for p-value column). Column indices can also be explicitly configured. Handles extremely small p-values that would underflow JavaScript's `Number` by clamping to `Number.MIN_VALUE`. The `GWASFeature` class stores raw line data and column headers to generate popup data on click. A static `isGWAS()` method supports auto-detection of GWAS file format from generic file extensions like `.tsv`.

### `gwas/gwasTrack.ts`
The track renderer (`GWASTrack`) extends `TrackBase` to draw Manhattan plots. Key capabilities:
- **Three color modes**: chromosome-based coloring (default, using `GWASColors`), constant color, or binned color scale based on p-value thresholds.
- **Two value modes**: standard p-values (displayed as -log10) or posterior probabilities (displayed directly).
- **Autoscaling**: computes data range from the 98th percentile (configurable) of -log10(p-value) across visible features.
- **Whole genome support**: `supportsWholeGenome` returns true, enabling genome-wide Manhattan plots.
- **Axis painting**: renders a labeled y-axis with tick marks showing either -log10(pvalue) or PPA scale.
- **Popup interaction**: click detection uses pixel distance (`dotSize`) from rendered dot positions (`px`, `py` stored on features during draw), limited to 5 features per click.

## Data Flow

```
GWAS file (.gwas, .tsv)
    |
    v
GWASParser.parseFeatures()  -->  GWASFeature[]
    |                              (chr, start, end, value, line, columns)
    v
FeatureSource (generic)      -->  caching, binning, whole-genome projection
    |
    v
GWASTrack.getFeatures()      -->  retrieves from FeatureSource
    |
    v
GWASTrack.draw()             -->  scatter plot on canvas
    |                              (computes px/py per feature for hit testing)
    v
GWASTrack.popupData()        -->  tooltip on click (column name/value pairs)
```

1. `FeatureSource` (from `js/feature/featureSource.js`) is created during `init()` with the track config. It wraps `GWASParser` and handles data loading, caching, and genomic indexing.
2. `getFeatures(chr, start, end)` delegates to `FeatureSource`, which calls `GWASParser.parseFeatures()` on first load.
3. `draw()` iterates over features, converts p-values to -log10 scale, maps to pixel coordinates, and renders colored circles.
4. `popupData()` uses the stored `px`/`py` coordinates from the draw pass to find features near the click point.

## Dependencies

**Depends on:**
- `js/feature/featureSource.js` -- generic feature loading, caching, and whole-genome feature projection
- `js/trackBase.js` -- base track class providing `init()`, config merging, `numericDataMenuItems()`, `setTrackProperties()`
- `js/igv-canvas.js` (`IGVGraphics`) -- canvas drawing primitives (fillCircle, strokeLine, fillText)
- `js/util/colorScale.js` -- `BinnedColorScale` and `ConstantColorScale` for non-chromosome color modes
- `js/util/colorPalletes.js` -- `ColorTable` wrapper used with `GWASColors`
- `js/util/igvUtils.js` -- `doAutoscale()` for computing data range from feature values
- `igv-utils` (external) -- `StringUtils.numberFormatter` for popup display

**Depended on by:**
- `js/trackFactory.js` -- registers `GWASTrack` as the handler for `type: "gwas"` tracks
- Any browser session or configuration that loads GWAS-format data files
