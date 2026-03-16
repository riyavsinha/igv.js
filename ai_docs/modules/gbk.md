# GenBank Module

## Purpose

The GenBank module parses GenBank flat-file format (`.gbk` / `.gb`) data and presents it as both a reference genome and an annotation feature source within igv.js. Unlike most genome browsers that treat the reference genome and annotations as separate data sources, a GenBank file combines both the nucleotide sequence and its feature annotations (genes, CDS, regulatory elements, etc.) in a single file, making this module serve a dual role.

## Genomic Context

GenBank flat-file format is one of the oldest and most widely used formats in bioinformatics, maintained by NCBI as the standard submission format for the International Nucleotide Sequence Database Collaboration (INSDC). Each GenBank record describes a single contiguous nucleotide sequence (a "locus") along with its biological annotations. The format is structured with header metadata (LOCUS, ACCESSION, DEFINITION), a FEATURES table containing annotations with locations and qualifiers (gene names, protein translations, database cross-references), and an ORIGIN section containing the nucleotide sequence.

GenBank files are commonly used for:
- Viral genomes and plasmids (typically single-contig)
- Bacterial genomes and operons
- Individual gene or transcript records
- Custom reference sequences for targeted sequencing experiments

In igv.js, loading a GenBank file creates a self-contained genome browser session: the sequence becomes the reference, the features become annotation tracks, and the locus/accession becomes the chromosome name.

## Key Classes & Files

### `gbk/genbank.ts`
The `Genbank` class implements the Genome interface, allowing a GenBank record to serve as a reference genome in igv.js. It wraps a single chromosome (the GenBank locus) with its sequence and provides all the methods required by the genome interface:

- **Chromosome management**: `getChromosome(chr)`, `getChromosomes()`, `chromosomeNames`, `getFirstChromosomeName()`, `getHomeChromosomeName()` -- all return the single chromosome derived from the accession number (or locus name if no accession).
- **Sequence access**: `getSequence(chr, start, end)` returns a substring of the stored sequence. `getSequenceInterval()` returns a `SequenceInterval` wrapping the entire sequence.
- **Coordinate conversion**: `getGenomeCoordinate()` and `getChromosomeCoordinate()` are trivial identity mappings since there is only one chromosome.
- **Identity**: `id` returns the accession, `name` and `description` return the locus name, `initialLocus` returns the chromosome name.
- **Limitations**: `showWholeGenomeView()` returns false (single chromosome), `wgChromosomeNames` returns undefined, `getCytobands()` returns empty array, `getAliasRecord()` returns undefined.
- **Serialization**: `toJSON()` returns `{ gbkURL }` for session save/restore.

### `gbk/genbankFeatureSource.ts`
The `GenbankFeatureSource` class extends `BaseFeatureSource` and adapts GenBank features for use with igv.js's feature track system. It:

- Lazily loads and parses the GenBank file on first `getFeatures()` call using `loadGenbank()`.
- Wraps the parsed features in a `StaticFeatureSource` (all features loaded in memory).
- Configures searchable fields: `gene`, `db_xref`, `locus_tag`, `transcript_id` -- allowing users to search for features by these attribute names.
- Delegates `getFeatures()` queries to the underlying `StaticFeatureSource` for region-based filtering.
- Implements `search(term)` to find features by name/attribute.
- `supportsWholeGenome()` returns false.

### `gbk/genbankParser.ts`
The parser that converts GenBank flat-file text into a `Genbank` object. Contains:

**`loadGenbank(url)`**: Async function that fetches a GenBank file from a URL, parses it, stores the URL on the result, and caches it in a module-level `Map` (`genbankCache`) keyed by URL to avoid redundant fetches.

**`parseGenbank(data)`**: Synchronous parser that processes the flat-file text:
1. **LOCUS line**: Extracts the locus name from the first line.
2. **Header section**: Scans for `ACCESSION` (required identifier, used as chromosome name) and `ALIASES` (an IGV-specific extension for chromosome name aliases, comma-separated).
3. **FEATURES section**: Delegates to `parseFeatures()`.
4. **ORIGIN section**: Delegates to `parseSequence()`.
5. Constructs and returns a `Genbank` instance with `chr` set to accession (falling back to locus name).

**`parseFeatures(chr, dataWrapper)`**: Parses the FEATURES table, producing an array of `GenbankFeature` objects. Each feature has:
- `type` -- The feature key (e.g., `gene`, `CDS`, `mRNA`, `tRNA`, `misc_feature`). The `source` feature type is excluded.
- `chr` -- Set to the accession/locus name.
- `attributes` -- A key-value map of qualifiers (e.g., `/gene="lacZ"`, `/db_xref="GeneID:945006"`).
- `getAttributeValue(key)` -- Accessor method for attributes.
- `start`, `end` -- Genomic coordinates (0-based start, 1-based end, converted from GenBank's 1-based notation).
- `strand` -- `"+"` or `"-"`, determined by presence of `complement` in the location string.
- `exons` -- For `join()` locations, an array of exon objects with `{chr, start, end, strand}`.

The parser handles GenBank location syntax including:
- Simple ranges: `100..200`
- Complement (reverse strand): `complement(100..200)`
- Joins (multi-exon): `join(100..200,300..400)`
- Partial indicators: `<100..>200` (stripped during parsing)
- Order notation: `order(100..200,300..400)` (treated same as join)
- Single positions: `500`

Qualifiers are parsed from `/key=value` lines, with double-quote stripping. Multi-line qualifiers and location strings are concatenated.

**`parseSequence(dataWrapper)`**: Reads the ORIGIN section, extracting nucleotide characters while ignoring line numbers and whitespace. Reads until the `//` terminator.

**`createExons(joinString, chr, strand)`**: Splits a comma-separated coordinate string into individual exon objects, sorted by start position.

## Data Flow

1. **Genome loading** -- When a GenBank file is specified as the genome source, igv.js calls `loadGenbank(url)` which fetches and parses the file, producing a `Genbank` object that implements the genome interface.
2. **Reference sequence** -- The `Genbank` object stores the entire nucleotide sequence in memory. When the sequence track or any analysis needs reference bases, `getSequence(chr, start, end)` returns the appropriate substring directly (no network fetch needed).
3. **Feature track creation** -- A feature track configured with the GenBank URL creates a `GenbankFeatureSource`.
4. **Feature loading** -- On first viewport render, `GenbankFeatureSource.getFeatures()` calls `loadGenbank()` (which returns the cached `Genbank` object), extracts the features array, and wraps them in a `StaticFeatureSource`.
5. **Feature queries** -- Subsequent `getFeatures({chr, start, end})` calls filter the in-memory features by region via `StaticFeatureSource`.
6. **Rendering** -- Features are rendered by the standard `FeatureTrack` rendering pipeline, with gene/CDS/mRNA features displayed as typical gene annotation glyphs (boxes for exons, lines for introns, arrows for strand).
7. **Search** -- Users can search for features by gene name, locus tag, transcript ID, or database cross-reference, which queries the `StaticFeatureSource`'s search index.

## Dependencies

### Depends on
- `feature/staticFeatureSource.js` -- Wraps the parsed features array for region-based querying and search indexing.
- `feature/baseFeatureSource.ts` -- Base class for `GenbankFeatureSource`.
- `feature/dataWrapper.ts` -- Provides line-by-line iteration over the raw text data (`getDataWrapper`, `SyncDataWrapper`).
- `genome/sequenceInterval.ts` -- Used by `getSequenceInterval()` to return sequence data in the expected format.
- `genome/chromosome.ts` -- Imported (though `ChromosomeInfo` is defined locally as an interface).
- `igv-utils` (`igvxhr`) -- For fetching the GenBank file from a URL via `igvxhr.loadString()`.

### Depended on by
- The igv.js genome initialization system recognizes GenBank files (by extension or config) and uses `loadGenbank()` to create a `Genbank` genome object.
- Feature tracks can use `GenbankFeatureSource` when configured with a GenBank URL, enabling annotation display alongside the GenBank reference.
- Session save/restore serializes the GenBank URL and recreates the genome on restore.
