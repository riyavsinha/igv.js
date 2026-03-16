# Feature Module

## Purpose

The Feature module is the largest and most central module in igv.js, responsible for loading, parsing, caching, and rendering genomic annotation and quantitative data from a wide variety of file formats. It implements the full data pipeline from raw file access through feature display, supporting formats including BED, GFF3/GTF, WIG, VCF, SEG, BEDPE, interact, GenePred, and many others. The module uses a factory pattern to dispatch to format-specific readers, parsers, and decoders, with an interval-tree-based caching layer for efficient genomic range queries.

## Genomic Context

Genomic feature data describes annotations mapped to specific chromosome coordinates -- genes, transcripts, regulatory elements, variants, quantitative signals, copy number segments, splice junctions, and chromatin interactions. This module must handle the diversity of bioinformatics file formats that encode such data, each with distinct column layouts, hierarchical structures (e.g., GFF gene models with parent-child relationships), and indexing strategies (tabix for bgzipped files, tribble for plain text). Efficient retrieval is critical because the browser must rapidly query features within a visible genomic window (often a few kilobases) from datasets spanning entire genomes.

## Key Classes & Files

### Sources (data access layer)

| File | Class/Function | Role |
|------|---------------|------|
| `js/feature/featureSource.ts` | `FeatureSource()` | Factory function that inspects config format and dispatches to the appropriate source: `BWSource` (BigWig/BigBed), `TDFSource`, `StaticFeatureSource`, `ListFeatureSource`, `HicSource`, `GenbankFeatureSource`, or the default `TextFeatureSource`. |
| `js/feature/baseFeatureSource.ts` | `BaseFeatureSource` | Abstract base class providing `nextFeature()` navigation (forward/backward through chromosomes in 10kb windows) and a stub `getFeatures()` method for subclasses to implement. Defines `BaseFeatureSourceGenome` interface. |
| `js/feature/textFeatureSource.ts` | `TextFeatureSource` | Primary source for text-based feature files. Manages a `FeatureCache`, `ChromAliasManager`, queryability detection (indexed vs. whole-file loading), whole-genome feature computation, wig data summarization via window functions, and searchable feature indexing. Selects reader based on `sourceType` config (custom service, UCSC, htsget, GTEx, or file-based). |
| `js/feature/staticFeatureSource.ts` | `StaticFeatureSource` | Source for in-memory features passed directly via config (no file I/O). Wraps a `FeatureCache` around the provided feature array. |
| `js/feature/listFeatureSource.ts` | `ListFeatureSource` | Reads a two-column text file mapping chromosome names to individual data file URLs (e.g., per-chromosome VCF files). Creates a separate feature source per chromosome using the factory function. |

### Readers (raw data loading)

| File | Class | Role |
|------|-------|------|
| `js/feature/featureFileReader.ts` | `FeatureFileReader` | Core file reader supporting indexed (tabix/tribble), non-indexed, and data-URI-based loading. Selects the appropriate parser based on format (VCF, SEG, GWAS, QTL, AED, or generic `FeatureParser`). Handles header reading, sequence name extraction, and feature sorting. |
| `js/feature/customServiceReader.ts` | `CustomServiceReader` | Reader for custom web service endpoints. Performs URL template substitution (`$CHR`, `$START`, `$END`) and delegates parsing to a `FeatureParser`. |
| `js/feature/ucscServiceReader.ts` | `UCSCServiceReader` | Reader for the UCSC Genome Browser REST API. Constructs exon arrays from `exonStarts`/`exonEnds` fields and returns gene-model-like features. |

### Parsers (text line decoding)

| File | Class | Role |
|------|-------|------|
| `js/feature/featureParser.ts` | `FeatureParser` | Generic line-oriented parser. `setDecoder()` selects from ~25 format-specific decoder functions based on the format string. Handles WIG state-machine directives (`fixedStep`, `variableStep`), track line parsing, and column directive (`#columns`) processing. |
| `js/feature/segParser.ts` | `SegParser` | Parser for SEG, MUT, and MAF formats. Creates `SegFeature` objects with popup data generation including CRAVAT link extraction for cancer mutations. |

### Decoders (`decode/` subdirectory)

| File | Key Functions | Formats |
|------|--------------|---------|
| `js/feature/decode/ucsc.ts` | `decodeBed`, `decodeBedGraph`, `decodeWig`, `decodeNarrowPeak`, `decodeGenePred`, `decodeSnp`, `decodeRepeatMasker`, `decodeBedMethyl` | BED (3-12+ columns), BedGraph, WIG, NarrowPeak, GenePred/GenePredExt, dbSNP, RepeatMasker, Bedmethyl |
| `js/feature/decode/bedpe.ts` | `decodeBedpe`, `decodeHiccups` | BEDPE paired-end intervals, HiCCUPS loop calls |
| `js/feature/decode/interact.ts` | `decodeInteract` | UCSC interact format |
| `js/feature/decode/custom.ts` | `decodeCustom` | User-defined columnar formats via column name mappings |
| `js/feature/decode/fusionJuncSpan.ts` | `decodeFusionJuncSpan` | FusionInspector junction spans |
| `js/feature/decode/gtexGWAS.ts` | `decodeGtexGWAS` | GTEx GWAS summary statistics |
| `js/feature/decode/longrange.ts` | `decodeLongrange` | WashU long-range interaction format |
| `js/feature/decode/decodeError.ts` | `DecodeError` | Error wrapper class for decoder failures |

### GFF/GTF (`gff/` subdirectory)

| File | Class/Function | Role |
|------|---------------|------|
| `js/feature/gff/gff.ts` | `decodeGFF3()`, `decodeGTF()` | Line-level decoders that parse individual GFF3/GTF records into `GFFFeature` objects with parsed attributes. |
| `js/feature/gff/gffFeature.ts` | `GFFFeature` | Feature class with lazy attribute caching, exon management (`addExon()`), CDS tracking, popup data generation with attribute table rendering. |
| `js/feature/gff/gffHelper.ts` | `GFFHelper` | Assembles individual GFF/GTF records into hierarchical gene models via `combineFeatures()`. Links transcripts to genes by `Parent` (GFF3) or `transcript_id` (GTF) relationships, assigns exons and CDS to transcripts. |
| `js/feature/gff/parseAttributeString.ts` | `parseAttributeString()` | Parses GFF3 (`;`/`=` delimited) and GTF (`;`/space delimited, quoted values) attribute strings with percent-encoding support. |
| `js/feature/gff/so.ts` | `isExon()`, `isTranscript()`, `isCoding()`, `isUTR()`, `isIntron()` | Sequence Ontology type classification functions for GFF feature types. |

### Tracks (visualization)

| File | Class | Role |
|------|-------|------|
| `js/feature/featureTrack.ts` | `FeatureTrack` | General annotation track with COLLAPSED/SQUISHED/EXPANDED display modes, color-by-attribute/strand/altAllele support, feature search, label rendering, context menu with BLAT and sequence view/copy. |
| `js/feature/wigTrack.ts` | `WigTrack` | Quantitative data track supporting graph types (bar, line, points, heatmap, dynseq), autoscaling, log scale, flip axis, window functions (mean/min/max), and dynamic sequence rendering with SVG path-based nucleotide glyphs. |
| `js/feature/segTrack.ts` | `SegTrack` | Multi-sample segmented copy number / mutation track with sample sorting/grouping by attribute, positive/negative color scales, and mutation type color tables. |
| `js/feature/spliceJunctionTrack.ts` | `SpliceJunctionTrack` | RNA splice junction visualization using bezier curves with configurable filtering, coloring, labeling, and arc thickness based on read depth. |
| `js/feature/interactionTrack.ts` | `InteractionTrack` | Chromatin interaction (BEDPE/interact) track with nested and proportional arc rendering, intra/inter-chromosomal support, and JBrowse circular view integration. |
| `js/feature/mergedTrack.ts` | `MergedTrack` | Overlay of multiple tracks on a shared viewport with coordinated autoscaling, transparency control, and configurable track separation. |

### Renderers (`render/` subdirectory)

| File | Function | Role |
|------|----------|------|
| `js/feature/render/renderFeature.ts` | `renderFeature()` | Main feature renderer handling exon/UTR/CDS drawing, amino acid translation overlays, label positioning (inside or adjacent to features), and arrow direction indicators. |
| `js/feature/render/renderFusionJunction.ts` | `renderFusionJuncSpan()` | Specialized renderer for fusion junction span features. |
| `js/feature/render/renderSnp.ts` | `renderSnp()` | SNP renderer with function-class-based coloring schemes. |

### Utilities

| File | Class/Function | Role |
|------|---------------|------|
| `js/feature/featureCache.ts` | `FeatureCache` | Feature cache using `IntervalTree`-based range queries. Indexes features by chromosome, supports `queryFeatures(chr, start, end)` and `findFeatures(predicate)`. Uses `IndexRange` objects as tree values for memory-efficient storage. |
| `js/feature/featurePacker.ts` | `pack()` | Row assignment algorithm that packs features into non-overlapping rows for stacked display. |
| `js/feature/featureUtils.ts` | `computeWGFeatures()`, `packFeatures()`, `findFeatureAfterCenter()` | Whole-genome feature computation with reservoir sampling for downsampling, chromosome-segregated packing, and binary-search-based feature navigation. |
| `js/feature/dataWrapper.ts` | `StringDataWrapper`, `ByteArrayDataWrapper` | Line-by-line iteration adapters for string or `Uint8Array` data, used by parsers and readers. |
| `js/feature/chromAliasManager.ts` | `ChromAliasManager` | Maps reference genome sequence names to data source aliases (e.g., `chr20` to `20`) using the genome's alias records. Caches lookups to avoid repeated searches. |
| `js/feature/intervalTree.ts` | `IntervalTree` | Red-black balanced binary tree implementation for interval-based queries. Supports `insert(start, end, value)` and `findOverlapping(start, end)`. |
| `js/feature/tribble.ts` | `loadTribbleIndex()` | Parser for Tribble index files (`.idx`) used by non-bgzipped indexed feature files. Supports linear and interval tree index types. |
| `js/feature/wigSummary.ts` | `summarizeData()` | Bins wig features into pixel-width intervals applying window functions (mean, min, max) for downsampled display. |

## Data Flow

```
                        Config
                          |
                    FeatureSource()         -- Factory dispatches by format
                          |
            +-------------+-------------+
            |             |             |
     TextFeatureSource  BWSource   StaticFeatureSource  ...
            |
     +------+------+
     |             |
FeatureFileReader  CustomServiceReader / UCSCServiceReader
     |
     +-- FeatureParser.setDecoder() --> format-specific decoder (BED, GFF, WIG, etc.)
     |       |
     |   GFFHelper.combineFeatures()    -- assembles gene models (GFF/GTF only)
     |
     +-- ChromAliasManager              -- translates chromosome names
     |
     +-- FeatureCache                   -- IntervalTree-indexed storage
            |
            +-- queryFeatures(chr, start, end)
            |
            +-- computeWGFeatures()     -- whole genome view (reservoir sampling)
            |
    Track (FeatureTrack / WigTrack / SegTrack / ...)
            |
     +------+------+
     |             |
   draw()     popupData()
     |
  Renderer (renderFeature / renderSnp / ...)
     |
  Viewport (canvas)
```

1. **Configuration**: Track config specifies format, URL, and display options.
2. **Source Selection**: `FeatureSource()` factory inspects format and creates the appropriate source class.
3. **Reader**: The source's reader loads raw data -- from files (indexed or whole), web services, or in-memory arrays.
4. **Parsing**: `FeatureParser` applies a format-specific decoder function to convert text lines into feature objects. For GFF/GTF, `GFFHelper` further assembles individual records into hierarchical gene models.
5. **Alias Resolution**: `ChromAliasManager` maps between genome and data source chromosome naming conventions.
6. **Caching**: `FeatureCache` stores features in an `IntervalTree` per chromosome for efficient range queries. For non-indexed files, all features are loaded at once; for indexed files, features are cached per query region.
7. **Track Rendering**: Track classes (`FeatureTrack`, `WigTrack`, etc.) call `getFeatures()` on the source, then delegate to renderer functions that paint features onto the canvas.
8. **Whole Genome View**: `computeWGFeatures()` collects features across all chromosomes, downsampling via reservoir sampling when the count exceeds `maxWGCount`.

## Dependencies

### Internal Dependencies
- `js/bigwig/bwSource.ts` -- BigWig/BigBed source (dispatched to by factory)
- `js/tdf/tdfSource.ts` -- TDF source (dispatched to by factory)
- `js/hic/hicSource.ts` -- HiC source (dispatched to by factory)
- `js/gbk/genbankFeatureSource.ts` -- GenBank source (dispatched to by factory)
- `js/qtl/gtexReader.ts` -- GTEx QTL reader (used by TextFeatureSource)
- `js/htsget/htsgetVariantReader.ts` -- Htsget variant reader (used by TextFeatureSource)
- `js/genome/genomicInterval.ts` -- `GenomicInterval` for range representation
- `js/trackBase.ts` -- `TrackBase` parent class for all track types
- `js/igv-canvas.ts` -- `IGVGraphics` canvas drawing utilities
- `js/util/igvUtils.ts` -- `buildOptions()`, `isSimpleType()`, and other utilities
- `js/util/paintAxis.ts` -- Axis painting for quantitative tracks
- `js/binary.ts` -- `BinaryParser` for binary index parsing
- `js/types/` -- Type definitions (`TrackConfig`, `DrawConfiguration`, `ClickState`, `GenomicFeature`, `PopupData`)

### External Dependencies
- `igv-utils` -- `igvxhr` (HTTP/file loading), `StringUtils`, `BGZip` (decompression), `URIUtils`
