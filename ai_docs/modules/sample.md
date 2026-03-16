# Sample Module

## Purpose

The Sample module manages sample-level metadata display in IGV, providing the infrastructure for showing sample names alongside multi-sample tracks (e.g., variant/VCF and alignment tracks) and rendering color-coded sample attribute columns. It handles loading sample information from files or configuration objects, mapping sample identifiers between different naming conventions, sorting samples by attribute values, and rendering both sample name labels and attribute heatmap tiles in dedicated viewport columns.

## Genomic Context

Multi-sample genomic data formats like VCF (Variant Call Format) and multi-sample BAM files contain data for many biological samples (patients, cell lines, experimental conditions). Researchers need to see which row of data corresponds to which sample, and often need to visualize clinical or experimental metadata (e.g., tumor type, treatment group, phenotype scores) as color-coded columns alongside the genomic data. This module also supports PLINK `.fam` format files, which are standard in genome-wide association studies (GWAS) for encoding family structure and phenotype information. The sample info visualization helps researchers identify patterns between sample metadata and genomic features.

## Key Classes & Files

### `sample/sampleInfo.ts`
The core data model for sample metadata. Manages loading, storing, querying, and color-mapping of sample attributes. Key capabilities:
- **Loading**: Supports two input modes: (1) URL-based loading of a custom tab-delimited file format with `#sampleTable`, `#sampleMapping`, and `#colors` sections, or (2) inline JSON configuration objects.
- **Sample dictionary**: `sampleDictionary` maps sample names to `Record<string, string | number>` attribute records. Automatically converts numeric-looking strings to numbers via `toNumericalRepresentation()`.
- **Sample mapping**: `sampleMappingDictionary` maps alternative sample names to canonical names, enabling lookup when sample IDs differ between data files and metadata files.
- **Color system**: A sophisticated multi-strategy color assignment system:
  - Explicit attribute-value-to-color mappings from the `#colors` section.
  - Clamped numeric range mappings with alpha interpolation.
  - Two-color heatmap lerp for numeric ranges.
  - Wildcard (`*`) mappings for catch-all attribute or value coloring.
  - Hash-based deterministic RGB generation for unmapped string values (`stringToRGBString()`).
  - `colorForNA` (magnesium gray) for missing data.
- **Sorting**: `sortSampleKeysByAttribute()` sorts sample keys by a given attribute, partitioning into numeric and string values and sorting each group independently.
- **Attribute ranges**: `attributeRangeLUT` tracks min/max for numeric attributes, used for color interpolation.

### `sample/sampleInfoViewport.ts`
Renders the color-coded sample attribute tiles in a dedicated column to the right of the main track viewport. Key behavior:
- Creates a canvas element within an `igv-viewport` div appended to the sample info column.
- `draw()` iterates over sample names, looking up each sample's attributes and rendering colored rectangles (tiles) for each attribute. Tile width is fixed at 16px (`sampleInfoTileWidth`), with an 8px x-offset shim.
- For ideogram tracks, renders rotated attribute name labels as column headers and calculates the required column height from text metrics.
- Maintains a `hitList` dictionary mapping pixel bounding boxes to attribute/value strings for mouse hover tooltips.
- Mouse click on ideogram column headers triggers `track.sortByAttribute()` for all sortable tracks.
- Supports SVG export via `renderSVGContext()` using `C2SContext`.
- Handles group dividers via `drawGroupDividers()` from `sampleUtils.ts`.

### `sample/sampleNameViewport.ts`
Renders sample name labels in a dedicated column to the left of the sample info column. Key behavior:
- Creates a canvas and draws sample names as text, vertically positioned to align with track rows.
- Auto-calculates the required viewport width from text metrics (capped at 200px), triggering a browser layout change to accommodate the widest name.
- Provides a context-menu handler that opens an input dialog to manually set the name panel width.
- Supports mouse-move tooltips and SVG export via `renderSVGContext()`.
- Draws group dividers between sample groups.

### `sample/sampleInfoControl.ts`
A navbar button (extends `NavbarButton`) that toggles visibility of the sample info column. Controls the display state of the `.igv-sample-info-column` DOM element and triggers `browser.layoutChange()` when toggled. Initially hidden; shown when tracks with `getSamples()` are detected.

### `sample/sampleNameControl.ts`
A navbar button (extends `NavbarButton`) that toggles visibility of the sample name column. Controls the display state of the `.igv-sample-name-column` DOM element. Visibility is configured via `browser.config.showSampleNames` and `browser.config.showSampleNameButton`.

### `sample/sampleInfoConstants.ts`
Exports two layout constants used across the module:
- `sampleInfoTileWidth`: 16 pixels -- width of each attribute color tile.
- `sampleInfoTileXShim`: 8 pixels -- horizontal offset before the first tile.

### `sample/sampleInfoPaletteLibrary.ts`
Provides a library of 18 distinct RGB color triplets used for coloring numeric attribute values when no explicit color mapping is provided. Colors are parsed from RGB strings into `[r, g, b]` arrays for alpha blending in `SampleInfo.getAttributeColor()`.

### `sample/sampleUtils.ts`
Shared utility functions and types for sample rendering:
- `SamplesDrawData` interface: `{ names: string[], height?: number, yOffset?: number, groupIndeces?: number[], groups?: Map<string, { count: number }> }` -- the standard data shape returned by `track.getSamples()` for rendering.
- `doSortByAttributes()`: Checks whether a set of sample keys have matching attribute names in the `SampleInfo` registry before attempting an attribute-based sort.
- `drawGroupDividers()`: Draws dashed horizontal lines between sample groups on a canvas context.
- `NULL_GROUP` constant: `'None'` -- the default group name.
- `GROUP_MARGIN_HEIGHT` constant: 16 pixels -- vertical spacing between groups.

### `sample/plinkSampleInformation.ts`
Loads PLINK `.fam` format files containing family-based sample metadata. Parses space-delimited lines into `PlinkAttributes` records with fields: `familyId`, `fatherId`, `motherId`, `sex`, `phenotype`. Exports a factory function `loadPlinkFile(url, config)` that returns a populated `PlinkSampleInformation` instance. Note: This appears to be a standalone utility not directly integrated with the main `SampleInfo` class.

## Data Flow

```
Configuration (SampleInfoConfig)
    |
    v
SampleInfo.loadSampleInfo()
    |
    +-- URL path: loadSampleInfoFile() -> fetch text -> parse sections
    |       +-- #sampleTable section -> sample name -> attribute records
    |       +-- #sampleMapping section -> alias name -> canonical name
    |       +-- #colors section -> color scheme functions
    |
    +-- Inline config: extract key/value pairs directly
    |
    v
SampleInfo stores:
    - sampleDictionary: Record<sampleName, Record<attribute, value>>
    - sampleMappingDictionary: Record<alias, canonical>
    - colorDictionary: Record<attribute|value, colorFunction>
    - attributeRangeLUT: Record<attribute, [min, max]>
    - attributeNames: string[]
    |
    v
Track.getSamples() -> SamplesDrawData { names, height, yOffset, groups }
    |
    +---> SampleNameViewport.draw()
    |       +-- draws sample name text aligned to track rows
    |
    +---> SampleInfoViewport.draw()
            +-- for each sample name:
            |     +-- SampleInfo.getAttributes(name)
            |     +-- for each attribute: SampleInfo.getAttributeColor()
            |     +-- fillRect() colored tile
            +-- drawGroupDividers()

User interactions:
    - Click SampleInfoControl -> toggle column visibility
    - Click SampleNameControl -> toggle name column visibility
    - Click attribute header (ideogram) -> sort all tracks by attribute
    - Right-click name column -> set panel width
```

## Dependencies

### Depends On
- `js/ui/navbarButton.ts` -- Base class for `SampleInfoControl` and `SampleNameControl`
- `js/ui/utils/dom-utils.ts` -- DOM creation, GUID generation, mouse coordinate translation
- `js/ui/navbarIcons/sampleInfo.ts` -- SVG icons for sample info button
- `js/ui/navbarIcons/sampleNames.ts` -- SVG icons for sample name button
- `js/ui/navbarIcons/buttonLabel.ts` -- Button label rendering
- `js/util/colorPalletes.ts` -- `appleCrayonRGB`, `rgbaColor`, `rgbStringHeatMapLerp`, `rgbStringTokens`
- `js/igv-canvas.ts` -- `IGVGraphics` for canvas drawing operations
- `js/canvas2svg.ts` -- `C2SContext` type for SVG export
- `js/trackBase.ts` -- `TrackBase` (imported but only for type reference in `sampleInfo.ts`)
- `js/rulerTrack.ts` -- `defaultRulerHeight` constant for ideogram column height adjustment
- `js/browser.ts` -- `Browser` type for accessing genome, layout, track views
- `js/trackView.ts` -- `TrackView` type
- `js/types/ui.ts` -- `Track` interface
- `js/types/config.ts` -- `SampleInfoConfig` type
- `igv-utils` -- `igvxhr` for HTTP loading, `IGVMath` for clamping

### Depended On By
- `js/browser.ts` -- Creates `SampleInfo`, `SampleInfoControl`, `SampleNameControl` instances
- `js/trackView.ts` -- Creates `SampleInfoViewport` and `SampleNameViewport` for each track
- Track types with `getSamples()` (e.g., `alignmentTrack.ts`, variant tracks) -- provide `SamplesDrawData` for rendering
