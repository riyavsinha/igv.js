# Module: UCSC (`js/ucsc/`)

## Purpose

The UCSC module provides integration with the UCSC Genome Browser ecosystem, specifically its Track Hub infrastructure. It parses UCSC hub.txt files and trackDb configuration files, converts UCSC track stanzas into igv.js-compatible track configurations, and provides a specialized `ImageTrack` for rendering pre-rendered genomic images. This enables igv.js to load genomes and tracks directly from UCSC Assembly Hubs and Track Data Hubs.

## Genomic Context

UCSC Track Hubs are a standard mechanism for sharing genome annotations and custom genome assemblies. A hub consists of a hierarchy of text files (hub.txt, genomes.txt, trackDb.txt) that describe available genomes and their associated data tracks. These tracks can reference data in binary formats like bigBed, bigWig, bigGenePred, and VCF, hosted on remote servers. UCSC hubs are widely used by genomics consortia (ENCODE, Gencode, GenArk) to distribute annotation data. By supporting hub loading, igv.js can access thousands of publicly available genome assemblies and annotation datasets without any custom configuration.

## Key Classes & Files

### `ucsc/ucscUtils.ts`
A small utility module with a single function:
- **`convertToHubURL(accession)`** -- Converts a GenBank/RefSeq assembly accession (e.g., "GCF_000001405.40") into a UCSC hub.txt URL on hgdownload.soe.ucsc.edu. This enables loading genomes by accession number rather than requiring the full hub URL. Supports both GCF (RefSeq) and GCA (GenBank) accession prefixes.

### `ucsc/imageTrack.ts`
A track type for displaying pre-rendered images at genomic coordinates:
- **`ImageTrack`** -- Extends `TrackBase`. Configured with a list of `ImageInfo` objects, each mapping a genomic region (chr, start, end) to an image URL. At render time, selects the highest-resolution image that contains the current viewport region, then scales and positions it on the canvas. Supports resolution-aware rendering (the `resolutionAware` flag tells the viewport to pass `bpPerPixel` to `getFeatures()`). Does not support whole-genome view.

### `ucsc/hub/stanza.ts`
The fundamental data structure for parsed hub configuration:
- **`Stanza`** -- Represents a single stanza (block of key-value properties) from a hub.txt or trackDb.txt file. Properties are stored in a `Map<string, string>`. Supports hierarchical property inheritance through a `parent` reference -- when looking up a property, if the stanza does not have it, the parent stanza is consulted (with specific rules: some properties like `visibility` and `priority` are overridden by the parent, while `track`, `type`, and `bigDataUrl` are never inherited). Provides computed properties:
  - `format` -- Extracts the file format from the `type` property (e.g., "bigWig" from "bigWig 0 .5").
  - `displayMode` -- Converts UCSC visibility values ("dense", "pack", "squish") to igv.js display modes ("COLLAPSED", "EXPANDED", "SQUISHED").

### `ucsc/hub/hubParser.ts`
Parses UCSC hub configuration files into `Stanza` objects:
- **`loadStanzas(url)`** -- Fetches a hub text file, parses it line-by-line into an array of `Stanza` objects, and resolves parent-child relationships. Handles:
  - Line continuations (backslash at end of line).
  - Comments (lines starting with `#`).
  - `include` directives (recursively loads referenced files).
  - URL resolution (converts relative paths to absolute URLs using the hub's base URL and host).
  - Special `type` parsing (extracts format and optional data range from "type bigWig 0 .5").
  - A set of known URL properties that need path resolution (`bigDataUrl`, `twoBitPath`, `chromAliasBb`, `trackDb`, etc.).

### `ucsc/hub/hub.ts`
The main Hub class and hub loading logic:
- **`Hub`** -- Represents a fully parsed UCSC track hub. Contains the hub stanza, genome stanzas, optional track stanzas (for "onefile" hubs), and group stanzas. Key methods:
  - `getGenomeConfig(genomeId?)` -- Builds an igv.js genome configuration object from the hub's genome stanza, including twoBitURL, chromSizes, chromosome aliases, cytoband data, default locus, BLAT server URL, and initial track list.
  - `getGroupedTrackConfigurations(genomeId)` -- Loads and returns track configurations organized by group (see `TrackDbHub`). Supports genome ID mapping for common assemblies (e.g., "hg38" maps to "GCF_000001405.40").
  - `#getTrackConfig(stanza)` -- Converts a single track stanza to a `TrackConfig` object, mapping UCSC properties to igv.js equivalents (autoScale, maxHeightPixels, color, altColor, viewLimits, visibility, searchIndex, searchTrix, label fields).
- **`loadHub(url)`** -- Async factory function that fetches and parses a hub. Supports both multi-file hubs (hub.txt + genomes.txt + trackDb.txt) and "onefile" hubs. Results are cached by URL. For assembly hubs with large chromSizes files (>100 KB), the chromSizes property is removed to avoid slow loading.
- **`Hub.supportedTypes`** -- Set of supported track formats: bigBed, bigWig, bigGenePred, vcfTabix.
- **`Hub.filterTracks`** -- Set of track names to exclude from the default track list (cytoBandIdeo, assembly, gap, etc.).
- **`idMappings`** -- Map from common UCSC genome IDs (hg38, mm39, dm6, etc.) to GenBank/RefSeq accessions, used to look up trackDb files for known genomes.

### `ucsc/hub/trackDbHub.ts`
Handles the organization of tracks from a trackDb file into a hierarchical group structure:
- **`TrackDbHub`** -- Processes track stanzas into grouped track configurations. Supports:
  - **superTrack/compositeTrack/view containers** -- Recognized by the presence of `superTrack`, `compositeTrack`, `view`, or `container` properties without `bigDataUrl`. These become `TrackConfigContainer` nodes in the hierarchy.
  - **Group-based organization** -- Tracks with a `group` property are placed into the corresponding group container.
  - **Parent-child relationships** -- Tracks with a `parent` property are placed under the matching container.
  - **Format mapping** -- Maps UCSC types to igv.js formats (e.g., "vcftabix" to "vcf", "genepred" to "refgene").
  - **Metadata parsing** -- Parses UCSC metadata strings into key-value attribute maps.
  - **Extended supported types** -- Beyond the Hub-level set, supports bam, bed, gff, gtf, wig, seg, interact, and many more.
  - `getGroupedTrackConfigurations()` -- Returns an array of `TrackConfigContainer` trees, sorted by priority.
  - `#getTrackConfig(stanza)` -- Converts a stanza to `TrackConfig`, including visibility, viewLimits, maxHeightPixels, color, metadata attributes, maxWindowToDraw, and searchTrix.

### `ucsc/hub/trackConfigContainer.ts`
A tree data structure for organizing track configurations into groups:
- **`TrackConfigContainer`** -- A named, prioritized container holding an array of `TrackConfig` objects and an array of child `TrackConfigContainer` nodes. Provides:
  - `isEmpty()` -- Recursively checks if the container and all children have no tracks.
  - `map(callback)` -- Recursively applies a callback to all tracks.
  - `findTracks(filter)` -- Recursively searches for tracks matching a predicate.
  - `countTracks()` / `countSelectedTracks()` -- Recursive counting.
  - `trim()` -- Removes empty children.
  - `setTrackVisibility(loadedTrackPaths)` -- Marks tracks as visible/invisible based on a set of loaded URLs.

## Data Flow

1. **Hub Loading**: `loadHub(url)` fetches `hub.txt` --> `hubParser.loadStanzas()` parses it into `Stanza[]` --> resolves parent-child relationships --> for multi-file hubs, loads `genomes.txt` and group files.
2. **Genome Configuration**: `Hub.getGenomeConfig()` reads genome stanza properties --> builds an igv.js-compatible genome config object with twoBitURL, chromSizes, aliases, default locus, and an initial track list.
3. **Track Discovery**: `Hub.getGroupedTrackConfigurations()` --> loads trackDb stanzas (if not already loaded) --> `TrackDbHub.getGroupedTrackConfigurations()` organizes stanzas into `TrackConfigContainer` trees --> each leaf stanza is converted to a `TrackConfig` via `#getTrackConfig()`.
4. **Property Inheritance**: When converting a stanza to config, property lookups traverse the parent chain (via `Stanza.getProperty()`), so child tracks inherit parent properties like color, visibility, and autoScale.

## Dependencies

**Depends on**:
- `igv-utils` (igvxhr for HTTP loading, StringUtils for string manipulation)
- `js/types/config.ts` (TrackConfig interface)
- `js/trackBase.ts` (ImageTrack extends TrackBase)
- `js/igv-canvas.ts` (IGVGraphics for ImageTrack drawing)

**Depended on by**:
- `js/browser.ts` -- Uses `loadHub()` and `Hub.getGenomeConfig()` for hub-based genome loading.
- `js/genome/genome.ts` -- Hub genome configurations feed into genome initialization.
- Hub selection UI components that present grouped track configurations to the user.
