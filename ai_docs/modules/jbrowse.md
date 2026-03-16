# JBrowse Module

## Purpose

The JBrowse module provides utilities for integrating igv.js with the `circular-view` library, enabling a circular (Circos-style) genome visualization alongside the linear browser. It converts various genomic feature types (paired alignments, structural variants, BedPE interactions) into "chord" data structures that represent connections between two genomic loci on the circular view. Despite the module name referencing "JBrowse," this module is specifically about circular genome visualization, not JBrowse compatibility.

## Genomic Context

Circular genome views are particularly valuable for visualizing structural variants (SVs), translocations, and long-range chromatin interactions that span large genomic distances or connect different chromosomes. A linear genome browser cannot easily show a translocation between chr1 and chr17, but a circular view renders it as an arc (chord) connecting the two loci. This module handles three main categories of genomic data that benefit from circular visualization:
- **Paired-end and split-read alignments** -- mate pairs mapping to different chromosomes or distant loci indicate structural rearrangements.
- **BedPE features** -- paired-end format explicitly encoding two interacting regions (used for Hi-C loops, ChIA-PET, etc.).
- **VCF structural variants** -- variants with CHR2/END info fields representing inter- or intra-chromosomal rearrangements larger than 1 Mb.

## Key Classes & Files

### `jbrowse/circularViewUtils.ts`
This single file contains all circular view functionality, exported as a collection of functions and one interface:

**Chord construction functions:**
- `makePairedAlignmentChords(alignments)` -- Converts paired-end alignments to chords. Handles both proper paired alignments (with `firstAlignment`/`secondAlignment`) and single alignments with mate information (`mate.chr`/`mate.position`). Each chord gets the read name as its `uniqueId`.
- `makeSupplementalAlignmentChords(alignments)` -- Extracts supplementary alignments from the SA tag and creates chords connecting the primary alignment to each supplementary mapping at a different position. These represent split reads that are evidence for structural variants.
- `makeBedPEChords(features)` -- Converts BedPE features (with `chr1/start1/end1` and `chr2/start2/end2`) into chords. Handles whole-genome pseudo-features by extracting the underlying feature via `_f`.
- `makeVCFChords(features)` -- Filters VCF variants for structural variants (those with `CHR2` and `END` info fields) that are either inter-chromosomal or span > 1 Mb (`MINIMUM_SV_LENGTH`). Creates chords with a 200 bp window around the END position.

**View management functions:**
- `createCircularView(el, browser)` -- Instantiates a `CircularView` component in the given DOM element. Configures a click handler that navigates the linear browser to the clicked chord's locus, either extending an existing panel if the locus overlaps, or creating a new multi-locus panel with 2 kb flanking.
- `makeCircViewChromosomes(genome)` -- Converts the genome's whole-genome chromosome list into the region format expected by the circular view library.
- `sendChords(chords, track, refFrame, alpha)` -- Sends chord data to the circular view with color and naming metadata. Colors are derived from the track color with alpha transparency, and for non-whole-genome views, the chromosome color is used for the chord set. Automatically shows the circular view if it was hidden.
- `circViewIsInstalled()` -- Checks whether the `CircularView` library is available.

**Exported interface:**
- `Chord` -- The data structure representing a connection: `{ uniqueId, refName, start, end, mate: { refName, start, end } }`. Chromosome names are stripped of "chr" prefix (`shortChrName`) for compatibility with the circular view library.

## Data Flow

```
Genomic features (from various track types)
    |
    +--> makePairedAlignmentChords()     (from AlignmentTrack)
    +--> makeSupplementalAlignmentChords() (from AlignmentTrack, SA tag)
    +--> makeBedPEChords()               (from InteractionTrack)
    +--> makeVCFChords()                 (from VariantTrack)
    |
    v
Chord[] (standardized format)
    |
    v
sendChords(chords, track, refFrame, alpha)
    |  - applies track color + alpha
    |  - names chord set with track name + locus
    v
CircularView.addChords()              (circular-view library)
    |
    v
[User clicks chord]
    |
    v
onChordClick callback
    |  - resolves chromosome name
    |  - finds or creates reference frame
    v
Browser navigation (search / addMultiLocusPanel)
```

## Dependencies

**Depends on:**
- `circular-view` (external, `node_modules/circular-view`) -- the circular genome visualization library (`CircularView` class)
- `js/locus.js` (`Locus`) -- locus parsing and overlap/containment checks for chord click navigation
- `js/bam/supplementaryAlignment.ts` -- `createSupplementaryAlignments()` for parsing SA tags
- `igv-utils` (external) -- `IGVColor.addAlpha()` for applying transparency to chord colors
- `js/util/getChrColor.js` -- chromosome-specific color assignment for non-whole-genome chord sets
- `js/browser.js` (`Browser`) -- for navigation on chord click (`addMultiLocusPanel`, `referenceFrameList`)
- `js/referenceFrame.js` (`ReferenceFrame`) -- for extending reference frames to include chord loci

**Depended on by:**
- `js/bam/alignmentTrack.ts` -- calls `makePairedAlignmentChords()` and `makeSupplementalAlignmentChords()` to send alignment data to circular view
- `js/feature/interactionTrack.ts` -- calls `makeBedPEChords()` to send interaction data
- `js/variant/variantTrack.ts` -- calls `makeVCFChords()` to send structural variant data
- `js/browser.js` -- calls `createCircularView()` and `makeCircViewChromosomes()` during initialization
