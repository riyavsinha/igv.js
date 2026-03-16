# HTSget Module

## Purpose

The HTSget module implements client-side support for the GA4GH htsget protocol, which provides a standardized REST API for streaming slices of large genomic data files (BAM and VCF). Instead of downloading entire files, htsget allows igv.js to request only the data for a specific genomic region, receiving a "ticket" containing URLs to data blocks that are fetched and concatenated. This module provides readers for both alignment (BAM) and variant (VCF) data accessed through htsget endpoints.

## Genomic Context

The htsget protocol (GA4GH standard) solves a critical scalability problem in genomics: BAM and VCF files can be tens to hundreds of gigabytes, but a user typically views only a small genomic region at a time. Traditional approaches require BAM index files (.bai) and range requests, which can be complex to set up. htsget simplifies this by providing a two-step process: (1) request a "ticket" for a region, which returns URLs to the relevant data blocks, (2) fetch and concatenate those blocks to reconstruct the region's data. This is particularly useful for cloud-hosted data where direct byte-range access may not be available or efficient.

## Key Classes & Files

### `htsget/htsgetReader.ts`
The base `HtsgetReader` class implements the core htsget protocol:
- **URL construction**: Supports multiple URL configuration styles for backward compatibility -- a single `url`, or deprecated `endpoint` + `id` combination. Also handles the `htsget://` URI scheme by converting it to `https://`.
- **Header requests**: `readHeaderData()` fetches the file header by appending `?class=header&format=<FORMAT>` to the URL.
- **Region requests**: `readData(chr, start, end)` fetches data for a specific region by appending region parameters to the URL.
- **Ticket processing**: `loadUrls()` processes the htsget ticket response, which contains an array of URL objects. Each URL may be a regular HTTP URL (fetched as ArrayBuffer) or a `data:` URI (decoded inline). Supports custom headers per URL block. All blocks are fetched in parallel via `Promise.all()` and concatenated into a single `Uint8Array`.
- **Format inference**: Static `inferFormat()` method probes an htsget endpoint to determine whether it serves BAM or VCF data, used for auto-configuration.
- Supports only BAM and VCF formats (throws for others like CRAM).

### `htsget/htsgetBamReader.ts`
`HtsgetBamReader` extends `HtsgetReader` to provide BAM-specific functionality:
- **Header decoding**: On first read, fetches compressed header data via htsget, decompresses with `BGZip.unbgzf()`, and decodes the BAM header to extract chromosome names and indices.
- **Chromosome aliasing**: Creates a `ChromAliasManager` to handle chromosome name mismatches between the reference genome and the BAM file (e.g., "chr1" vs "1").
- **Alignment decoding**: Fetches region data, decompresses, re-decodes the BAM header (the htsget response includes the header with each region request), then decodes BAM records into an `AlignmentContainer` using `BamUtils.decodeBamRecords()`.
- **Reader defaults**: Applies BAM reader defaults (e.g., filter settings) via `BamUtils.setReaderDefaults()`.
- Returns an empty `AlignmentContainer` for chromosomes not found in the BAM header, and an empty array for whole-genome ("all") queries.

### `htsget/htsgetVariantReader.ts`
`HtsgetVariantReader` extends `HtsgetReader` to provide VCF-specific functionality:
- **Header parsing**: Fetches and optionally decompresses (handles both gzipped and plain responses) the VCF header, then parses it using `VcfParser` to extract metadata and sequence names.
- **Chromosome aliasing**: Creates a `ChromAliasManager` from the VCF header's sequence names.
- **Feature parsing**: Fetches region data, decompresses if needed, and parses VCF records into `Variant` and `SVComplement` objects using `VcfParser.parseFeatures()`.
- Returns an empty array for whole-genome ("all") queries.

## Data Flow

```
htsget endpoint (REST API)
    |
    v
HtsgetReader.readData(chr, start, end)
    |  1. Constructs URL with region params
    |  2. Fetches ticket JSON: { htsget: { urls: [...] } }
    |  3. Fetches all URL blocks in parallel
    |  4. Concatenates into single Uint8Array
    v
HtsgetBamReader.readAlignments()       HtsgetVariantReader.readFeatures()
    |                                       |
    |  BGZip.unbgzf() decompress            |  ungzip() if needed
    |  BamUtils.decodeBamHeader()           |  VcfParser.parseHeader()
    |  BamUtils.decodeBamRecords()          |  VcfParser.parseFeatures()
    v                                       v
AlignmentContainer                     Variant[] / SVComplement[]
    |                                       |
    v                                       v
AlignmentTrack.draw()                  VariantTrack.draw()
```

## Dependencies

**Depends on:**
- `igv-utils` (external) -- `igvxhr` for HTTP requests, `FileUtils` for filename extraction, `BGZip` for BGZF decompression, `isgzipped`/`ungzip` for gzip detection and decompression
- `js/bam/bamUtils.ts` -- `decodeBamHeader()`, `decodeBamRecords()`, `setReaderDefaults()` for BAM processing
- `js/bam/alignmentContainer.ts` -- container for decoded alignment records
- `js/variant/vcfParser.js` -- VCF header and record parsing
- `js/feature/chromAliasManager.ts` -- chromosome name alias resolution
- `js/feature/dataWrapper.ts` -- wraps raw bytes/strings for line-by-line parsing
- `js/util/igvUtils.ts` -- `buildOptions()` for HTTP request configuration

**Depended on by:**
- `js/trackFactory.js` -- creates `HtsgetBamReader` or `HtsgetVariantReader` when `sourceType: "htsget"` is specified in track config
- `js/bam/bamSource.ts` -- uses `HtsgetBamReader` as an alignment reader
- `js/variant/variantSource.js` -- uses `HtsgetVariantReader` as a variant reader
