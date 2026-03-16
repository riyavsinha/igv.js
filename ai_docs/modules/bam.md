# BAM Module

## Purpose

The BAM module is the largest module in igv.js, responsible for reading, parsing, filtering, downsampling, packing, and rendering BAM/CRAM sequence alignment data. It provides the complete pipeline from binary BAM file I/O through BGZF decompression, alignment record decoding, coverage computation, paired-end handling, base modification visualization, and interactive alignment track rendering with support for sorting, grouping, coloring, and popup data display.

## Genomic Context

BAM (Binary Alignment/Map) is the standard binary format for storing aligned sequencing reads produced by tools like BWA, Bowtie, and STAR. BAM files contain individual read alignments with CIGAR strings describing how each read maps to the reference genome, quality scores, mate-pair information for paired-end sequencing, and extensible auxiliary tags (e.g., read groups, base modifications). BAM files are typically coordinate-sorted and indexed with BAI or CSI index files, enabling efficient random-access retrieval of alignments overlapping a specific genomic region. This module also handles CRAM files (via delegation to a separate CRAM reader) and supports the htsget protocol for streaming alignment data from remote servers. Base modification tags (MM/ML) from long-read sequencing platforms (Oxford Nanopore, PacBio) are parsed and rendered to visualize epigenetic modifications like 5-methylcytosine (5mC) and 6-methyladenine (6mA).

## Key Classes & Files

### Readers

**`bam/bamReader.ts`** -- `BamReader` class. The primary indexed BAM reader. Uses a BAI/CSI index to find chunks (file byte ranges) that contain alignments overlapping the requested genomic region, then loads and decompresses those chunks via `BGZBlockLoader`. Reads the BAM header to extract chromosome names and reference sequence dictionary. Maintains a chromosome alias table for cross-reference name resolution (e.g., "chr1" vs "1"). Delegates binary record decoding to `BamUtils.decodeBamRecords()`.

**`bam/bamReaderNonIndexed.ts`** -- `BamReaderNonIndexed` class. Reads the entire BAM file at once (decompressing all BGZF blocks), parses all alignments, and caches them in a `FeatureCache`. Subsequent queries filter the cache by region. Used for small BAM files without an index, or data URIs. Supports both file URLs and base64-encoded data URIs.

**`bam/shardedBamReader.ts`** -- `ShardedBamReader` class. Manages per-chromosome BAM files where a single dataset is split across multiple files (one per chromosome). The URL template uses `$CHR` as a placeholder. Creates a `BamReader` instance for each chromosome on demand.

**`bam/bamWebserviceReader.ts`** -- `BamWebserviceReader` class. Deprecated reader that fetches SAM-format alignment data from an igv.js-flask server backed by pysam. Constructs HTTP query URLs with reference file, alignment file, and region parameters.

### Data Source

**`bam/bamSource.ts`** -- `BamSource` class. The factory/facade that selects the appropriate reader based on configuration:
- `sourceType === "pysam"` --> `BamWebserviceReader`
- `sourceType === "htsget"` --> `HtsgetBamReader` (from `js/htsget/`)
- `sourceType === "shardedBam"` --> `ShardedBamReader`
- `format === "cram"` --> `CramReader` (from `js/cram/`)
- Indexed BAM (default) --> `BamReader`
- Non-indexed BAM --> `BamReaderNonIndexed`

After reading alignments, `BamSource.getAlignments()` fetches the reference sequence for the region and attaches it to the `AlignmentContainer` for mismatch detection in coverage display.

### Tracks

**`bam/bamTrack.ts`** -- `BAMTrack` class (extends `TrackBase`). The top-level track that composes a `CoverageTrack` and an `AlignmentTrack`. Manages the split display (coverage histogram on top, alignment rows below), height allocation, sort state, paired-end statistics computation, and menu items for toggling coverage/alignment visibility. Delegates drawing, popup data, and context menus to the sub-tracks. Provides methods for JBrowse circular view integration (`addPairedChordsForViewport`, `addSplitChordsForViewport`).

**`bam/alignmentTrack.ts`** -- `AlignmentTrack` class (extends `TrackBase`). Handles the rendering of individual alignment rows including:
- Base-level rendering with mismatch coloring against the reference sequence
- Insertion markers (purple "I" indicators between bases)
- Soft clip visualization
- Gap/deletion rendering (thin lines or "D" markers)
- Paired-end connector lines between mates
- Color-by options: strand, first-of-pair strand, pair orientation, insert size, base modification, read group, MAPQ, tag value, YC/XS tags, chromosome of mate, and more
- Group-by options: strand, first-of-pair strand, mate chromosome, pair orientation, chimeric, supplementary, read order, phase, tag, base at position
- Context menu with sort, group, color, display mode, and show/hide options
- Click handling for BLAT alignment of reads
- Downsampled interval indicators

**`bam/coverageTrack.ts`** -- `CoverageTrack` class. Renders the coverage histogram showing read depth at each position. Highlights mismatches against the reference with nucleotide-specific colors. Supports base modification coverage coloring. Click popups show per-base counts (A/C/G/T/N, positive/negative strand), deletions, insertions, and HGVS variant annotations with ClinVar links.

### Alignment Data Model

**`bam/bamAlignment.ts`** -- `BamAlignment` class. Represents a single alignment record with all SAM/BAM fields:
- Core fields: `chr`, `start`, `end`, `readName`, `cigar`, `lengthOnRef`, `fragmentLength`, `mq`, `strand`, `seq`, `qual`, `flags`
- Mate information: `mate` object with `chr`, `position`, `strand`
- Computed fields: `blocks` (aligned segments), `insertions`, `gaps`, `pairOrientation`, `scStart`/`scLengthOnRef` (soft-clip adjusted)
- Tag dictionary: `tagDict` with decoded BAM auxiliary tags
- Flag methods: `isMapped()`, `isPaired()`, `isProperPair()`, `isFirstOfPair()`, `isSecondOfPair()`, `isSecondary()`, `isSupplementary()`, `isDuplicate()`, etc.
- Base query methods: `readBaseAt()`, `readBaseQualityAt()`, `blockAtGenomicLocation()`, `insertionAtGenomicLocation()`
- Base modification support: `getBaseModificationSets()` parses MM/ML tags
- Grouping: `getGroupValue()` returns the grouping value for various groupBy criteria
- Popup: `popupData()` generates rich HTML popup content with HGVS annotations and ClinVar links

**`bam/alignmentBlock.ts`** -- `AlignmentBlock` class. Represents a contiguous aligned segment from the CIGAR string. Properties: `start` (genomic position), `seqOffset` (offset into read sequence), `len` (block length), `type` (CIGAR operation: 'M', 'S', 'I', 'H').

**`bam/pairedAlignment.ts`** -- `PairedAlignment` class. Wraps two `Alignment` objects (first and second of pair) into a single display unit. Computes combined start/end, connecting region (the gap between mates), and delegates most methods to the first alignment. Used when "view as pairs" is enabled.

**`bam/supplementaryAlignment.ts`** -- `SupplementaryAlignment` class. Parses the SA tag (supplementary alignment string) into structured objects with `chr`, `start`, `strand`, `mapQ`, `numMismatches`, and `lenOnRef` (computed from the supplementary CIGAR string). Used for popup display and chimeric read detection.

### Container & Packing

**`bam/alignmentContainer.ts`** -- `AlignmentContainer` class. The central data structure returned by readers, containing:
- **CoverageMap**: Per-position coverage counts (posA, negA, posC, negC, etc.) with quality-weighted mismatch detection. Computed before downsampling to ensure accurate coverage.
- **Downsampling**: Reservoir sampling within sliding windows (`samplingWindowSize`, `samplingDepth`) to limit the number of displayed alignments. Records `DownsampledInterval` markers.
- **Paired alignment caching**: During push, alignments with the same read name are paired into `PairedAlignment` objects.
- **Packing**: `packAlignmentRows()` organizes alignments into `BamAlignmentRow` arrays using either dense packing (filling rows left-to-right) or full packing (one alignment per row). Supports grouping by various criteria.
- **Sorting**: `sortRows()` reorders packed rows by various sort options (base, strand, start, tag, read name, insert size, gap size, MAPQ, etc.).
- **Base modification counts**: `BaseModificationCounts` accumulated during push for coverage track coloring.
- Exports `Alignment`, `AlignmentBlock`, `Coverage`, `CoverageMap`, `DownsampledInterval`, `Group` types.

**`bam/packedAlignments.ts`** -- `PackedAlignments` class. Currently a stub with empty `pack()` and `repack()` methods. Packing logic lives in `AlignmentContainer`.

**`bam/bamAlignmentRow.ts`** -- `BamAlignmentRow` class. Represents a single horizontal row of alignments in the display. Contains `alignments` array and provides `findAlignment()` for locating the alignment at a genomic position, and `getSortValue()` for computing sort keys (base score, strand, start, tag, read name, insert size, gap size, mate chromosome, MAPQ, aligned read length).

### Filtering

**`bam/bamFilter.ts`** -- `BamFilter` class. Configurable filter applied during BAM record decoding. Filters by:
- Unmapped reads (always filtered)
- Vendor QC failure (`vendorFailed`, default: filter)
- Duplicate reads (`duplicate`/`duplicates`, default: filter)
- Secondary alignments (`secondary`, default: pass)
- Supplementary alignments (`supplementary`, default: pass)
- Minimum mapping quality (`mq`, default: 0)
- Read group whitelist (`readgroups`)

### Utilities

**`bam/bamUtils.ts`** -- `BamUtils` object. Core utility functions:
- `readHeader()` -- Loads and decompresses BAM header from URL
- `decodeBamHeader()` -- Parses the binary BAM header (magic number, SAM header text, reference sequence dictionary)
- `decodeBamRecords()` -- The main binary BAM record decoder. Iterates through compressed byte arrays, parsing each alignment record: refID, position, CIGAR, sequence (4-bit encoded), quality, mate info, tags. Applies filter, constructs `BamAlignment` objects with blocks via `makeBlocks()`.
- `decodeSamRecords()` -- Parses SAM-format text records (used by webservice reader)
- `bam_tag2cigar()` -- Handles long CIGARs stored in the CG:B,I auxiliary tag (per SAM spec for >65535 CIGAR operations)
- `setReaderDefaults()` -- Configures filter, allele frequency threshold, and sampling parameters on reader objects
- `setPairOrientation()` -- Computes 4-character pair orientation string (e.g., "F1R2") for detecting structural variants
- `makeBlocks()` (module-level) -- Splits alignment into `AlignmentBlock` objects based on CIGAR operations
- `decodeBamTags()` / `decodeSamTags()` -- Parse auxiliary tags from binary/text format

### Index Handling

**`bam/bamIndex.ts`** -- `BamIndex` class. Parses BAI (BAM index) and Tabix index files. Implements binning scheme with `reg2bins()` for mapping genomic ranges to bin numbers. `chunksForRange()` finds file byte ranges (chunks) containing alignments overlapping a query region, using both the bin index and linear index for optimization.

**`bam/csiIndex.ts`** -- `CSIIndex` class. Parses CSI (Coordinate-Sorted Index) files, the newer index format supporting arbitrarily large genomes. Similar to BAI but with configurable `minShift` and `depth` parameters. Supports Tabix CSI indexes for text-based formats.

**`bam/indexFactory.ts`** -- `loadIndex()` function. Factory that detects index type by magic number (BAI, Tabix, CSI, Tribble) and delegates to the appropriate parser. Handles gzipped index files by checking for the gzip magic number.

**`bam/indexUtils.ts`** -- `optimizeChunks()` function. Sorts and merges overlapping or adjacent chunks to minimize I/O requests. Chunks within 65KB gaps and under 5MB total size are merged. Filters chunks below the linear index minimum offset.

### BGZF Block Loading

**`bam/bgzBlockLoader.ts`** -- `BGZBlockLoader` class. Manages loading and inflating BGZF (Blocked GZip Format) compressed data from BAM files. Key features:
- Block-level caching to avoid re-fetching overlapping regions
- `getData(minv, maxv)` -- Returns decompressed data between two virtual file pointers
- `getInflatedBlocks()` -- Loads raw compressed blocks, handles partial cache overlaps, and inflates each block individually
- `inflateBlocks()` -- Parses BGZF block headers (finding block boundaries) and inflates each block
- `findBlockBoundaries()` -- Scans compressed data for BGZF block boundaries

### Metadata

**`bam/orientationTypes.ts`** -- `orientationTypes` constant. Lookup table mapping 4-character pair orientation strings (e.g., "F1R2", "R1F2") to orientation labels ("LR", "LL", "RR", "RL") for three library types: FR (forward-reverse, standard Illumina), RF (reverse-forward, mate-pair), and FF (forward-forward).

**`bam/pairedEndStats.ts`** -- `PairedEndStats` class. Computes insert size distribution statistics from properly paired alignments:
- Counts by pair orientation (FR, RF, FF) to determine library orientation
- Percentile-based min/max template length (TLEN) for detecting anomalous insert sizes
- Used by `BAMTrack` to identify structural variant candidates and set `maxTemplateLength`

### Base Modification Support (`mods/` subdirectory)

**`bam/mods/baseModificationUtils.ts`** -- Core parsing function `getBaseModificationSets()` that decodes the MM (modification string) and ML (modification likelihoods) BAM tags per the SAM specification. Handles:
- Multiple modifications per base (e.g., `C+mh` for both 5mC and 5hmC)
- ChEBI numeric modification codes
- Negative strand reverse-complementing
- Skipped-bases-called mode (`.` suffix indicating unmodified bases have likelihood 0)
- Also exports `modificationName()` for human-readable modification names, `byteToUnsignedInt()` for Java-compatible byte conversion, and `isChEBI()` for detecting numeric ChEBI codes.

**`bam/mods/baseModificationSet.ts`** -- `BaseModificationSet` class. Represents a single type of modification for a single alignment: the base, strand, modification code, and a `Map<readIndex, likelihood>` of positions with their likelihoods (0-255). Provides `containsPosition()`, `is5mC()`, and `fullName()` methods.

**`bam/mods/baseModificationKey.ts`** -- `BaseModificationKey` class. Flyweight key identifying a unique modification type (base + strand + modification). Uses a static instance cache (`getKey()`) to ensure identity equality. Provides a rank-ordered `compare()` method for deterministic display ordering (NONE_C, NONE_T, ..., m, h, f, c, ...).

**`bam/mods/baseModificationCounts.ts`** -- `BaseModificationCounts` class. Aggregates per-position modification counts across all alignments in a region. Maintains two likelihood maps:
- `maxLikelihoods` -- Highest-likelihood modification per position (for mono-color mode)
- `nomodLikelihoods` -- Includes no-modification likelihood (for two-color mode, "basemod2")
- `computeSimplex()` -- Identifies simplex modifications (only one strand has data) for adjusting coverage calculations
- `popupData()` -- Generates popup text with modification counts and average likelihoods

**`bam/mods/baseModificationColors.ts`** -- Color constants and `getModColor()` function. Maps modification codes to distinct colors (e.g., `m` = red for 5mC, `h` = magenta for 5hmC, `a` = dark purple for 6mA). Applies alpha/transparency based on likelihood using different formulas for "basemod" (sigmoid-like) vs "basemod2" (quadratic) color modes. Caches computed RGBA strings.

**`bam/mods/baseModificationRenderer.ts`** -- `BaseModificationRenderer` class. Renders base modifications on individual alignment reads. For each aligned block, finds the modification with the highest likelihood at each position and paints a colored rectangle. In "basemod2" mode, also considers the no-modification likelihood. Supports filtering to a specific modification type via `colorOption` suffix (e.g., `basemod:m`).

**`bam/mods/baseModificationCoverageRenderer.ts`** -- `drawModifications()` function. Renders base modifications in the coverage track. For each position, calculates the fraction of reads with each modification type (accounting for modifiable bases, detectable reads, and simplex vs duplex data) and draws stacked colored bars proportional to the modification fraction.

## Data Flow

```
BAM File (BGZF compressed)      BAI/CSI Index File
         |                              |
         v                              v
   BGZBlockLoader               loadIndex() --> BamIndex / CSIIndex
         |                              |
         v                              v
   BamReader.readAlignments(chr, start, end)
         |
         |--- index.chunksForRange(chrId, start, end) --> Chunk[]
         |--- blockLoader.getData(minv, maxv)  --> decompressed bytes
         |--- BamUtils.decodeBamRecords(bytes, ..., filter)
         |         |
         |         |--> For each BAM record:
         |         |      Parse binary fields (refID, pos, CIGAR, seq, qual, tags)
         |         |      Apply BamFilter (unmapped, duplicate, secondary, MQ, etc.)
         |         |      makeBlocks() --> AlignmentBlock[] from CIGAR
         |         |      Construct BamAlignment
         |         v
         |    alignmentContainer.push(alignment)
         |         |
         |         |--> coverageMap.incCounts()  (before downsampling)
         |         |--> baseModCounts.incrementCounts()
         |         |--> Reservoir sampling / paired alignment matching
         |
         v
   AlignmentContainer
         |
         |--> BamSource.getAlignments()
         |      Fetches reference sequence for mismatch detection
         |
         v
   BAMTrack.getFeatures()
         |
         |--> alignmentContainer.pack(alignmentTrack)
         |      Groups alignments by groupBy criteria
         |      Packs into BamAlignmentRow[] (dense or full mode)
         |
         |--> alignmentContainer.sortRows(sortObject)
         |
         v
   BAMTrack.draw(options)
         |
         |--> CoverageTrack.draw()
         |      Renders coverage histogram bars
         |      Colors mismatches by nucleotide
         |      Optionally renders base modification coverage
         |
         |--> AlignmentTrack.draw()
                Renders each BamAlignmentRow:
                  - Alignment blocks with base colors
                  - Insertions, deletions, soft clips
                  - Paired-end connectors
                  - Color by strand/insert size/tag/modification/etc.
                  - Base modification overlays via BaseModificationRenderer
                  - Downsampled interval indicators
```

## Dependencies

### Internal dependencies (modules this depends on)
- `js/trackBase.ts` -- Base class for `BAMTrack`, `AlignmentTrack`
- `js/igv-canvas.ts` -- `IGVGraphics` for canvas drawing primitives
- `js/binary.ts` -- `BinaryParser` for parsing binary index data
- `js/feature/featureCache.ts` -- `FeatureCache` used by `BamReaderNonIndexed`
- `js/feature/baseFeatureSource.ts` -- `BaseFeatureSourceGenome` interface
- `js/feature/chromAliasManager.ts` -- Chromosome name alias resolution
- `js/feature/tribble.ts` -- Tribble index parsing (via `indexFactory`)
- `js/htsget/htsgetBamReader.ts` -- htsget protocol reader (via `BamSource`)
- `js/cram/cramReader.ts` -- CRAM format reader (via `BamSource`)
- `js/genome/hgvs.ts` -- HGVS variant notation generation
- `js/genome/clinVar.ts` -- ClinVar URL lookup
- `js/util/sequenceUtils.ts` -- `reverseComplementSequence`, `complementBase`
- `js/util/igvUtils.ts` -- `buildOptions`, `isDataURL`
- `js/util/colorPalletes.ts` -- `ColorTable`, `PaletteColorTable`
- `js/util/getChrColor.ts` -- Chromosome-based coloring
- `js/util/paintAxis.ts` -- Y-axis rendering for coverage track
- `js/jbrowse/circularViewUtils.ts` -- JBrowse circular view chord creation
- `js/blat/blatTrack.ts` -- BLAT search from selected reads
- `igv-utils` -- `BGZip` (decompression), `igvxhr` (HTTP), `IGVColor`, `StringUtils`

### Depended on by
- `js/browser.ts` -- Creates `BAMTrack` instances from configuration
- `js/trackView.ts` -- Manages track display lifecycle
- `js/trackViewport.ts` -- Renders track content and handles clicks
- `js/sample/` -- Sample info/name viewports may access alignment data
- `js/jbrowse/circularViewUtils.ts` -- Receives chord data from BAMTrack
