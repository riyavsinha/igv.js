# AED Module

## Purpose

The AED (Affymetrix Expression Data) module provides a parser for the AED file format, a tab-delimited genomic annotation format used primarily by Affymetrix/Thermo Fisher tools such as the CHaS (Chromosome Analysis Suite) Browser. It handles parsing of AED-specific headers, metadata rows, and genomic feature records, converting them into IGV-compatible feature objects with chromosome, start, end, strand, and display properties.

## Genomic Context

AED files are a proprietary format from Affymetrix used to represent genomic annotations and copy number analysis results from microarray experiments. The format is similar to BED but uses a self-describing header row that defines column namespaces, names, and types (e.g., `bio:start(aed:Integer)`). This makes the format extensible -- columns are identified by namespace-qualified names rather than fixed positions. AED files typically contain cytogenetic band data, copy number segments, or gene annotations produced by tools like the Chromosome Analysis Suite. The format supports file-level metadata (such as genome version, application version, and creation timestamps) embedded as special two-column rows within the data section.

## Key Classes & Files

### `aed/AEDParser.ts`

This is the sole file in the module, containing the `AEDParser` class and all supporting functions.

**`AEDParser` class** -- The main parser implementing two methods:
- `parseHeader(dataWrapper)` -- Reads `track`, `#columns`, and `browser` directive lines from the beginning of the file. Extracts track properties (key=value pairs) and column directives (color column index, thickness column index). Detects GFF3 format markers.
- `parseFeatures(dataWrapper)` -- Iterates through data rows. The first non-header row is treated as the AED column definition row (parsed by `parseAedHeaderRow`). Subsequent rows are decoded into `AedFeatureData` objects. Uses a custom tokenizer (`readTokensAed`) that handles double-quoted strings spanning multiple lines and escaped double-quotes (`""` becomes `"`).

**`AedColumn` interface** -- Describes a column with `namespace`, `name`, and `type` fields. Examples: `{namespace: "bio", name: "start", type: "aed:Integer"}`.

**`AedData` interface** -- Holds the parsed header structure: an array of `AedColumn` descriptors and a nested metadata dictionary keyed by namespace and field name.

**`AedFeatureData` interface** -- The feature object produced by parsing. Maps AED columns to standard genomic fields:
- `bio:sequence` maps to `chr`
- `bio:start` / `bio:end` map to `start` / `end`
- `bio:cdsMin` / `bio:cdsMax` map to `cdStart` / `cdEnd`
- `bio:strand` maps to `strand`
- `aed:name` maps to `name`
- `style:color` maps to `color` (converted via `IGVColor.createColorString`)

**Key helper functions:**
- `parseAedToken(value)` -- Parses a single column header token like `refseq:accessionNumber(aed:String)` into its namespace/name/type components using regex matching.
- `parseAedHeaderRow(tokens)` -- Constructs an `AedData` object from the first data row (column definitions).
- `decodeAed(tokens, ignore)` -- The default decode function. Distinguishes metadata rows (rows with only `aed:name` and `aed:value` populated) from feature rows. Metadata rows are stored in `this.aed.metadata`; feature rows are instantiated as `AedFeature` objects.
- `AedFeature(aed, allColumns)` -- Constructor function (used with `new`) that maps column values to genomic fields based on namespace. Integers are parsed when the column type is `aed:Integer`. Has a `popupData()` method on its prototype that dumps all non-trivial columns for display in IGV popups.
- `parseTrackLine(line)` -- Parses UCSC-style `track` lines into key=value property dictionaries.
- `parseColumnsDirective(line)` -- Parses `#columns` directives that specify color and thickness column indices.

## Data Flow

```
File/Data URL
    |
    v
DataWrapper (line-by-line reader)
    |
    v
AEDParser.parseHeader()     -->  Track properties, column directives
    |
    v
AEDParser.parseFeatures()
    |
    |--> First data row: parseAedHeaderRow()  -->  AedData (column definitions)
    |
    |--> Metadata rows: decodeAed() stores in AedData.metadata
    |
    |--> Feature rows: decodeAed() --> AedFeature constructor
    |       Maps bio:sequence -> chr, bio:start -> start, etc.
    |       Parses aed:Integer columns as numbers
    |       Converts style:color via IGVColor
    |
    v
AedFeatureData[] (array of genomic features)
    |
    v
Track rendering (uses .chr, .start, .end, .name, .color, .popupData())
```

The parser is consumed by the general feature loading pipeline in igv.js. It is instantiated when a file is identified as AED format. The `DataWrapper` abstraction provides line-by-line access to either local or remote file data.

## Dependencies

**Internal dependencies:**
- `IGVColor` from `igv-utils` -- Used for color string normalization (`createColorString`)

**Depended on by:**
- The feature track loading infrastructure (likely `js/feature/featureFileReader.ts` or similar) instantiates `AEDParser` when the file format is detected as AED
- Track rendering code consumes the `AedFeatureData` objects, particularly `popupData()` for tooltip display

**No dependencies on:**
- This module is self-contained and does not depend on any other igv.js modules beyond the shared utility library
