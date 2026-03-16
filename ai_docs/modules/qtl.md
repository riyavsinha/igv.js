# QTL Module

## Purpose

The QTL (Quantitative Trait Loci) module provides parsing, rendering, and interactive exploration of eQTL (expression QTL) and other xQTL data in igv.js. It supports both file-based QTL data (via `QTLParser`) and web-service-based data from GTEx (via `GtexReader`), renders QTL associations as scatter plots with selection-based highlighting, and manages user selections of SNPs, phenotypes (genes), and individual QTL associations for interactive exploration.

## Genomic Context

Quantitative Trait Loci are genomic regions containing variants that are statistically associated with quantitative phenotypic traits. Expression QTLs (eQTLs) are the most common type, linking genetic variants (SNPs) to gene expression levels in specific tissues. For example, a variant at chr16:21999621 might be associated with expression of the gene CTD-2649C14.3 in skeletal muscle tissue. QTL analysis is fundamental to understanding how non-coding genetic variation affects gene regulation, and is a key tool in post-GWAS functional interpretation. The module supports data from the GTEx (Genotype-Tissue Expression) project as well as generic QTL file formats including the EMBL eQTL Catalogue format.

## Key Classes & Files

### `qtl/qtlParser.ts`
Parses tab-delimited QTL files into `QTL` feature objects. Similar to `GWASParser` but with additional columns for SNP identifiers and phenotype/gene names. Key aspects:
- **Column auto-detection**: Recognizes headers from multiple QTL file formats -- GTEx, EMBL eQTL Catalogue, and custom formats. Supported header synonyms include `chr`/`chromosome`/`chrom` for chromosome, `rsid`/`variant`/`snp` for variant ID, and `phenotype`/`gene`/`gene_id`/`molecular_trait_id` for the associated phenotype.
- **Config overrides**: Column indices can be explicitly specified via `chrColumn`, `snpColumn`, `posColumn`, `pValueColumn`, `phenotypeColumn` in the config (1-based, converted to 0-based).
- **Delimiter support**: Configurable delimiter (defaults to tab).
- **Format detection**: Static `isQTL()` method distinguishes QTL files from GWAS files by requiring all five column types (chr, pos, pvalue, snp, phenotype).
- **Small p-value handling**: Same `MIN_EXPONENT` clamping as GWASParser for extremely small p-values.
- The `QTL` class stores full `headers` and `tokens` arrays for generating popup data with all original columns.

### `qtl/gtexReader.ts`
`GtexReader` fetches eQTL data from the GTEx REST API web service. Key aspects:
- **API queries**: Constructs URL queries with chromosome, start, end, tissue ID, and dataset ID parameters. Defaults to `gtex_v8` dataset.
- **Chromosome handling**: Converts input chromosome names to UCSC format (e.g., "1" to "chr1", "MT" to "chrM"). Maintains a whitelist of valid GTEx chromosomes and returns empty results for unrecognized chromosomes.
- **Feature mapping**: Converts GTEx JSON response (`singleTissueEqtl` array) into `EQTL` objects with `chr`, `start`, `end`, `snp`, `phenotype` (gene symbol), and `pValue`. Each EQTL represents a single-base position (end = start + 1).
- **Popup data**: The `EQTL` class exposes all original JSON fields (gencodeId, nes, variantId, tissueSiteDetailId, etc.) as popup data.

### `qtl/qtlSelections.ts`
`QTLSelections` manages the user's interactive selections for highlighting QTL associations across views. Supports three selection modes:
- **Phenotype (gene) selection**: Maps gene names to colors from a Brewer color palette (25 predefined colors from ColorBrewer Sets 1, 2, and 3, falling back to random colors). All comparisons are case-insensitive (uppercased).
- **SNP selection**: Tracks a set of selected SNP identifiers.
- **Individual QTL selection**: Stores a single clicked QTL for precise highlighting.
- Supports serialization (`toJSON()`) and deserialization (`fromJSON()`) for session persistence.
- A standalone `compareQTLs()` function checks equality by `chr`, `start`, and `pValue`.

### `qtl/qtlTrack.ts`
`QTLTrack` extends `TrackBase` to render QTL scatter plots with interactive highlighting. Key capabilities:
- **Two-pass rendering**: First draws all QTLs as gray dots, then overlays selected/highlighted QTLs in color with double-sized radius. This ensures selected features are always visible on top.
- **Three selection modes** in draw: (1) specific QTL highlighting (exact match), (2) SNP+phenotype highlighting (SNP must match AND phenotype must match), (3) phenotype-only highlighting.
- **Autoscaling**: Uses the configured percentile (default 98th) of -log10(p-value) values, with a floor of 10.
- **Data range**: Default min is 3.5 (-log10 of ~0.0003), filtering out non-significant associations. Default max is 25.
- **Context menu**: Right-clicking a QTL offers "Highlight associated features" which selects the QTL's phenotype and repaints all views.
- **Search dialog**: Menu item "Search for..." accepts a SNP ID or phenotype name, finds matching QTLs via `featureSource.findFeatures()`, selects them, and navigates the browser to span all matches (expanding the view to include the phenotype's gene location via `searchFeatures`).
- **Click detection**: Uses Euclidean distance from stored `px`/`py` coordinates with tolerance of 6 pixels, returning the closest feature(s) when multiple overlap.

## Data Flow

### File-based QTL data:
```
QTL file (.tsv, .txt)
    |
    v
QTLParser.parseHeader()        -->  column index detection
QTLParser.parseFeatures()      -->  QTL[] (chr, start, end, pValue, snp, phenotype)
    |
    v
FeatureSource (generic)        -->  caching, indexing
    |
    v
QTLTrack.getFeatures()         -->  retrieves for visible region
    |
    v
QTLTrack.draw()                -->  two-pass scatter plot (gray + selected)
    |                               stores px/py/radius on each feature
    v
QTLTrack.popupData()           -->  tooltip with all columns or GTEx fields
QTLTrack.contextMenuItemList() -->  "Highlight associated features"
```

### GTEx web service:
```
GTEx REST API
    |
    v
GtexReader.readFeatures()      -->  HTTP request with region + tissue
    |                               JSON response -> EQTL[]
    v
FeatureSource                  -->  same pipeline as file-based
    v
QTLTrack (same rendering)
```

### Selection flow:
```
User clicks QTL / searches
    |
    v
QTLSelections                  -->  updates phenotypeColors, snps, qtl
    |
    v
Browser.repaintViews()         -->  triggers redraw of all tracks
    |
    v
QTLTrack.draw()                -->  second pass checks QTLSelections
                                    for isSelected, applies color
```

## Dependencies

**Depends on:**
- `js/feature/featureSource.js` -- generic feature loading, caching, `findFeatures()` for search
- `js/trackBase.js` -- base track class providing `init()`, `numericDataMenuItems()`, config merging
- `js/igv-canvas.js` (`IGVGraphics`) -- canvas drawing primitives
- `js/search.ts` (`searchFeatures`) -- genome-wide feature search for expanding view to include gene positions
- `igv-utils` (external) -- `igvxhr` for HTTP requests (GtexReader), `IGVMath` (imported but unused in qtlTrack), `IGVColor` for random color generation
- `js/browser.js` (`Browser`) -- `qtlSelections` property, `search()`, `repaintViews()`, `inputDialog`
- `js/types/config.ts` -- `TrackConfig`, `LoadConfig` interfaces

**Depended on by:**
- `js/trackFactory.js` -- registers `QTLTrack` as the handler for `type: "qtl"` and `type: "eqtl"` tracks
- `js/browser.js` -- maintains the `qtlSelections` instance shared across all QTL tracks
- Session save/restore logic uses `QTLSelections.toJSON()` / `fromJSON()`
