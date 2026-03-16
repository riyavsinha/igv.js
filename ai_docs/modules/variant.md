# Variant Module

## Purpose

The Variant module handles parsing, modeling, and visualization of genetic variant data from VCF (Variant Call Format) files. It provides the complete pipeline from reading raw VCF text into structured `Variant` and `Call` objects, through rendering variant bars and per-sample genotype grids on an HTML5 canvas. This is one of the most feature-rich track types in igv.js, supporting multi-sample genotype display, color-by-attribute, sorting, filtering, and integration with JBrowse circular views.

## Genomic Context

VCF is the standard file format for storing genetic variation data -- SNPs, insertions, deletions, structural variants (SVs), and more. Each row in a VCF file describes a variant at a specific genomic position, with columns for chromosome, position, reference allele, alternate allele(s), quality, filter status, INFO fields, and per-sample genotype calls. Visualizing these variants in their genomic context is essential for interpreting sequencing experiments, identifying disease-associated mutations, and understanding population-level variation.

## Key Classes & Files

### `variant/variant.ts`

Contains three classes and several helper functions:

- **`Variant`** -- Core data model for a single VCF record. Constructed from a tab-delimited token array (one VCF line). Key responsibilities:
  - Parses standard VCF fields: `chr`, `pos`, `names` (ID column), `referenceBases`, `alternateBases`, `quality`, `filter`, and `info` (semicolon-delimited key=value pairs).
  - The `init()` method determines the **variant type** (`SNP`, `INSERTION`, `DELETION`, `SV`, `STR`, `NONVARIANT`, `MIXED`, `OTHER`) by inspecting INFO fields (`VT`, `SVTYPE`, `PERIOD`) or comparing ref/alt allele lengths.
  - Computes precise **start/end coordinates** by trimming matching bases from ref and alt alleles (left-to-right, then right-to-left). For insertions where start === end, fractional coordinates (start - 0.5, end + 0.5) are used to ensure visibility.
  - `popupData()` generates structured popup information for click tooltips, including CRAVAT links for SNPs.
  - `isFiltered()` returns true when the FILTER field is not "." or "PASS".
  - `alleleFreq()` returns the AF INFO field value.

- **`SVComplement`** -- Represents the "other end" of a structural variant breakpoint. Created when a variant has both `CHR2` and `END` INFO fields. Delegates most properties to the original `Variant` via getters, but provides its own `chr`, `pos`, `start`, and `end` from the CHR2/END values. This allows SV breakpoints on different chromosomes to appear as separate features.

- **`Call`** -- Represents a single sample's genotype call at a variant position. Parses the FORMAT/sample columns. Key features:
  - Stores `genotype` as an array of allele indices (0 = ref, 1+ = alt, "." = no call).
  - Lazy-computed `zygosity` property: `homref`, `homvar`, `hetvar`, `nocall`, or `unknown`.
  - `zygosityScore()` returns a numeric score (0-4) used for sorting samples by genotype.
  - `popupData()` generates click tooltip data including sample name, genotype string, and zygosity label.

- **Helper functions**:
  - `isKnownAlt(alt)` -- checks if all characters are standard nucleotides (A, C, T, G).
  - `determineType(ref, altAlleles)` -- classifies variant type from allele comparison.
  - `arrayToString(value, delim)` -- joins array values for display.

### `variant/variantTrack.ts`

The `VariantTrack` class extends `TrackBase` and implements the complete track lifecycle:

- **Initialization** (`init`, `postInit`):
  - Creates a `FeatureSource` from the config (delegates data loading to the feature module).
  - Reads the VCF header to discover sample names (`sampleNameMap`), INFO fields, and FORMAT fields.
  - Auto-configures `colorBy` to "AF" (allele frequency) if available.
  - Sets a default `visibilityWindow` (1,000,000 bp; 1,000 bp for gnomAD files).
  - Populates `_colorByItems` map for the menu (AF, VT, SVTYPE).

- **Rendering** (`draw`):
  - Draws a two-part display: variant bars in the upper band, per-sample genotype calls below.
  - Variant bars are colored by allele frequency (split bar: ref color on top, alt color on bottom), by INFO attribute via color tables, or by variant type.
  - Per-sample genotype cells are colored by zygosity: `homrefColor`, `homvarColor`, `hetvarColor`, `noCallColor`, `noGenotypeColor`.
  - Supports `COLLAPSED`, `SQUISHED`, and `EXPANDED` display modes with configurable heights and gaps.
  - Filtered variants are rendered with 20% alpha transparency.
  - Supports custom `strokecolor` and `_context_hook` functions for advanced rendering.

- **Interaction** (`clickedFeatures`, `popupData`, `contextMenuItemList`):
  - Click handling distinguishes between clicks on variant bars vs. sample genotype cells.
  - For genotype clicks, the genotype string is lazily expanded via `expandGenotype()` (maps allele indices to actual bases).
  - Context menu offers "Sort by genotype" at the clicked position.
  - Track menu provides color-by options, display mode toggles, show/hide genotypes, sort by sample attributes, and JBrowse circular view integration.

- **Sorting**:
  - `sortSamplesByGenotype()` -- sorts `sampleKeys` by cumulative zygosity score across variants in a region.
  - `sortByAttribute()` -- delegates to `SampleInfo` for attribute-based sorting.

- **CNVPytor conversion** (`convertToPytor`):
  - Can dynamically re-prototype the track to `CNVPytorTrack` for copy number analysis when conditions are met (single sample, DP and AD format fields, non-indexed file).

- **Static defaults**: Defines 20+ default properties including colors for each zygosity state, variant/call heights, gap sizes, and display mode.

### `variant/vcfParser.ts`

The `VcfParser` class handles line-by-line parsing of VCF files:

- **`parseHeader(dataWrapper, genome)`**:
  - Reads `##fileformat` line for version.
  - Parses `##INFO`, `##FILTER`, `##FORMAT` meta-information lines into structured objects keyed by ID.
  - Parses `##contig` lines for sequence names.
  - Parses `#CHROM` header line to build a `sampleNameMap` (Map<string, number>) mapping sample names to column indices.

- **`parseFeatures(dataWrapper)`**:
  - Reads data lines, splits by tab, creates `Variant` objects.
  - Validates column count matches expected (8 + 1 FORMAT + N samples).
  - For multi-sample VCFs, parses the FORMAT column to identify the GT (genotype) field index, then creates `Call` objects for each sample.
  - Automatically creates `SVComplement` features for structural variants with CHR2/END INFO fields.

## Data Flow

```
VCF File
  |
  v
VcfParser.parseHeader() --> VcfHeader (INFO/FORMAT/FILTER metadata, sampleNameMap)
  |
  v
VcfParser.parseFeatures() --> Variant[] (with Call[] per variant, SVComplement for SVs)
  |
  v
FeatureSource (from js/feature/featureSource.js) -- caches, indexes, manages visibility window
  |
  v
VariantTrack.getFeatures() --> retrieves from FeatureSource, applies initial sort
  |
  v
TrackViewport.repaint() --> calls VariantTrack.draw() with canvas context and features
  |
  v
VariantTrack.draw() --> renders variant bars + genotype grid on canvas
  |
  v
VariantTrack.clickedFeatures() / popupData() --> handles user interaction
```

## Dependencies

### Depends on:
- `js/trackBase.ts` -- base class for VariantTrack
- `js/feature/featureSource.js` -- data loading, caching, and indexing
- `js/feature/featureUtils.ts` -- `packFeatures()` for row assignment in multi-row display
- `js/igv-canvas.ts` -- `IGVGraphics` drawing utilities
- `js/util/colorPalletes.ts` -- `ColorTable`, `PaletteColorTable` for color-by-attribute
- `js/sample/sampleInfo.ts` -- sample attribute metadata and sorting
- `js/sample/sampleUtils.ts` -- `doSortByAttributes()` helper
- `js/jbrowse/circularViewUtils.ts` -- `makeVCFChords()`, `sendChords()` for circular view integration
- `js/ui/utils/dom-utils.ts` -- DOM element creation
- `js/igv-icons.ts` -- `createCheckbox()` for menu items
- `igv-utils` (external) -- `StringUtils`, `IGVColor`, `FileUtils`

### Depended on by:
- `js/trackFactory.ts` -- registers VariantTrack for type "variant"
- `js/cnvpytor/cnvpytorTrack.ts` -- VariantTrack can convert to CNVPytorTrack
- `js/util/trackClassRegistry.ts` -- runtime class lookup for CNVPytor conversion
