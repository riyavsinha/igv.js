# Genome Module

## Purpose

The Genome module represents a reference genome assembly and provides the foundational infrastructure that all other igv.js modules depend on: DNA sequence access, chromosome metadata, cytoband data for ideogram rendering, and chromosome name aliasing between different naming conventions. It supports multiple sequence formats (indexed FASTA, non-indexed FASTA, 2bit, ChromSizes) with a caching layer for efficient viewport-driven sequence retrieval, and offers pluggable chromosome alias sources (BigBed-backed, file-based, or hardcoded defaults) to bridge naming differences between genomes and data files.

## Genomic Context

A reference genome assembly defines the coordinate system for all genomic data. Different data sources may use different chromosome naming conventions (e.g., `chr1` vs `1`, `chrM` vs `MT`), requiring alias resolution. Sequence data must be fetched on demand as users navigate, since full genomes are too large to load entirely (except for small genomes or data URIs). Cytoband data provides the banding pattern used to render chromosome ideograms, giving users visual orientation within chromosomes. The genome also defines the "whole genome view" -- a pseudo-chromosome called `"all"` that concatenates all major chromosomes for a bird's-eye overview, requiring cumulative offset calculations to map between per-chromosome and whole-genome coordinate spaces.

## Key Classes & Files

### Core

| File | Class/Function | Role |
|------|---------------|------|
| `js/genome/genome.ts` | `Genome` | Central class representing an assembly. Static `createGenome()` factory method initializes sequence, chromosomes, cytobands, and chromosome aliases. Provides coordinate conversion between chromosome and whole-genome spaces (`getGenomeCoordinate()`, `getChromosomeCoordinate()`), sequence access (`getSequence()`), chromosome lookup with alias resolution (`getChromosome()`, `getChromosomeName()`), cytoband retrieval, and MANE transcript / rsDB feature sources. Manages a private `#wgChromosomeNames` array for whole-genome view ordering and a `#aliasRecordCache` for memoized alias lookups. |
| `js/genome/genomeUtils.ts` | `GenomeUtils` | Singleton utility object managing the known genomes registry (`KNOWN_GENOMES`). Loads genome definitions from igv.org (with backup URL), supports user-defined genome lists, expands genome IDs to full configurations via `expandReference()`, and handles UCSC hub genome integration. |

### Sequence Readers

| File | Class | Role |
|------|-------|------|
| `js/genome/loadSequence.ts` | `loadSequence()` | Factory function that selects the appropriate sequence reader based on config: `ChromSizes` (no sequence, chromosome lengths only), `CachedSequence(Twobit)` (2bit format), `NonIndexedFasta` (small genomes, data URIs), or `CachedSequence(FastaSequence)` (indexed FASTA). |
| `js/genome/indexedFasta.ts` | `FastaSequence` | Reads `.fai`-indexed FASTA files. Parses the FASTA index to build chromosome metadata, supports compressed (bgzip + `.gzi` index) FASTA, and performs byte-range HTTP requests to fetch specific sequence regions. |
| `js/genome/nonIndexedFasta.ts` | `NonIndexedFasta` | Loads an entire FASTA file into memory at initialization. Supports data URIs and `@len=N` extensions for specifying chromosome lengths without full sequence. Stores sequence as `SequenceSlice` objects for retrieval. |
| `js/genome/twobit.ts` | `TwobitSequence` | Reads UCSC 2bit binary format. Handles byte-order detection (little/big endian), N-block and mask-block decoding, 2-bits-per-base packed sequence extraction, and optional external BPTree index for chromosome lookup. |
| `js/genome/cachedSequence.ts` | `CachedSequence` | Caching wrapper around any sequence reader implementing `readSequence()`. Maintains up to 10 cached `SequenceInterval` objects with a minimum query size of 100kb. Evicts intervals that are no longer visible in any viewport and deduplicates concurrent queries for the same region. |

### Chromosome & Intervals

| File | Class | Role |
|------|-------|------|
| `js/genome/chromosome.ts` | `Chromosome` | Simple data class holding chromosome metadata: `name`, `order` (for sorting), `bpLength`, and optional `altNames` map. |
| `js/genome/chromSizes.ts` | `ChromSizes`, `loadChromSizes()` | `ChromSizes` class represents a reference with chromosome lengths but no sequence (returns `null` for sequence queries). `loadChromSizes()` is a standalone function that parses a `.chrom.sizes` file into a `Map<string, Chromosome>`. |
| `js/genome/genomicInterval.ts` | `GenomicInterval` | Base interval class with `chr`, `start`, `end`, and `features` (typed as `unknown`). Provides `contains(chr, start, end)` and `containsRange(range)` methods. |
| `js/genome/sequenceInterval.ts` | `SequenceInterval` | Extends `GenomicInterval` with `features` typed as `string | null` (the DNA sequence). Used by `CachedSequence` as cache entries. Adds `getSequence()` and `hasSequence()` convenience methods. |

### Chromosome Aliasing

| File | Class | Role |
|------|-------|------|
| `js/genome/chromAliasBB.ts` | `ChromAliasBB` | Chromosome alias source backed by a UCSC BigBed file. Uses `BWReader` to query for alias records by chromosome name. Caches lookup results in `aliasRecordCache`. Supports `preload()` to batch-load aliases for a set of chromosomes. |
| `js/genome/chromAliasFile.ts` | `ChromAliasFile` | Reads a tab-delimited chromosome alias file with an optional header line (prefixed with `#`). Maps between naming conventions (e.g., UCSC, Ensembl, GenBank). Supports `preload()` and bidirectional lookup. |
| `js/genome/chromAliasDefaults.ts` | `ChromAliasDefaults` | Hardcoded default aliases for common cases: `chr1` to `1`, `chrM` to `MT`, and species-specific sex chromosome mappings (e.g., `chrW`/`chrZ` for birds). Used as fallback when no alias file or BigBed is configured. Builds alias records from chromosome name patterns. |

### Cytobands

| File | Class/Function | Role |
|------|---------------|------|
| `js/genome/cytoband.ts` | `Cytoband` | Data class representing a single cytoband entry with `start`, `end`, `name`, `gieStain`, and `type` (computed from gieStain prefix). |
| `js/genome/cytobandFile.ts` | `CytobandFile` | Loads cytoband data from a text file (UCSC cytoband format). Parses lines into `Cytoband` objects grouped by chromosome. Caches results after first load. |
| `js/genome/cytobandFileBB.ts` | `CytobandFileBB` | Loads cytoband data from a BigBed file. Uses `BWSource` to query features per chromosome and converts them to `Cytoband` objects. Caches per-chromosome results. |

### Other Genome Files

| File | Class/Function | Role |
|------|---------------|------|
| `js/genome/bpt.ts` | `BPTree` | B+ tree index used by 2bit files for efficient chromosome name lookup when the sequence file uses an external index. |
| `js/genome/clinVar.ts` | ClinVar utilities | ClinVar variant annotation lookup support. |
| `js/genome/hgvs.ts` | HGVS utilities | HGVS (Human Genome Variation Society) nomenclature parsing for variant search. |
| `js/genome/updateReference.ts` | `updateReference()` | Pre-processes genome configuration objects, normalizing URLs and applying defaults before `Genome` construction. |

## Data Flow

```
  GenomeConfig (id, fastaURL, twoBitURL, indexURL, aliasURL, cytobandURL, ...)
         |
   GenomeUtils.expandReference()    -- resolves genome ID to full config
         |
   Genome.createGenome()
         |
    +----+----+
    |         |
    v         v
loadSequence()     ChromAlias source
    |                   |
    +---+---+---+       +---+---+---+
    |   |   |   |       |   |   |   |
   Twobit  IndexedFasta  NonIndexedFasta  ChromSizes
    |       |
    v       v
CachedSequence              ChromAliasBB / ChromAliasFile / ChromAliasDefaults
    |                                |
    +-- SequenceInterval cache       +-- aliasRecordCache
    |   (up to 10 intervals,        |   (maps alias -> canonical name)
    |    min 100kb, viewport-        |
    |    aware eviction)             |
    |                                |
    +--------+---------+-------------+
             |
         Genome instance
             |
    +--------+---------+--------+
    |        |         |        |
getSequence()  getChromosome()  getCytobands()  getGenomeCoordinate()
    |        |         |                |
    v        v         v                v
  Tracks   Browser   IdeogramTrack   Whole Genome View
```

1. **Configuration**: A genome is specified by ID (e.g., `"hg38"`) or a full config object with URLs for sequence, index, cytobands, and aliases.
2. **ID Resolution**: `GenomeUtils.expandReference()` looks up the ID in `KNOWN_GENOMES` (loaded from igv.org or user-defined lists) and expands it to a full config. UCSC hub URLs are also supported.
3. **Initialization**: `Genome.createGenome()` calls `updateReference()` to normalize the config, then constructs and initializes the `Genome` instance.
4. **Sequence Loading**: `loadSequence()` selects the appropriate reader. For indexed FASTA and 2bit formats, the reader is wrapped in `CachedSequence` which maintains a sliding window of cached `SequenceInterval` objects (up to 10, minimum 100kb each, evicted when out of viewport).
5. **Chromosome Discovery**: Chromosomes are obtained from the sequence reader (if available), a `.chrom.sizes` file, or loaded on demand from the sequence file.
6. **Alias Resolution**: One of three `ChromAlias` sources is initialized based on config: `ChromAliasBB` (BigBed), `ChromAliasFile` (text), or `ChromAliasDefaults` (hardcoded patterns). All implement `getChromosomeName()` (alias to canonical) and `search()` (lookup alias record).
7. **Whole Genome View**: If enabled, `wgChromosomeNames` is computed (filtering small scaffolds or using explicit `chromosomeOrder`), cumulative offsets are calculated, and a pseudo-chromosome `"all"` is added.
8. **Runtime Access**: Tracks and the browser query the genome for sequence data, chromosome metadata, coordinate conversions, and cytoband data throughout the session.

## Dependencies

### Internal Dependencies
- `js/bigwig/bwSource.ts` -- `BWSource` used for MANE transcript and rsDB feature lookups
- `js/bigwig/bwReader.ts` -- `BWReader` used by `ChromAliasBB` for BigBed alias queries
- `js/bigwig/bpTree.ts` -- B+ tree for BigBed/BigWig index navigation
- `js/binary.ts` -- `BinaryParser` for parsing binary sequence formats (2bit, FASTA index)
- `js/util/igvUtils.ts` -- `buildOptions()`, `isDataURL()`, `isNumber()`
- `js/types/genome.ts` -- `GenomeConfig` type
- `js/types/config.ts` -- `BrowserConfig` type
- `js/browser.ts` -- `Browser` type (genome holds a reference for viewport-aware cache eviction)
- `js/referenceFrame.ts` -- `ReferenceFrame` type (used by `CachedSequence` for viewport overlap checks)
- `js/ucsc/ucscUtils.ts` -- `convertToHubURL()` for UCSC hub genome support
- `js/ucsc/hub/hub.ts` -- `loadHub()` for loading UCSC track hub genomes

### External Dependencies
- `igv-utils` -- `igvxhr` (HTTP loading with byte-range support), `BGZip` (bgzip decompression, data URI decoding), `StringUtils` (line splitting, number formatting)
