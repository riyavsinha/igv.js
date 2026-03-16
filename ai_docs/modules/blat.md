# BLAT Module

## Purpose

The BLAT (BLAST-Like Alignment Tool) module enables users to search for DNA sequence alignments against a reference genome directly from within the igv.js browser. It sends a user-provided nucleotide sequence to a BLAT server, receives PSL-formatted alignment results, and displays them as a feature track with an interactive results table.

## Genomic Context

BLAT is a fast sequence alignment tool originally developed at UCSC for quickly finding regions of the genome that match a query DNA sequence. Unlike BLAST, BLAT is optimized for high-identity matches (>95%) and is commonly used for mapping PCR primers, verifying clone sequences, or locating the genomic origin of a short sequence. The results are returned in PSL (Pattern Space Layout) format, a tab-delimited format that describes each alignment with fields like chromosome, start/end positions, strand, match/mismatch counts, and gap information. This module integrates BLAT search capabilities into igv.js, allowing researchers to perform sequence lookups without leaving the genome browser.

## Key Classes & Files

### `blat/blatClient.ts`
The network client that communicates with the BLAT server. Exports a single `blat()` async function that accepts a query sequence (`userSeq`), genome database identifier (`db`), and optional server URL. It POSTs the sequence to the BLAT server (defaulting to `https://igv.org/services/blatUCSC.php`, a proxy for UCSC's BLAT service), receives a JSON response containing PSL-formatted result rows, and decodes each row into a feature object using the `decodePSL` function from the UCSC decoder module. Returns an array of PSL feature objects with fields such as `chr`, `start`, `end`, `strand`, `score`, `matches`, `misMatches`, `repMatches`, etc.

### `blat/blatTable.ts`
A UI component that presents BLAT results in a tabular overlay. Extends `RegionTableBase` (a generic table UI class) to display 13 columns of PSL alignment data: chromosome, start, end, strand, score, match, mis-match, rep. match, N's, Q gap count, Q gap bases, T gap count, and T gap bases. Provides:
- `renderTable(records)` -- clears and populates the table with formatted alignment records.
- `tableRowDOM(record)` -- creates a DOM row for a single BLAT result, formatting numbers with `StringUtils.numberFormatter`.
- `gotoButtonHandler()` -- a static method (bound at call time) that reads selected rows, constructs locus strings (`chr:start-end`), and navigates the browser to those loci via `browser.search()`.
- `getColumnFormatConfiguration()` -- returns the column label/width definitions.

### `blat/blatTrack.ts`
The track class that manages BLAT results as a genome browser track. Extends `FeatureTrack` to inherit standard feature rendering. Key behaviors:
- On initial creation, features are passed via config and wrapped in a `StaticFeatureSource`. On session restore, features are re-fetched from the BLAT server using the stored sequence.
- `openTableView()` creates a `BlatTable` instance and populates it with alignment details extracted from the feature objects.
- `menuItemList()` adds an "Open table view" context menu item to the standard feature track menu.
- `dispose()` cleans up the table DOM element when the track is permanently removed.
- The factory function `createBlatTrack()` orchestrates the full workflow: validates sequence length (max 25,000 bp), calls the BLAT server, creates the track config, loads it into the browser, and opens the results table. This is the main entry point used when a user initiates a BLAT search from the UI.

## Data Flow

1. **User initiates search** -- The user provides a DNA sequence (up to 25,000 bp). `createBlatTrack()` is called with the sequence and browser reference.
2. **BLAT server query** -- `blatClient.blat()` POSTs the sequence to the BLAT server along with the UCSC genome database identifier (e.g., `hg38`). The server returns JSON containing an array of PSL result rows.
3. **PSL decoding** -- Each result row (array of string tokens) is decoded via `decodePSL()` from `feature/decode/ucsc`, producing feature objects with genomic coordinates and alignment statistics.
4. **Track creation** -- The decoded features are passed into a `BlatTrack` config and loaded via `browser.loadTrackList()`. The `BlatTrack` constructor wraps them in a `StaticFeatureSource` (no further fetching needed since all results are in memory).
5. **Rendering** -- `FeatureTrack.draw()` (inherited) renders the alignment features in the viewport at their genomic positions, using color coding (pink for forward, blue-ish for reverse via `color`/`altColor`).
6. **Table display** -- `openTableView()` extracts tabular data from the features and displays it in a `BlatTable` overlay. Users can select rows and click "Go To" to navigate to specific alignment loci.

## Dependencies

### Depends on
- `feature/featureTrack.js` -- Base class for `BlatTrack`, provides standard feature rendering and menu infrastructure.
- `feature/staticFeatureSource.js` -- Wraps in-memory features as a feature source for the track.
- `feature/decode/ucsc.ts` -- Provides `decodePSL()` to parse PSL alignment tokens into feature objects.
- `ui/regionTableBase.js` -- Base class for `BlatTable`, provides generic table UI (popover, row selection, dismiss/goto buttons).
- `ui/utils/dom-utils.js` -- DOM element creation utilities.
- `igv-utils` -- `StringUtils.numberFormatter` for display formatting.
- `trackBase.js` -- Inherited via `FeatureTrack` for track initialization and config merging.
- `browser.js` -- Used for `browser.search()`, `browser.loadTrackList()`, `browser.alert`, and genome/config access.

### Depended on by
- The browser's search/BLAT UI triggers `createBlatTrack()` when a user performs a BLAT search.
- Session save/restore serializes and recreates `BlatTrack` instances.
