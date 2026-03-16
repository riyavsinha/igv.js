# ROI (Regions of Interest) Module

## Purpose

The ROI module provides the ability to define, display, and manage highlighted genomic regions overlaid on the IGV browser viewport. It supports both file-based ROI sets (loaded from BED or other feature files) and user-defined regions created interactively, rendering them as semi-transparent colored overlays that span all tracks. The module also includes a tabular view of all regions, a context menu for per-region actions, and SVG export support.

## Genomic Context

Regions of Interest mark specific genomic intervals (e.g., chr1:1000-2000) that a researcher wants to highlight across all tracks for visual emphasis. These regions are commonly used to flag areas of biological significance such as known regulatory elements, mutation hotspots, copy number variants, or experimentally identified binding sites. ROIs can be loaded from standard genomic feature files (BED, GFF, etc.) or defined on-the-fly by the user during an interactive session.

## Key Classes & Files

### `roi/ROIManager.ts`
The central coordinator for all ROI functionality. Manages the collection of `ROISet` instances, orchestrates rendering of overlay elements onto browser columns, handles locus-change events to reposition overlays, and provides the API for loading, clearing, toggling visibility, and serializing ROI state. Also manages the `ROIMenu` and `ROITable` child components. Key responsibilities:
- Loads ROI configurations via `loadROI()`, creating `ROISet` instances and triggering rendering.
- Renders overlay DOM elements (`div.igv-roi-region`) into each browser column, positioned via base-pair-to-pixel coordinate conversion.
- Maintains a user-defined ROI set for interactively created regions, firing `roiadded`/`roiremoved` browser events.
- Provides `renderSVGContext()` for SVG export of ROI overlays.
- Listens to `locuschange` browser events to re-render all ROI sets when the view changes.

### `roi/ROISet.ts`
Represents a single collection of ROI features with a common name and color. Wraps either a `FeatureSource` (for file-backed regions) or a `DynamicFeatureSource` (for in-memory user-defined regions). Key details:
- `DynamicFeatureSource` (inner class): An in-memory feature store organized as a `Record<string, GenomicFeature[]>` keyed by chromosome. Supports `addFeature()`, `removeFeature()`, and whole-genome view via `computeWGFeatures()`.
- Applies default Apple Crayon color palette colors with 1/16 alpha transparency for overlays, with a solid-alpha header color derived from the body color.
- Exports `screenCoordinates()` utility to convert base-pair ranges to pixel x/width, enforcing a minimum 3-pixel width threshold.
- Serializes to JSON via `toJSON()`, outputting either a URL reference or an inline feature list.

### `roi/ROIMenu.ts`
A context menu displayed when clicking on an ROI region header. Provides actions contextual to the clicked region:
- **Set description**: Opens an input dialog to name a user-defined region.
- **Copy reference sequence**: Copies the genomic sequence underlying the region to clipboard (max 1 MB, secure context only).
- **BLAT reference sequence**: Sends the region's sequence to BLAT for alignment (max 25 KB).
- **Sort by value**: Sorts tracks that support `sortByValue()` by values within the ROI region (ascending or descending).
- **Delete**: Removes a user-defined region, firing `roiremoved` event and cleaning up DOM elements.

### `roi/ROITable.ts`
A tabular UI component (extends `RegionTableBase`) that displays all ROI regions in a sortable, selectable table. Features:
- Columns: Chr, Start, End, Description, ROI Set name.
- "Go to selected region(s)" button navigates the browser to selected loci.
- "Copy Sequence" button copies the reference sequence of a single selected region (max 1 MB).
- "Hide/Show Overlays" toggle button controls overlay visibility via `ROIManager.toggleROIs()`.
- Row selection enables/disables the copy sequence button based on region size.

### `roi/roiTableControl.ts`
A navbar button (extends `NavbarButton`) that toggles the ROI table's visibility. Initially hidden; becomes visible when ROI sets are loaded. Clicking toggles the `doShowROITable` browser state.

### `roi/roiUtils.ts`
Pure utility functions for creating and parsing region keys:
- `createRegionKey(chr, start, end)`: Produces a string key like `chr1-1000-2000`.
- `parseRegionKey(regionKey)`: Parses the key back into `{chr, start, end, locus, bedRecord}` components, handling chromosome names that may themselves contain hyphens.

### `roi/trackROISet.ts`
A lightweight variant of `ROISet` designed for per-track ROI rendering. Unlike `ROISet` which renders DOM overlay elements, `TrackROISet` draws ROI regions directly onto a track's canvas context using `IGVGraphics.fillRect()`. Used by individual tracks that want to paint ROI highlights within their own viewport rather than as global overlays.

## Data Flow

```
ROI Configuration (ROIConfig)
    |
    v
ROIManager.loadROI()
    |
    +-- infers file format if needed
    +-- creates ROISet instances
    |       |
    |       +-- FeatureSource (file-backed, e.g. BED)
    |       +-- DynamicFeatureSource (in-memory features)
    |
    v
ROIManager.renderROISet()
    |
    +-- For each browser column (multi-locus view):
    |       +-- roiSet.getFeatures(chr, start, end)
    |       +-- screenCoordinates() -> pixel x, width
    |       +-- createRegionElement() -> DOM div.igv-roi-region
    |       +-- appended to column container
    |
    +-- ROITable.renderTable() with all records
    |
    v
On locuschange event:
    ROIManager.renderAllROISets() -> re-renders overlays

User interaction:
    Click region header -> ROIMenu.present()
    ROIMenu actions -> modify ROISet, re-render table/overlays

TrackROISet (per-track):
    TrackROISet.getFeatures() -> TrackROISet.draw() onto canvas
```

## Dependencies

### Depends On
- `js/feature/featureSource.ts` -- `FeatureSource` factory for file-backed feature loading
- `js/feature/featureUtils.ts` -- `computeWGFeatures()` for whole-genome view
- `js/browser.ts` -- `Browser` instance for event system, genome access, column container
- `js/ui/utils/dom-utils.ts` -- DOM element creation and coordinate translation
- `js/ui/utils/ui-utils.ts` -- Dialog close handler attachment
- `js/ui/regionTableBase.ts` -- Base class for `ROITable`
- `js/ui/navbarButton.ts` -- Base class for `ROITableControl`
- `js/canvas2svg.ts` -- `C2SContext` type for SVG export
- `js/util/colorPalletes.ts` -- Apple Crayon color palette utilities
- `js/util/igvUtils.ts` -- `getElementVerticalDimension()`, `isSecureContext()`
- `js/util/fileFormatUtils.ts` -- `inferFileFormat()` for auto-detecting ROI file types
- `js/blat/blatTrack.ts` -- `createBlatTrack()` for BLAT sequence alignment
- `js/search.ts` -- `parseLocusString()` for navigating to selected regions
- `js/igv-canvas.ts` -- `IGVGraphics` for canvas drawing in `TrackROISet`
- `js/types/config.ts` -- `ROIConfig` type
- `js/types/ui.ts` -- `Track`, `MenuItem` types
- `js/types/feature.ts` -- `GenomicFeature` type

### Depended On By
- `js/browser.ts` -- Creates and manages the `ROIManager` instance, wires up `ROITableControl`
- Individual track types that use `TrackROISet` for per-track ROI painting
