# RNA Module

## Purpose

The RNA module visualizes RNA secondary structure data as arc diagrams in igv.js. It renders base-pairing interactions as arcs connecting paired nucleotide positions along the genome, with support for both simple arc format and the `.bp` (base pair) format that encodes paired regions as filled arc bands. This module is specifically for RNA secondary structure visualization, not RNA expression data.

## Genomic Context

RNA secondary structure refers to the pattern of base pairing within an RNA molecule -- the Watson-Crick (A-U, G-C) and wobble (G-U) pairs that cause the single-stranded RNA to fold into characteristic structures like stem-loops, hairpins, internal loops, and pseudoknots. Understanding RNA structure is critical for non-coding RNA function (tRNAs, rRNAs, ribozymes, microRNAs), mRNA regulation (UTR structures affecting translation), and RNA-protein interactions. The `.bp` format represents structure predictions or experimental data (e.g., from SHAPE, DMS, or phylogenetic analysis) as pairs of interacting nucleotide ranges, color-coded by confidence or type. Arc diagrams are a standard way to visualize these structures in a genomic context, where the arc height corresponds to the distance between paired positions.

## Key Classes & Files

### `rna/rnaStruct.ts`
Contains two main classes:

**`RnaStructTrack`** extends `TrackBase` to render RNA structure arcs:
- **Arc rendering**: Draws arcs connecting paired nucleotide positions. For the `.bp` format, draws filled arc bands (two concentric arcs forming a filled region) representing paired stretches of nucleotides. For simpler formats, draws single-line arcs.
- **Arc orientation**: Configurable via `arcOrientation` -- "UP" (default, arcs extend upward from the baseline) or "DOWN" (arcs extend downward). Provides a menu item to toggle direction. Handles backward compatibility where `arcOrientation` was previously a boolean.
- **Arc geometry**: Uses `Math.PI/2` as the theta angle, drawing semicircular arcs. The arc center is at the midpoint of the paired positions, with radius equal to half the distance between them.
- **Color coding**: Features are colored based on their source data (parsed from the `.bp` format's color definitions). Features are sorted by score before drawing so that higher-scored (presumably more confident) structures render on top.
- **Click detection**: Overrides `clickedFeatures()` with custom hit testing that checks if the click point falls between the outer and inner arc radii (within 3px tolerance). For single arcs, checks proximity to the arc line itself. Features are checked in reverse score order (highest first) so the topmost visual feature is returned.
- **Draw state**: Each feature stores its `drawState` (arc center coordinates, radii, start/end angles) during rendering for use in click detection.

**`RNAFeatureSource`** is a custom feature source for the `.bp` format:
- **File parsing**: Loads the entire file as byte array, then parses line by line. The header section (lines starting with "color:") defines color palette entries as tab-separated RGB values with optional descriptor labels. Data lines contain: `chr`, `startLeftNuc`, `startRightNuc`, `endLeftNuc`, `endRightNuc`, `colorIdx`.
- **Coordinate normalization**: Nucleotide positions are 1-based in the file and converted to 0-based. The four positions (startLeft, startRight, endLeft, endRight) are sorted to ensure startLeft < startRight < endLeft < endRight regardless of strand.
- **Caching**: Builds a `FeatureCache` from all features on first load, then serves subsequent queries from cache.
- **Chromosome aliasing**: Creates a `ChromAliasManager` from the set of chromosomes found in the data.
- For non-`.bp` formats, `RnaStructTrack` uses `TextFeatureSource` instead, which handles standard feature file formats.

### `rna/readme.txt`
A brief note clarifying that this module handles "RNA secondary structure, not expression."

## Data Flow

### `.bp` format:
```
.bp file (tab-delimited)
    |
    |  Header: color definitions (color: R  G  B  [label])
    |  Data:   chr  startLeft  startRight  endLeft  endRight  colorIdx
    v
RNAFeatureSource.getFeatures()
    |  1. Load entire file as byte array
    |  2. Parse color header lines
    |  3. Parse data lines into RnaFeature[]
    |  4. Build FeatureCache (one-time)
    |  5. Query cache for chr/start/end
    v
RnaFeature[] (chr, start, end, startLeft, startRight,
              endLeft, endRight, color, score, description)
    |
    v
RnaStructTrack.draw()
    |  - Sort by score (lowest first)
    |  - For each feature:
    |    - .bp features: draw filled arc band (outer arc + inner arc)
    |    - simple features: draw single arc line
    |  - Store drawState on each feature
    v
Canvas rendering (arc bands or arc lines)
    |
    v
RnaStructTrack.clickedFeatures()
    |  - Check click distance from arc radii
    |  - Return closest arc feature
    v
RnaStructTrack.popupData() --> extractPopupData()
```

### Other formats (bed-like):
```
Feature file (bed, interact, etc.)
    |
    v
TextFeatureSource.getFeatures()  -->  standard feature parsing
    |
    v
RnaStructTrack.draw()            -->  draws single arcs (no startLeft/etc.)
```

## Dependencies

**Depends on:**
- `js/trackBase.js` -- base track class providing `init()`, `clickedFeatures()`, `extractPopupData()`, `getGenomeId()`
- `js/igv-canvas.js` (`IGVGraphics`) -- `fillRect()` for background clearing
- `js/feature/textFeatureSource.js` -- feature source for non-`.bp` formats
- `js/feature/featureCache.ts` -- caches all parsed features for efficient region queries
- `js/feature/chromAliasManager.ts` -- chromosome name alias resolution
- `js/feature/dataWrapper.ts` -- wraps byte arrays for line-by-line parsing
- `igv-utils` (external) -- `igvxhr.loadByteArray()` for file loading
- `js/util/igvUtils.ts` -- `buildOptions()` for configuring HTTP requests
- `js/genome/genome.js` (`Genome`) -- genome reference for chromosome alias setup

**Depended on by:**
- `js/trackFactory.js` -- registers `RnaStructTrack` as the handler for `type: "arc"` and format `"bp"` tracks
- Any browser configuration that loads RNA secondary structure data
