# Session Module

## Purpose

The Session module provides parsing support for IGV Desktop XML session files, enabling igv.js to import and restore browser state (genome, locus, and track configurations) from XML session files originally created by the Java-based IGV Desktop application. This provides interoperability between the two IGV platforms, allowing users to share session configurations across the desktop and web versions of the viewer.

## Genomic Context

IGV Desktop saves session state as XML files (`.xml` extension) that capture the currently loaded genome, viewed locus, and all configured tracks with their display properties. These sessions are commonly shared between collaborators or archived alongside publications to allow exact reproduction of a particular genomic view. The session format records track data source URLs, display colors, height, autoscale settings, data ranges, and other visualization parameters. Supporting this format in igv.js allows researchers who primarily use IGV Desktop to open their sessions in a web browser without manual reconfiguration.

## Key Classes & Files

### `session/igvXmlSession.ts`
The sole file in this module, containing the `XMLSession` class and the `extractTrackAttributes()` helper function.

**`XMLSession` class:**
- Constructor takes an XML string and a `knownGenomes` dictionary (mapping genome IDs to genome configurations).
- Parses the XML using the browser's `DOMParser` API.
- **Genome resolution** (`processRootNode()`):
  - Reads the `genome` attribute from the `<Session>` root element.
  - If the genome ID is found in `knownGenomes`, stores it as `this.genome` (a simple string ID like `"hg38"`).
  - Otherwise, treats the genome value as a FASTA URL and stores it as `this.reference = { fastaURL, id? }`, optionally including a UCSC ID from the `ucscID` attribute.
  - Reads the `locus` attribute for the initial view position.
- **Track parsing**:
  - Reads all `<Resource>` elements to build a `resourceMap` mapping URLs to track configurations with `url`, `indexURL`, and `order` properties.
  - If `<Track>` elements are present, processes them to extract display attributes and associate them with resources by ID.
  - Supports **merged tracks**: `<Track>` elements containing nested `<Track>` sub-elements are parsed as `type: 'merged'` with a `tracks` array of sub-track configurations.
  - Marks processed sub-tracks to avoid double-processing.

**`extractTrackAttributes()` function:**
Extracts display properties from a `<Track>` XML element into a `TrackConfig` object:
- `name` -- Track display name
- `color` / `altColor` -- Converted from comma-separated RGB to `rgb()` CSS strings
- `height` -- Parsed as integer
- `autoScale` -- Boolean from string
- `autoscaleGroup` -- Group identifier for coordinated autoscaling
- `windowFunction` -- Summarization function (e.g., "mean", "max")
- `visibilityWindow` / `featureVisibilityWindow` -- Maximum view range for feature display
- `indexed` -- Whether the data file has an index
- `normalize` -- Normalization flag
- `DataRange` sub-element: Extracts `min`, `max`, and `logScale` (when type is "LOG")

**`TrackConfig` interface** (local to this file):
A permissive configuration object with optional standard fields (`url`, `indexURL`, `order`, `name`, `color`, `altColor`, `height`, `autoscale`, `autoscaleGroup`, `windowFunction`, `visibilityWindow`, `indexed`, `normalize`, `min`, `max`, `logScale`, `type`, `tracks`) plus a `[key: string]: any` index signature for extensibility.

## Data Flow

```
XML Session File (string)
    |
    v
new XMLSession(xmlString, knownGenomes)
    |
    +-- DOMParser.parseFromString() -> XML Document
    |
    +-- processRootNode()
    |       +-- <Session genome="..." locus="..." ucscID="...">
    |       +-- Resolves genome ID or FASTA URL
    |       +-- Extracts initial locus
    |
    +-- Parse <Resource> elements
    |       +-- Build resourceMap: URL -> { url, indexURL, order }
    |
    +-- Parse <Track> elements (if present)
    |       +-- Match tracks to resources by ID
    |       +-- extractTrackAttributes() for each track
    |       +-- Handle merged tracks (nested <Track> elements)
    |
    v
XMLSession instance:
    - genome: string (e.g., "hg38")
    - reference: { fastaURL, id? } (for custom genomes)
    - locus: string (e.g., "chr1:1000-2000")
    - tracks: TrackConfig[] (ordered track configurations)
    |
    v
Browser consumes XMLSession to restore state
```

## Dependencies

### Depends On
- No external module dependencies. Uses only the browser-native `DOMParser` API for XML parsing.

### Depended On By
- `js/browser.ts` (or session loading utilities) -- Imports `XMLSession` to parse IGV Desktop session files when the user loads an `.xml` session. The resulting `XMLSession` object's properties (`genome`, `reference`, `locus`, `tracks`) are used to configure the browser and load tracks.
