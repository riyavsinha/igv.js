# BigWig Module

## Purpose

The BigWig module provides readers and data sources for UCSC BigWig and BigBed binary file formats. It handles the complex on-disk data structures (B+ trees for chromosome lookup, R+ trees for spatial indexing, zoom level hierarchies for multi-resolution data) and exposes a simple feature-query interface. The module supports both BigWig files (continuous numeric signal data) and BigBed files (interval/annotation features with arbitrary BED columns), including search functionality via extended B+ tree indexes and Trix text indexes.

## Genomic Context

BigWig and BigBed are binary, indexed formats created by UCSC for efficient random-access to genomic data over HTTP. BigWig files store continuous signal data (e.g., ChIP-seq coverage, conservation scores, GC content) in a compressed, hierarchically summarized format with pre-computed zoom levels at different resolutions. This enables the genome browser to display genome-wide views efficiently by reading from zoom levels with coarser resolution rather than individual data points. BigBed files store BED-format interval features (e.g., gene annotations, regulatory elements, variant calls) in a binary indexed format. Both formats use the same underlying file structure: a common header, a B+ tree for chromosome name-to-ID mapping, an R+ tree for spatial indexing of data blocks, and optionally compressed data blocks. BigBed files can additionally have extended B+ tree indexes for searching features by name or other attributes, and may reference Trix text indexes for flexible term-to-name mapping.

## Key Classes & Files

### `bigwig/bwReader.ts`

**`BWReader` class** -- The main file reader for both BigWig and BigBed formats. This is the most complex file in the module.

**Header parsing (`loadHeader()`):**
- Reads the 64-byte common header, detecting file type (BigWig vs BigBed) and endianness by checking magic numbers (`0x888FFC26` for BigWig, `0x8789F2EB` for BigBed)
- Parses the `BBHeader` structure: version, zoom level count, chromosome tree offset, full data offset, full index offset, field counts, autoSQL offset, total summary offset, uncompressed buffer size, extension offset
- Loads zoom level headers (stored in decreasing reduction level order for efficient resolution selection)
- Parses autoSQL declarations that describe BigBed column schemas
- Reads total summary statistics (mean, stddev, min, max) used for default data range calculation
- Initializes the `ChromTree` for chromosome name resolution
- For BigBed files, estimates feature density from data count for visibility window calculation
- Loads extended header with extra index offsets (for BigBed name search)

**Feature reading (`readFeatures()`):**
- Resolves chromosome names to internal IDs via `ChromTree` (with alias fallback through the genome object)
- For BigWig: selects the appropriate zoom level based on `bpPerPixel`, or reads full-resolution data. Zoom level selection uses `zoomLevelForScale()` which finds the first zoom level with `reductionLevel < bpPerPixel`
- For BigBed: always reads full-resolution data (zoom levels not used for annotation features)
- Loads the R+ tree for the selected data offset
- Finds overlapping leaf items in the R+ tree
- Consolidates leaf items into a single byte-range request to minimize HTTP requests
- Decompresses data blocks (if `uncompressBuffSize > 0`)
- Delegates to format-specific decode functions

**Decode functions (module-level):**
- `decodeWigData()` -- Decodes BigWig data blocks. Handles three WIG section types: bedGraph (type 1, variable step with start/end/value), variableStep (type 2, start/value with fixed span), and fixedStep (type 3, value-only with fixed start/step/span). Resolves chromosome IDs to names via `ChromTree`.
- `decodeZoomData()` -- Decodes BigWig zoom level summary records containing chromId, start, end, validCount, minVal, maxVal, sumData, sumSquares. Applies window function (mean/min/max) to produce a single value per zoom interval.
- `getBedDataDecoder()` -- Returns a BigBed decoder function that reads chromId, start, end, and a tab-delimited rest string. Delegates field parsing to `bbDecoders.getDecoder()`.

**Search support:**
- `search(term)` -- Searches BigBed files for features by name. Uses extended B+ tree indexes and optionally a Trix index for term mapping. Returns the largest matching feature.
- `_searchForRegions(term)` -- Walks the extended B+ tree indexes to find file offset/length for matching regions
- `#getSearchTrees()` -- Lazily loads `BPTree` instances for each extra index offset

**Other features:**
- `readWGFeatures()` -- Reads features spanning all chromosomes for whole-genome view
- `preload()` -- Loads the entire file into memory (for data URIs or small files)
- `DataBuffer` inner class -- Implements the `Loader` interface for in-memory ArrayBuffer data, supporting both `loadArrayBuffer` and `dataViewForRange` methods

**`ZoomLevelHeader` class** -- Stores zoom level metadata: index number, reduction level (bases per summary), data offset, and index offset.

**`BWTotalSummary` class** -- File-level summary statistics: bases covered, min/max values, sum/sum-of-squares, computed mean and stddev. Calculates a default display range as mean +/- 2 stddev.

### `bigwig/bwSource.ts`

**`BWSource` class** (extends `BaseFeatureSource`) -- The data source facade for BigWig/BigBed tracks. Key responsibilities:
- Creates and manages a `BWReader` instance
- `getFeatures({chr, start, end, bpPerPixel, windowFunction})` -- Dispatches to reader for per-chromosome queries or whole-genome aggregation. For BigBed features, calls `pack()` to assign display rows.
- `getWGValues()` -- Caches whole-genome values per window function with a 20% bpPerPixel tolerance for cache reuse. Transforms per-chromosome features to genome-wide coordinates using cumulative offsets.
- `defaultVisibilityWindow()` -- Returns -1 for BigWig (always visible) or a density-based window for BigBed
- `supportsWholeGenome()` -- True for BigWig only
- `searchable` / `search()` -- Delegates to reader for BigBed name search
- `trackType()` -- Returns "wig" for BigWig, "interact" or "annotation" for BigBed based on autoSQL table name
- `windowFunctions` -- Exposes ["mean", "min", "max", "none"] for BigWig zoom level aggregation

### `bigwig/bbDecoders.ts`

**`getDecoder()` function** -- Factory that returns a feature decoder function based on the BigBed field counts and autoSQL schema. For standard BED fields (name, score, strand, cdStart, cdEnd, color, exons), parses tokens by position. For interact/chromatinInteract format, uses a specialized `decodeInteract()` function that maps regions 1 and 2 for chromatin interaction data. Extra fields beyond the standard BED columns are assigned by autoSQL field name, with special handling for `exonFrames`. The `findUTRs()` helper marks exons as UTR regions based on CDS start/end boundaries.

### `bigwig/bpTree.ts`

**`BPTree` class** -- UCSC B+ tree implementation for key-value lookups. Used for two purposes:
1. **Chromosome tree** (`BPChromTree` type): Maps chromosome name strings to integer IDs and sizes
2. **Search index** (`BPTree` type): Maps feature name strings to file offset/length pairs for BigBed name search

Key design:
- Nodes are loaded on demand during search via `readTreeNode()`, with a `nodeCache` for previously visited nodes
- `search(term)` -- Binary-search-like traversal: at each non-leaf node, finds the child whose key range contains the search term; at leaf nodes, checks for exact key match
- Handles both endiannesses (auto-detected by magic number `2026540177`)
- Leaf item values differ by tree type: `{id, size}` for chrom trees vs `{offset, length?}` for search indexes
- `init()` reads the 32-byte header: magic, blockSize, keySize, valSize, itemCount, reserved

### `bigwig/rpTree.ts`

**`RPTree` class** -- R+ tree (spatial index) for finding data blocks that overlap a genomic query range. The R+ tree partitions the genome into non-overlapping intervals at each level.

Key methods:
- `init()` -- Reads the 48-byte header: magic (`610839776`), blockSize, itemCount, start/end chromosome and base, endFileOffset, itemsPerSlot
- `findLeafItemsOverlapping(chrIdx1, startBase, chrIdx2, endBase)` -- Recursive tree walk starting from root node. At each level, checks if items overlap the query range (using `overlaps()`). For non-leaf nodes, recursively descends into overlapping children. Returns leaf items with `dataOffset` and `dataSize` for data block retrieval.
- `readNode(offset)` -- Reads a tree node (type byte, count, then items). Leaf items (type=1) have `startChrom, startBase, endChrom, endBase, childOffset, dataSize`. Non-leaf items have the same range fields plus a child node offset. Nodes are cached by file offset.

The `overlaps()` function performs cross-chromosome interval intersection using a 2D comparison (chromosome index + base position).

### `bigwig/chromTree.ts`

**`ChromTree` class** -- Wraps a `BPTree` configured as `BPChromTree` type. Provides chromosome name <-> ID mapping for BigWig/BigBed files:
- `getIdForName(chr)` -- Forward lookup with caching in `nameToId` Map. Delegates to `bpTree.search(chr)`.
- `getNameForId(id)` -- Reverse lookup (potentially expensive tree traversal). `searchForName()` walks the entire tree looking for a leaf item with matching ID. Caches all encountered name/ID pairs during traversal.
- `estimateGenomeSize()` -- Estimates total genome size by sampling chromosome sizes from tree leaves (up to 10,000). Shuffles non-leaf children to avoid sampling bias. Used for BigBed feature density calculation.

### `bigwig/bufferedReader.ts`

**`BufferedReader` class** -- Provides buffered I/O for sequential or nearby reads from remote files. Maintains an internal buffer (`data`) covering a byte range. When a request falls within the buffer, serves from cache. When outside, loads a new buffer of at least `bufferSize` bytes (default 512KB). Handles HTTP 416 (Range Not Satisfiable) errors by fetching content length and retrying. Returns either `DataView` or `Uint8Array` based on the `asUint8` parameter.

### `bigwig/trix.ts`

**`Trix` class** -- Port of GMOD/trix-js for searching UCSC Trix text indexes. Trix provides a two-file index system:
- **`.ix` file**: A sorted text file mapping lowercase search terms to feature identifiers
- **`.ixx` file**: A sparse index into the `.ix` file, mapping prefixes to file byte positions (using 10-character hex addresses)

Search algorithm:
1. Load and parse the `.ixx` index to find the approximate file position for the search term
2. Load a 64KB chunk from the `.ix` file starting at that position
3. Scan lines for prefix matches
4. Return a `Map<term, featureIds[]>` of matches

The `bufferCache` prevents re-fetching the same `.ix` file chunk. Used by `BWReader` to map user-entered search terms to BigBed-indexed values.

## Data Flow

```
BigWig/BigBed File (binary, optionally compressed blocks)
    |
    v
BWReader.loadHeader()
    |
    |--> Read 64-byte common header (magic, offsets, field counts)
    |--> Parse ZoomLevelHeaders (BigWig: multiple resolution levels)
    |--> Parse autoSQL schema (BigBed: column definitions)
    |--> Read BWTotalSummary (mean, stddev for default range)
    |--> Initialize ChromTree (B+ tree for chr name <-> ID)
    |--> Load extended header with extra index offsets (BigBed search)
    |
    v
BWSource.getFeatures({chr, start, end, bpPerPixel, windowFunction})
    |
    |--> BWReader.getIdForChr(chr)
    |      ChromTree.getIdForName(chr)  -->  BPTree.search(chr)
    |      Falls back to genome alias records
    |
    |--> Select data source:
    |      BigWig + zoom applicable: zoomLevelForScale() --> ZoomLevelHeader.indexOffset
    |      BigWig full resolution: header.fullIndexOffset
    |      BigBed: header.fullIndexOffset
    |
    |--> BWReader.loadRPTree(treeOffset)
    |      RPTree.init() --> read 48-byte R+ tree header
    |
    |--> rpTree.findLeafItemsOverlapping(chrIdx, start, chrIdx, end)
    |      Recursive tree walk: root --> internal nodes --> leaf items
    |      Returns RPTreeItem[] with dataOffset + dataSize
    |
    |--> Consolidate leaf items into single byte-range HTTP request
    |
    |--> For each leaf item:
    |      Slice data from response buffer
    |      Decompress if needed (BGZip.inflate)
    |      Decode via format-specific function:
    |        BigWig zoom: decodeZoomData() --> {chr, start, end, value}
    |        BigWig full: decodeWigData() --> {chr, start, end, value}
    |        BigBed:      getBedDataDecoder() --> {chr, start, end, name, score, ...}
    |                       Uses bbDecoders.getDecoder() for field parsing
    |
    |--> Sort features by start position
    |
    v
WigFeature[] or BedFeature[]
    |
    |--> BWSource: pack BigBed features for display
    |--> BWSource: transform to whole-genome coords if chr="all"
    |
    v
Track rendering (WigTrack for BigWig, FeatureTrack for BigBed)


BigBed Search Flow:
    User enters search term
        |
        v
    BWReader.search(term)
        |
        |--> Trix.search(term.toLowerCase())  [if Trix index configured]
        |      Read .ixx sparse index
        |      Load .ix chunk, scan for prefix matches
        |      Map user term to indexed term
        |
        |--> #getSearchTrees() --> BPTree[] (from extra index offsets)
        |
        |--> bpTree.search(term) --> {offset, length}
        |      Walk B+ tree nodes (loaded on demand)
        |
        |--> _loadFeaturesForRange(offset, length)
        |      Load and decompress data block
        |      Decode BigBed features
        |
        |--> Filter for exact name match, return largest feature
        v
    Feature with chr, start, end (used for navigation)
```

## Dependencies

### Internal dependencies (modules this depends on)
- `js/binary.ts` -- `BinaryParser` for parsing binary file structures (headers, tree nodes, data blocks)
- `js/feature/baseFeatureSource.ts` -- `BaseFeatureSource` base class for `BWSource`, `BaseFeatureSourceGenome` interface
- `js/feature/featurePacker.ts` -- `pack()` function for assigning display rows to BigBed features
- `js/util/igvUtils.ts` -- `buildOptions()` for HTTP request configuration, `isDataURL()` for data URI detection
- `js/util/ucscUtils.ts` -- `parseAutoSQL()` for parsing autoSQL column schema declarations
- `igv-utils` -- `BGZip` (inflate/decompress, decodeDataURI), `igvxhr` (HTTP range requests), `IGVColor` (color parsing), `StringUtils` (string utilities)

### Depended on by
- `js/feature/featureSource.ts` -- Creates `BWSource` instances for BigWig/BigBed tracks
- `js/feature/wigTrack.ts` -- Renders BigWig signal data using features from `BWSource`
- `js/feature/featureTrack.ts` -- Renders BigBed annotation features
- `js/feature/interactionTrack.ts` -- Renders chromatin interaction BigBed data
- `js/browser.ts` -- Uses `BWReader.search()` for gene/feature search functionality
- `js/bam/bamIndex.ts` -- Shares the Tabix index parsing with `parseTabixIndex()` (Tabix indexes use the same BAI format with additional header fields; used by text-format feature files, not BigWig/BigBed directly)
