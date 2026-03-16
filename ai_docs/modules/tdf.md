# TDF Module

## Purpose

The TDF module provides reading and data extraction for TDF (Tiled Data Format) files, a binary format created by IGV Desktop for efficient storage and retrieval of summarized genomic data at multiple zoom levels. The module consists of a binary file reader that parses the TDF header, index, datasets, groups, and tiles, and a data source that translates genomic queries into feature arrays suitable for track rendering. TDF files are pre-computed summaries that enable fast visualization of large datasets like coverage tracks and signal data.

## Genomic Context

TDF is a proprietary binary format developed for the Integrative Genomics Viewer (IGV). It stores pre-computed summaries of quantitative genomic data (e.g., read coverage, ChIP-seq signal, gene expression values) at multiple resolution levels (zoom levels). Each zoom level corresponds to a different level of data aggregation, allowing the viewer to quickly display an appropriate summary for the current view range without recomputing from raw data. The format supports multiple window functions (mean, median, min, max, etc.) and can store data for multiple tracks within a single file. TDF files are typically generated from wiggle (WIG), bedGraph, or BAM files using the `igvtools` command-line utility. The tiled storage structure allows efficient random access via HTTP range requests, making TDF well-suited for remote data access.

## Key Classes & Files

### `tdf/tdfReader.ts`
A binary reader for the TDF file format. Handles parsing the file header, index structures, datasets, groups, and individual data tiles via HTTP range requests. Key components:

**File Structure Parsing:**
- `readHeader()`: Reads the 64KB file header containing magic number, version, index position/size, window functions list, track type, track line, track names, genome ID, and compression flags. Then reads the dataset and group indices from the index position.
- Dataset index: Maps dataset names (e.g., `/chr1/z3/mean`) to `{position, size}` entries for random access.
- Group index: Maps group names to `{position, size}` entries.

**Dataset Reading (`readDataset()`):**
- Constructs a dataset name from chromosome, zoom level, and window function (e.g., `/chr1/z3/mean` or `/chr1/raw`).
- Reads dataset metadata: attributes, data type, tile width, and an array of tile index entries.
- Caches results in `datasetCache` keyed by `chr_windowFunction_zoom`.

**Group Reading:**
- `readRootGroup()`: Reads the root group `/` which contains global metadata including chromosome names, `maxZoom`, and `totalCount` (used for normalization).
- `readGroup(name)`: Reads an arbitrary named group containing key-value attribute pairs.
- Builds a `chrAliasTable` mapping canonical chromosome names (from the genome) to TDF-internal chromosome names.

**Tile Reading (`readTiles()` / `readTile()`):**
Reads and decompresses (if gzipped) individual data tiles. Supports three tile types:

| Tile Type | Structure | Fields |
|-----------|-----------|--------|
| `fixedStep` | Uniform spacing | `start`, `span`, `data[][]` (nTracks x nPositions) |
| `variableStep` | Variable positions | `tileStart`, `span`, `start[]`, `data[][]` |
| `bed` / `bedWithName` | BED intervals | `start[]`, `end[]`, `data[][]`, optional `name[]` |

**Caching**: Both datasets and groups are cached after first read to avoid redundant HTTP requests.

**Interfaces defined:**
- `IndexEntry`: `{ position: number, size: number }` for index lookups.
- `Dataset`: `{ name, attributes, dataType, tileWidth, tiles: TileIndex[] }`.
- `FixedStepTile`, `VariableStepTile`, `BedTile`: Discriminated union `Tile` type.

### `tdf/tdfSource.ts`
A data source (extends `BaseFeatureSource`) that wraps `TDFReader` and provides the standard `getFeatures()` interface for track rendering. Key behavior:

**Zoom Level Selection (`zoomLevelForScale()`):**
- Converts the current `bpPerPixel` display scale to a TDF zoom level.
- Uses the formula: `ceil(log2(chrSize / (bpPerPixel * 700)))`, based on IGV Desktop's assumption of a 700-pixel display window.
- If the computed zoom exceeds `maxZoom`, falls back to "raw" data.

**Feature Retrieval (`_getFeatures()`):**
1. Reads the root group on first access (for chromosome aliases and normalization factor).
2. Computes the appropriate zoom level for the current scale.
3. Translates chromosome names via the alias table.
4. Reads the dataset for the chromosome/zoom/windowFunction combination.
5. Determines which tiles overlap the query range based on `tileWidth`.
6. Reads the relevant tiles and decodes them into feature arrays.

**Tile Decoding Functions:**
- `decodeBedTile()`: Iterates bed tile positions, filtering to the query range.
- `decodeVaryTile()`: Converts variable-step positions + span to start/end intervals.
- `decodeFixedTile()`: Converts fixed-step start + span to sequential intervals, skipping NaN values.
- All produce `TDFFeature` objects: `{ chr, start, end, value }`.

**Whole-Genome Support (`getWGValues()`):**
- Iterates all chromosomes, fetching features at a resolution of `chrLength / 1000` bp/pixel.
- Maps chromosome-specific coordinates to whole-genome coordinates via `genome.getGenomeCoordinate()`.
- Caches results per window function, with tolerance for bpPerPixel within +/-20%.

**Properties:**
- `queryable: true` -- supports range queries.
- `supportsWholeGenome: true` -- can provide whole-genome view.
- `windowFunctions` getter -- exposes available window functions from the reader.
- `normalizationFactor` -- computed from root group's `totalCount` as `1e6 / totalCount` (RPM normalization).

**Interfaces defined locally:**
- `TDFFeature`: `{ chr, start, end, value, _f? }` where `_f` is the original feature for whole-genome mapped features.
- `TDFTile`, `TDFDataset`: Simplified interfaces used in decoding.
- `GetFeaturesParams`: `{ chr, start, end, bpPerPixel, windowFunction? }`.

## Data Flow

```
TDF Binary File (remote or local)
    |
    v
TDFReader.readHeader()
    |
    +-- Parse magic, version, index position
    +-- Read window functions, track type, track names, genome ID
    +-- Read dataset index: name -> { position, size }
    +-- Read group index: name -> { position, size }
    |
    v
TDFSource.getFeatures({ chr, start, end, bpPerPixel })
    |
    +-- TDFReader.readRootGroup()
    |       +-- maxZoom, totalCount, chrAliasTable
    |
    +-- zoomLevelForScale(chr, bpPerPixel, genome) -> zoom level
    |
    +-- TDFReader.readDataset(chr, windowFunction, zoom)
    |       +-- Returns Dataset with tileWidth and tile indices
    |
    +-- Determine tile range: startTile..endTile
    |
    +-- TDFReader.readTiles(tileIndices, nTracks)
    |       +-- For each tile index:
    |       |       +-- HTTP range request for tile data
    |       |       +-- Decompress if gzipped (BGZip.inflate)
    |       |       +-- Parse as fixedStep / variableStep / bed
    |       v
    +-- decodeBedTile() / decodeVaryTile() / decodeFixedTile()
    |       +-- Filter to query range [start, end]
    |       +-- Produce TDFFeature[] { chr, start, end, value }
    |
    v
Features sorted by start position -> returned to track for rendering

Whole-genome view:
    TDFSource.getWGValues(windowFunction, bpPerPixel)
        +-- For each chromosome: _getFeatures(chr, 0, len, ...)
        +-- Map to genome coordinates
        +-- Cache result
```

## Dependencies

### Depends On
- `js/binary.ts` -- `BinaryParser` for reading binary data types (int, long, float, string) from `DataView`
- `js/genome/genomicInterval.ts` -- `GenomicInterval` class (used to represent query ranges, though mainly as a container)
- `js/feature/baseFeatureSource.ts` -- `BaseFeatureSource` base class providing common feature source infrastructure
- `js/util/igvUtils.ts` -- `buildOptions()` for constructing HTTP request options with auth tokens
- `igv-utils` -- `igvxhr` for HTTP range requests (`loadArrayBuffer`), `BGZip` for gzip decompression

### Depended On By
- `js/trackFactory.ts` (or equivalent) -- Routes `format='tdf'` track configurations to create a `TDFSource`
- Quantitative track types (e.g., `wigTrack.ts` or similar) -- Consume `TDFSource.getFeatures()` output for rendering signal/coverage data
- `js/browser.ts` -- Indirectly, through track creation pipeline
