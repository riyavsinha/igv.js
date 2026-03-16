---
sidebar_position: 1
slug: /
---

# Introduction to igv.js

**igv.js** is an embeddable interactive genome visualization component for the web, developed by the [Integrative Genomics Viewer (IGV)](https://igv.org) team at the Broad Institute.

## What is igv.js?

igv.js lets you embed a fully interactive genome browser in any web page. It supports 40+ genomic data formats, multiple reference genomes, and provides a rich set of visualization options for sequence alignments, variants, gene annotations, quantitative data, and more.

## What this documentation covers

This documentation goes beyond the [official API docs](https://igv.org/doc/igvjs) to provide:

- **Genomic data format guides** — Not just how to load a BAM file, but what BAM files *are*, why they exist, and how they relate to the broader bioinformatics ecosystem
- **Architecture deep-dives** — How igv.js works internally: the data pipeline, rendering system, track architecture, and coordinate system
- **Module reference** — What every module in the codebase does, file by file
- **Modernization roadmap** — Plans for headless mode, framework integration, and performance optimization

## Quick example

```html
<div id="igv-div"></div>
<script type="module">
  import igv from "https://cdn.jsdelivr.net/npm/igv@3.8.0/dist/igv.esm.min.js"

  const options = {
    genome: "hg38",
    locus: "chr8:127,736,588-127,739,371",
    tracks: [
      {
        type: "alignment",
        format: "bam",
        url: "https://1000genomes.s3.amazonaws.com/phase3/data/HG00096/alignment/HG00096.mapped.ILLUMINA.bwa.GBR.low_coverage.20120522.bam",
        indexURL: "https://1000genomes.s3.amazonaws.com/phase3/data/HG00096/alignment/HG00096.mapped.ILLUMINA.bwa.GBR.low_coverage.20120522.bam.bai",
        name: "HG00096"
      }
    ]
  }

  igv.createBrowser(document.getElementById('igv-div'), options)
</script>
```

## Supported track types

| Track Type | Formats | Description |
|-----------|---------|-------------|
| Alignment | BAM, CRAM | Sequence read alignments |
| Variant | VCF | SNPs, indels, structural variants |
| Feature | BED, GFF3, GTF, GenBank | Gene annotations, regulatory elements |
| Quantitative | BigWig, WIG, bedGraph, TDF | Signal tracks, coverage |
| Segmentation | SEG, MAF, MUT | Copy number, mutations |
| Interaction | BEDPE, interact | Chromatin interactions, loops |
| GWAS | GWAS | Manhattan plots |
| QTL | QTL, eQTL | Expression associations |
| Splice Junction | BED | RNA splice junctions |
| RNA Structure | .bp | Secondary structure arcs |

