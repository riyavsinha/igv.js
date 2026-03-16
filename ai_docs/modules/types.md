# Module: Types (`js/types/`)

## Purpose

The `types` module is the central type-definition layer for igv.js. It defines the TypeScript interfaces and type declarations that describe the shapes of configuration objects, genomic features, UI components, data readers, and third-party vendor APIs used throughout the codebase. By centralizing these definitions, it ensures type-safe communication between modules and reduces scattered inline type annotations.

## Genomic Context

This module does not directly handle biological data. Instead, it provides the structural contracts that genomic data flows through. For example, `GenomicFeature` defines the universal shape of a chromosomal feature (chr, start, end, strand, exons), `FeatureReader` defines how feature data is fetched from files, and `DrawConfiguration` defines how genomic data is rendered onto canvas. These types bridge the gap between raw biological file formats and their visual representation.

## Key Classes & Files

### `types/feature.ts`
Defines the core genomic data types:
- **`GenomicFeature`** -- The universal interface for any genomic interval (chr, start, end, name, score, strand, exons). Has a `[key: string]: any` index signature because format-specific parsers add dynamic attributes.
- **`Exon`** -- Sub-region of a gene with optional coding start/end and UTR flag.
- **`PopupDataItem`** / **`PopupData`** -- Structured data items for click-popup tooltips (name/value pairs or raw HTML strings).
- **`BedpeFeature`** -- Extension of `GenomicFeature` for paired-end interaction data (BedPE format), with two loci (chr1/start1/end1, chr2/start2/end2) and transient draw state.
- **`BedpeDrawState`** (union) -- Rendering state variants for BedPE features: nested arcs, proportional ellipses, or rectangles.

### `types/config.ts`
Configuration interfaces for browser initialization and track loading:
- **`LoadConfig`** -- Common options for HTTP requests (oauthToken, headers, withCredentials).
- **`TrackConfig`** -- Base configuration for all track types (url, format, name, height, color, displayMode). Has `[key: string]: any` for backward-compatible arbitrary properties.
- **`BrowserConfig`** -- Top-level options for creating an igv.js browser instance, including display toggles (showNavigation, showRuler, showIdeogram, etc.), authentication (apiKey, oauthToken), search configuration, and event listeners.
- **`SearchConfigInput`** / **`SearchConfig`** -- User-facing vs. resolved internal search service configuration.
- **`ROIConfig`** -- Regions of interest definitions.
- **`SessionObject`** -- Serialized session state for save/restore.
- **`SampleInfoConfig`**, **`CustomButtonConfig`**, **`SessionLoadOptions`** -- Ancillary configuration types.

### `types/ui.ts`
UI-related interfaces used across tracks, viewports, and interaction handlers:
- **`ClickState`** -- Captures the full context of a mouse click (viewport, genomic location, canvas coordinates, reference frame).
- **`TrackViewportLike`**, **`TrackViewLike`**, **`TrackLike`** -- Minimal "duck-type" interfaces used by cross-cutting concerns to avoid tight coupling to concrete classes.
- **`FeatureCacheLike`** -- Interface for viewport feature caches.
- **`DataRange`** -- Min/max range with optional log scale flag.
- **`MenuItem`** -- Defines a track context menu item (label, click handler, dialog handler, checkbox state).
- **`DrawConfiguration`** -- The core rendering options bag passed to every track's `draw()` method. Contains canvas context, pixel dimensions, bp-per-pixel scale, reference frame, features, and numerous optional rendering hints. Has `[key: string]: unknown` for track-specific extensions.
- **`Track`** -- The structural interface for all ~18 track types. Declares identity fields (type, id, name), layout fields (height, minHeight, maxHeight), rendering fields (color, displayMode), scaling fields (autoscale, dataRange), and the required `draw()` method. Uses `[key: string]: any` because tracks receive dynamic properties via config merging in `TrackBase.init()`.

### `types/browser.ts`
Browser-specific internal types:
- **`VpMouseDown`** -- State captured on viewport mouse-down for drag/pan tracking (viewport, mouse coordinates, reference frame).
- **`DragObject`** -- Active drag state during viewport panning.

### `types/genome.ts`
Genome-related interfaces:
- **`GenomeConfig`** -- Configuration for loading a reference genome (fastaURL, indexURL, cytobandURL, twoBitURL, chromosomeOrder, etc.).
- **`ChromAlias`** -- Interface for chromosome name aliasing (e.g., "chr1" vs "1" vs "NC_000001.11").
- **`SequenceSource`** -- Interface for reference sequence providers with `init()` and `getSequence()` methods.

### `types/reader.ts`
Duck-typed interfaces for the reader/source pattern:
- **`FeatureReader`** -- Reads features for a genomic region: `readFeatures(chr, start, end)`.
- **`FeatureSource`** -- Higher-level data source with `getFeatures()`, `supportsWholeGenome`, and `trackType`. Has `[key: string]: any` for duck-typed methods used by various track implementations.
- **`FeatureQueryOptions`** -- Query parameters for feature lookups (chr, start, end, bpPerPixel, visibilityWindow).

### `types/igv-utils.d.ts`
Ambient module declarations for the `igv-utils` package (which lacks its own `.d.ts` files). Declares types for:
- `StringUtils`, `FileUtils`, `URIUtils`, `FeatureUtils` -- String/file/URL/feature utility namespaces.
- `IGVColor` -- Color manipulation (rgbColor, addAlpha, rgbComponents, darkenLighten).
- `IGVMath` -- Math utilities (mean, percentile, clamp, log2).
- `BGZip` -- Block-gzip decompression.
- `igvxhr` -- HTTP request layer (load, loadString, loadJson, loadArrayBuffer).
- `GoogleAuth` -- Google OAuth integration.
Uses wildcard module declarations to cover multiple import path depths.

### `types/vendor.d.ts`
Ambient type declarations for vendor dependencies without their own types:
- `hdf5-indexed-reader` -- HDF5 file access (used by CNVpytor track).
- `hic-straw` -- Hi-C contact matrix file access (HicFile, contact records, normalization vectors).
- `circular-view` -- Circular genome visualization (chord diagrams).
- `vanilla-picker` -- Color picker widget.

## Data Flow

Types in this module do not contain runtime logic. They flow through the system as compile-time contracts:

1. **Configuration flow**: `BrowserConfig` --> Browser constructor --> `TrackConfig` --> individual track constructors --> `LoadConfig` --> `igvxhr` HTTP requests.
2. **Feature flow**: `FeatureReader.readFeatures()` returns `GenomicFeature[]` --> cached in `FeatureCacheLike` --> passed via `DrawConfiguration.features` to `Track.draw()`.
3. **Interaction flow**: Mouse events produce `ClickState` --> passed to `Track.popupData()` --> returns `PopupData[]` --> rendered in `Popover`.
4. **Menu flow**: `Track.menuItemList()` returns `MenuItem[]` --> rendered by `MenuPopup.presentMenuList()`.

## Dependencies

**Depended on by**: Nearly every module in igv.js imports from `js/types/`. Key consumers include `Browser`, `TrackView`, `TrackViewport`, `Viewport`, all track implementations, all feature readers, and UI components.

**Depends on**: Minimal runtime dependencies. Imports `ReferenceFrame` and `TrackViewport` for type-only references. `Chromosome` from `js/genome/chromosome` for `SequenceSource`. `GenomicFeature` is cross-referenced between `feature.ts` and `config.ts`.
