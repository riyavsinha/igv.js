# CRAM Module

## Purpose

The CRAM module provides reading and decoding of CRAM-format alignment files within igv.js. It wraps the `@gmod/cram` library (vendored as `cram-bundle.js`) with an igv.js-compatible interface, translating CRAM records into the same `BamAlignment` objects used by the BAM reader so that downstream rendering in alignment tracks is format-agnostic.

## Genomic Context

CRAM is a highly compressed reference-based file format for storing aligned sequencing reads, developed as a more space-efficient alternative to BAM. While BAM stores the full read sequence, CRAM stores only the differences from the reference genome, achieving 40-60% smaller file sizes. CRAM files require access to the reference sequence for decoding (via a `seqFetch` callback), and use `.crai` index files for random access by genomic region. The format is defined by the Global Alliance for Genomics and Health (GA4GH) and is widely used in large-scale sequencing projects like the UK Biobank and gnomAD. This module enables igv.js to display CRAM alignments with the same features as BAM (alignment blocks, insertions, deletions, soft clips, mate pairs, base modifications, etc.).

## Key Classes & Files

### `cram/cramReader.ts`
The main reader class (`CramReader`) that provides the interface between igv.js and the `@gmod/cram` library. Key components:

**Constructor**: Initializes three `@gmod/cram` objects:
- `CramFile` -- Represents the CRAM file itself, configured with a `FileHandler` for data access and a `seqFetch` function for reference sequence retrieval. The `seqFetch` function uses the igv.js genome object to fetch reference bases, translating from CRAM's internal sequence IDs to chromosome names via the header.
- `IndexedCramFile` -- Combines the CRAM file with its `.crai` index for region-based queries. Accepts a `fetchSizeLimit` (default 1GB) to control maximum fetch size.
- `CraiIndex` -- Wraps the `.crai` index file via another `FileHandler`.

**`getHeader()`**: Parses the SAM header from the CRAM file to build:
- `chrToIndex` -- Maps chromosome names to their integer indices used internally by CRAM.
- `indexToChr` -- Reverse mapping from index to chromosome name.
- `readGroups` -- Extracted `@RG` header lines for read group identification.

**`#getRefId(chr)`**: Private method that resolves a chromosome name to its CRAM reference ID, using the genome's alias system to handle naming discrepancies (e.g., `chr1` vs `1`). Caches alias lookups to avoid repeated resolution.

**`readAlignments(chr, bpStart, bpEnd)`**: The main query method that:
1. Resolves the chromosome to a reference ID.
2. Calls `indexedCramFile.getRecordsForRange()` to fetch CRAM records in the region.
3. Filters records by position and maps status.
4. Decodes each CRAM record into a `BamAlignment` via `decodeCramRecord()`.
5. Applies the alignment filter (`this.filter`, set by `BamUtils.setReaderDefaults()`).
6. Packs passing alignments into an `AlignmentContainer`.
7. Handles MD5 sequence mismatch errors with a user-friendly message.

**`decodeCramRecord(record, chrNames)`**: Inner function that translates a `@gmod/cram` record into a `BamAlignment`:
- Maps fields: `sequenceId` to chromosome name, `alignmentStart` (1-based) to 0-based `start`, flags, strand, mapping quality, fragment length, mate information.
- Calls `getReadBases()` to retrieve the read sequence.
- Copies quality scores, tags, and read name.
- Sets pair orientation via `BamUtils.setPairOrientation()`.

**`makeBlocks(cramRecord, alignment)`**: Inner function that constructs alignment blocks from CRAM read features:
- Iterates through read features (substitutions, insertions, deletions, soft clips, hard clips, padding) and builds `AlignmentBlock` objects.
- Tracks soft-clipped regions by adjusting `scStart` and `scLengthOnRef`.
- Accumulates insertions, gaps (deletions/skipped regions), and constructs a CIGAR string.
- Handles feature codes: `S` (soft clip), `I`/`i` (insertion), `D` (deletion), `N` (skipped region), `H` (hard clip), `P` (padding).

### `cram/fileHandler.ts`
An I/O adapter (`FileHandler`) that bridges `@gmod/cram`'s file access API with igv.js's `igvxhr` HTTP loading system. Features:

- **`read(length, position)`** -- Reads a byte range from the CRAM/CRAI file, returning a `Uint8Array`. Used by `@gmod/cram` for random access reads.
- **`readFile()`** -- Reads the entire file (used for small index files).
- **Caching** -- Implements a `Cache` class that stores recently fetched byte ranges to reduce HTTP requests. The cache:
  - Maintains up to 5 chunks (`maxChunkCount`).
  - Fetches with padding (1000 bytes on each side) to anticipate sequential access.
  - Uses a configurable `fetchSize` (default 10,000 bytes) as minimum fetch granularity.
  - Disables caching for local `File` objects or when `cacheFetches` is explicitly false.
- **`Cache` class** -- LRU-style chunk cache with `Chunk` objects that track start/end positions and buffer contents. The `contains()` method checks if a requested range falls within a cached chunk.

### `cram/cram-bundle.js` (vendored)
A bundled copy of the `@gmod/cram` library that provides the core CRAM parsing functionality. Exports `CramFile`, `IndexedCramFile`, and `CraiIndex` classes. This is a `@ts-nocheck` vendored file -- types are defined at the boundary in `cramReader.ts` via local interfaces (`GmodCramFile`, `GmodIndexedCramFile`, `CramRecord`, etc.).

## Data Flow

1. **Configuration** -- A CRAM track is configured with a `url` (CRAM file) and `indexURL` (CRAI index). The `CramReader` is created during track initialization.
2. **Header parsing** -- On first query, `getHeader()` parses the SAM header to build chromosome name mappings. This is cached for subsequent queries.
3. **Region query** -- When the viewport requests alignments for a region (`readAlignments(chr, bpStart, bpEnd)`):
   - The chromosome name is resolved to a CRAM reference ID (with alias support).
   - `@gmod/cram`'s `IndexedCramFile.getRecordsForRange()` uses the `.crai` index to locate and decompress the relevant CRAM slices.
   - Each slice read triggers `FileHandler.read()` calls, which go through the cache or directly to `igvxhr.loadArrayBuffer()`.
   - For reference-based compression, `seqFetch()` is called to retrieve reference sequence segments from the igv.js genome object.
4. **Record decoding** -- Raw CRAM records are decoded into `BamAlignment` objects with alignment blocks, insertions, gaps, and CIGAR strings.
5. **Filtering and packing** -- Alignments are filtered by quality/flag criteria and packed into an `AlignmentContainer` (which handles row packing for display).
6. **Rendering** -- The `AlignmentContainer` is passed to the alignment track's rendering pipeline, which is shared with BAM. The track draws alignments as colored rectangles with mismatches, insertions, deletions, and soft clips highlighted.

## Dependencies

### Depends on
- `cram-bundle.js` (vendored `@gmod/cram`) -- Core CRAM file parsing, decompression, and index reading.
- `bam/alignmentContainer.ts` -- Container for packing alignments into display rows.
- `bam/bamAlignment.ts` -- The `BamAlignment` class that represents a single aligned read.
- `bam/alignmentBlock.ts` -- The `AlignmentBlock` class for contiguous alignment segments.
- `bam/bamUtils.ts` -- Shared utilities: `setReaderDefaults()` for filter initialization, `setPairOrientation()` for mate pair classification.
- `bam/bamFilter.ts` -- The `BamFilter` type for alignment quality/flag filtering.
- `genome/genome.ts` -- For chromosome name resolution (`getChromosomeName`), alias lookup (`getAliasRecord`), and reference sequence retrieval (`getSequence`).
- `igv-utils` (`igvxhr`, `FileUtils`) -- HTTP loading and file type detection.
- `util/igvUtils.ts` (`buildOptions`) -- Constructs request options with authentication headers, etc.

### Depended on by
- `bam/bamSource.ts` or equivalent alignment source -- Creates a `CramReader` when the track config specifies a `.cram` file.
- `alignmentTrack.ts` -- Consumes the `AlignmentContainer` returned by `readAlignments()` for rendering.
- The alignment track system treats CRAM and BAM identically after the reader stage -- the same rendering, popup data, and interaction code handles both formats.
