# Genome System

## Overview

The genome system manages reference genomes — the canonical DNA sequences against which all genomic data is aligned. It handles chromosome information, sequence retrieval, name aliasing, and cytoband display.

## Core Classes

### Genome (`js/genome/genome.ts`)

The main class representing a loaded reference genome assembly (e.g., hg38, mm10).

**Key properties:**
- `id` — Genome identifier (e.g., "hg38", "mm10")
- `chromosomeNames` — Ordered list of chromosome names
- `chromosomes` — Map of chromosome name → `Chromosome` object
- `sequence` — Sequence provider (FastaSequence, TwoBitSequence, or CachedSequence)
- `chromAlias` — Chromosome name alias manager

**Key methods:**
- `Genome.createGenome(config, browser)` — Static async factory
- `getChromosome(name)` — Look up chromosome (with alias resolution)
- `getSequence(chr, start, end)` — Fetch nucleotide sequence
- `getChromosomeDisplayName(chr)` — User-facing chromosome name
- `loadChromosome(chr)` — Lazy-load chromosome info (for large assemblies)
- `getCumulativeOffset(chr)` — For whole-genome view layout

### Chromosome (`js/genome/chromosome.ts`)
```typescript
{
    name: string      // Internal name (e.g., "chr1")
    bpLength: number  // Length in base pairs
    order: number     // Display order
    bpStart?: number  // Start offset (usually 0)
}
```

### GenomeUtils (`js/genome/genomeUtils.ts`)
Static utility functions:
- `initializeGenomes(config)` — Load the master genome list from Broad/UCSC
- `expandReference(alert, idOrConfig)` — Resolve genome ID to full config
- `isWholeGenomeView(chr)` — Check if viewing all chromosomes
- `KNOWN_GENOMES` — Cached map of genome ID → config URL

## Sequence Providers

Genomes need sequence data for the sequence track and for CRAM decoding.

### IndexedFasta (`js/genome/indexedFasta.ts`)
- Reads `.fasta` + `.fasta.fai` (FASTA index)
- HTTP range requests for random access
- Decodes compressed (BGZIP) FASTA via `.fasta.gz` + `.fasta.gz.fai` + `.fasta.gz.gzi`

### NonIndexedFasta (`js/genome/nonIndexedFasta.ts`)
- Loads entire FASTA into memory
- For small genomes (viral, bacterial)

### TwoBit (`js/genome/twobit.ts`)
- UCSC `.2bit` format — compact binary sequence representation
- 2 bits per nucleotide + mask blocks for soft-masking
- Efficient random access via built-in index

### CachedSequence (`js/genome/cachedSequence.ts`)
Wraps any sequence provider with caching:
- Caches retrieved sequence intervals
- Trims overlapping cache entries
- Prevents redundant fetches for adjacent/overlapping regions

### SequenceInterval (`js/genome/sequenceInterval.ts`)
```typescript
{
    chr: string
    start: number
    end: number
    features: string  // the actual nucleotide string
}
```

## Chromosome Name Aliasing

A persistent problem in bioinformatics: different organizations use different chromosome names (e.g., "chr1" vs "1" vs "CM000663.2"). The alias system handles transparent translation.

### Alias Sources
- `chromAliasDefaults.ts` — Built-in mappings for common genomes (hg38, hg19, mm10, etc.)
- `chromAliasFile.ts` — Tab-delimited alias file (`.chromAlias.txt`)
- `chromAliasBB.ts` — Alias lookup via BigBed file (for UCSC assemblies)

### ChromAliasManager (`js/feature/chromAliasManager.ts`)
Used at the data source level to translate chromosome names between the reference genome and data files:
```typescript
// If the genome uses "chr1" but the BAM file uses "1":
const genomeChr = aliasManager.getChromosomeName("1")  // → "chr1"
```

## Cytoband Data

Cytogenetic bands are the visual banding pattern on chromosomes, used in the ideogram track.

### Cytoband (`js/genome/cytoband.ts`)
```typescript
{
    start: number
    end: number
    name: string       // e.g., "p36.33"
    gieStain: string   // Staining pattern: gneg, gpos25, gpos50, gpos75, gpos100, acen, gvar, stalk
}
```

### Data Sources
- `cytobandFile.ts` — Text-format cytoband file
- `cytobandFileBB.ts` — BigBed-format cytoband data (for UCSC hubs)

## Specialized Features

### ClinVar Integration (`js/genome/clinVar.ts`)
- Builds a search index from ClinVar VCF data
- Enables searching for clinical variant annotations by gene or variant ID

### HGVS Nomenclature (`js/genome/hgvs.ts`)
- Parses HGVS (Human Genome Variation Society) notation
- Translates variant descriptions (e.g., "NM_007294.4:c.5123C>A") to genomic coordinates

### ChromSizes (`js/genome/chromSizes.ts`)
- Minimal genome definition from a `.chrom.sizes` file (name + length pairs)
- Used when a full genome config isn't available

### B+ Tree (`js/genome/bpt.ts`)
- B+ tree index for efficient name-based lookups in binary genome files

## Genome Loading Flow

```
config.genome = "hg38"  (or config.reference = {...})
│
├── GenomeUtils.expandReference("hg38")
│   └── Look up in KNOWN_GENOMES → fetch JSON config
│
├── Genome.createGenome(config, browser)
│   ├── Load chromosome info (from cytoband, chromSizes, or FASTA index)
│   ├── Create sequence provider (IndexedFasta, TwoBit, or NonIndexedFasta)
│   ├── Wrap in CachedSequence
│   ├── Load chromosome aliases
│   │   ├── Try chromAliasDefaults (built-in)
│   │   ├── Try chromAliasFile (if configured)
│   │   └── Try chromAliasBB (BigBed, for hubs)
│   └── Load cytoband data (for ideogram)
│
└── Return Genome instance
```

## Dependencies

- **Used by**: Every module that works with genomic coordinates (all tracks, all readers, Browser)
- **Depends on**: `igv-utils` (for HTTP requests), `bigwig` module (for BigBed alias/cytoband files)
