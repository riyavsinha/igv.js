# Module: Util (`js/util/`)

## Purpose

The util module is a collection of approximately 20 utility files providing foundational services used throughout igv.js. These include color manipulation (scales, palettes, nucleotide colors), file format detection and inference, track type mapping, genomic sequence utilities (complement, reverse-complement), data structures (LRU cache), rendering helpers (axis painting, viewport creation), configuration defaults, and miscellaneous helpers (deep copy, buffer concatenation, downsampling). This module acts as the shared utility layer that prevents code duplication across track types, readers, and UI components.

## Genomic Context

Several files in this module are directly tied to genomic data handling. `sequenceUtils.ts` provides DNA complement and reverse-complement operations essential for rendering reads on the negative strand. `translationDict.ts` contains the standard genetic codon-to-amino-acid translation table used for protein sequence display. `nucleotideColors.ts` defines color schemes for A/C/T/G bases used in sequence tracks and mismatch highlighting. `fileFormatUtils.ts` detects genomic file formats (BAM, CRAM, VCF, bigWig, bigBed, etc.) from file extensions and magic bytes. `trackUtils.ts` maps file formats to track types (e.g., "bam" to "alignment", "vcf" to "variant"). Other files handle general-purpose concerns (colors, caching, configuration) that support the genomic visualization pipeline.

## Key Classes & Files

### Color System

#### `util/colorScale.ts`
Color scale classes for mapping numeric values to colors:
- **`GradientColorScale`** -- Linear interpolation between a min color and max color. Accepts min/max values and RGB color strings. `getColor(value)` returns an interpolated RGB string. Supports serialization (`toJson()`), cloning, and property updates via setters.
- **`DivergingGradientScale`** -- Two-segment gradient with min/mid/max colors, internally composed of two `GradientColorScale` instances (low: min-to-mid, high: mid-to-max). Used for data that diverges from a center point (e.g., log-ratio copy number data).
- **`BinnedColorScale`** -- Maps value ranges to discrete colors using threshold breakpoints.
- **`ConstantColorScale`** -- Always returns the same color.
- **`ColorScaleFactory`** -- Factory with `fromJson()` (creates gradient or diverging scales from config), `defaultGradientScale()`, and `defaultDivergingScale()`.

#### `util/colorPalletes.ts`
Comprehensive color palette definitions and color manipulation utilities:
- **Named palettes**: `colorPalettes` object with ColorBrewer palettes (Set1, Dark2, Set2, Set3, Pastel1, Pastel2, Accent) -- arrays of RGB color strings.
- **Apple Crayon palettes**: `appleCrayonPalette` (hex), `appleCrayonRGBPalette` (r/g/b objects), with helper functions `appleCrayonRGB()` and `appleCrayonRGBA()`.
- **`genericColorPickerPalette`** -- Named hex colors for the UI color picker.
- **`PaletteColorTable`** -- Maps string keys to colors from a named palette, falling back to random generation when the palette is exhausted.
- **`ColorTable`** -- Maps string keys to colors from a provided color map, with wildcard (`*`) support and random fallback.
- **`RandomColorGenerator`** -- Generates aesthetically pleasing random colors using the golden ratio hue distribution algorithm.
- **Utility functions**: `hexToRGB()`, `rgbaColor()`, `rgbColor()`, `greyScale()`, `randomRGB()`, `randomGrey()`, `randomRGBConstantAlpha()`, `rgbaStringTokens()`, `rgbStringTokens()`, `rgbStringLerp()`, `rgbStringHeatMapLerp()`, `isValidColorName()`, `getColorNameRGBString()`.

#### `util/nucleotideColors.ts`
Color schemes for DNA bases:
- **`defaultNucleotideColors`** -- Standard colors: A=green, C=blue, T=red, G=orange, N=gray.
- **`deuterNucleotideColors`** -- Deuteranopia-friendly palette.
- **`ibmNucleotideColors`** -- IBM colorblind-safe palette.

#### `util/getChrColor.ts`
- **`getChrColor(chr)`** -- Returns a consistent color for a chromosome name. Uses a predefined `chrColorMap` with distinct colors for chr1-chr48, chrX, chrY, chrUn. Falls back to random colors for unmapped chromosomes, caching new assignments.

### File Format Detection

#### `util/fileFormatUtils.ts`
Detects genomic file formats from file names and binary content:
- **`inferFileFormat(config)`** -- Main entry point: tries name-based detection first, then content-based.
- **`inferFileFormatFromName(filename)`** -- Strips `.gz`/`.bgz`/`.txt`/`.tab`/`.tsv` extensions, then matches against `knownFileExtensions` (a set of ~40 recognized extensions including narrowpeak, bedgraph, wig, gff3, gtf, seg, vcf, bam, cram, bigwig, bigbed, hic, qtl, etc.).
- **`inferFileFormatFromContents(config)`** -- Reads the first 1000 bytes, handles gzip/bgzip decompression, then checks binary magic numbers (BAM: `BAM\1`, CRAM: `CRAM`, BigWig: `0x888FFC26`, BigBed: `0x8789F2EB`, TDF: `TDF4`) and text headers (VCF `##fileformat`, GFF `##gff-version`, QTL, GWAS, hiccups).
- **`inferIndexPath(url, extension)`** -- Appends an index extension to a URL, preserving query parameters.

#### `util/fileFormats.ts`
Custom file format definitions for generic delimited files:
- **`FileFormat`** interface -- Describes a tabular file format with ordered field names and optional chr/start/end column indices.
- **Pre-defined formats**: `gwascatalog` (23 fields), `wgrna` (10 fields), `cpgislandext` (11 fields), `clinVarMain` (31 fields).
- **`registerFileFormats(name, fields)`** and **`getFormat(name)`** -- Registry for custom format definitions.

### Track Utilities

#### `util/trackUtils.ts`
Maps file formats to igv.js track types:
- **`inferTrackType(format)`** -- Switch statement mapping format strings to track types: bigwig/wig/bedgraph/tdf to "wig", vcf to "variant", bam/cram to "alignment", bedpe/hic to "interact", bed/bigbed to "bedtype", fasta to "sequence", qtl to "qtl", and many others. Default is "annotation".
- **`translateDeprecatedTypes(config)`** -- Normalizes legacy track type names (e.g., "junctions" to "junction", "bed" to "annotation", "bam" to "alignment", "vcf" to "variant").

#### `util/trackClassRegistry.ts`
- **`trackClasses`** -- A simple `Record<string, unknown>` registry that breaks circular dependencies between track types (specifically between VariantTrack and CNVPytorTrack). Track classes register themselves here at module load time.

### Data Structures

#### `util/lruCache.ts`
- **`LRU<V>`** -- A generic least-recently-used cache implemented with `Map` (which maintains insertion order). `get()` refreshes key position by delete-then-set. `set()` evicts the oldest entry when capacity is reached. Default capacity is 10. Used for caching feature data, parsed files, and other expensive-to-compute results.

### Genomic Sequence Utilities

#### `util/sequenceUtils.ts`
DNA sequence manipulation:
- **`complementBase(base)`** -- Returns the Watson-Crick complement (A<->T, G<->C), including IUPAC ambiguity codes (Y<->R, W<->S, K<->M, D<->H, B<->V). Case-preserving.
- **`complementSequence(sequence)`** -- Complements each base in a sequence string.
- **`reverseComplementSequence(sequence)`** -- Reverses and complements a sequence (used for negative-strand reads).

#### `util/translationDict.ts`
- **`translationDict`** -- Complete codon-to-amino-acid mapping for the standard genetic code. Maps all 64 codons to single-letter amino acid codes (or "STOP" for stop codons). Used by the sequence track for three-frame translation display.

### Rendering Helpers

#### `util/paintAxis.ts`
- **`paintAxis(ctx, width, height, color?)`** -- Draws a Y-axis with tick marks and labels on a canvas context. Called as a method on objects with `dataRange` or `axisMin`/`axisMax` properties. Supports axis flipping. Draws a colored strip on the right edge (for autoscale group identification). Formats numbers with appropriate precision (integers, 1 decimal, 2 decimals, or scientific notation).

#### `util/viewportUtils.ts`
- **`createViewport(trackView, column, referenceFrame, width?)`** -- Factory function that creates the correct viewport subclass based on track type: `RulerViewport` for ruler tracks, `IdeogramViewport` for ideogram tracks, `TrackViewport` for everything else. Sets `referenceFrame.viewport` for data-bearing viewports.

### General Utilities

#### `util/igvUtils.ts`
Miscellaneous utilities used throughout the codebase:
- **`isSimpleType(value)`** -- Tests if a value is a boolean, number, string, or symbol (including boxed primitives).
- **`buildOptions(config, options?)`** -- Merges load configuration (oauthToken, headers, withCredentials) with request-specific options. Used before every `igvxhr` call.
- **`doAutoscale(features)`** -- Computes min/max data range from a feature array, ensuring a zero baseline when the max is positive.
- **`validateGenomicExtent(chrLength, extent, minimumBP)`** -- Clamps a genomic region to be at least `minimumBP` wide and within chromosome bounds.
- **`isNumber(num)`**, **`isInteger(str)`** -- Numeric validation helpers.
- **`prettyBasePairNumber(raw)`** -- Formats base pair counts with appropriate units (bp, kb, mb).
- **`isDataURL(obj)`** -- Tests for `data:` URLs.
- **`createColumn(container, className)`** -- Creates a column div element.
- **`insertElementBefore()`** / **`insertElementAfter()`** -- DOM insertion helpers.
- **`isSecureContext()`** -- Tests if page is loaded via HTTPS or localhost.
- **`expandRegion(start, end, extent)`** -- Centers and expands a region to a minimum extent.
- **`getElementVerticalDimension(element)`** -- Gets element height including margins.

#### `util/downsample.ts`
- **`downsample<T>(input, max)`** -- Reservoir sampling algorithm that randomly downsamples an array to at most `max` elements while maintaining statistical representativeness. Used to limit the number of features rendered when density is very high.

#### `util/deepCopy.ts`
- **`deepCopy(o)`** -- Fast recursive deep copy (based on rfdc). Handles arrays, Date objects, plain objects, and preserves File objects and Promises by reference. Used for cloning track configurations and session state.

#### `util/defaultOptions.ts`
- **`defaultOptions`** -- Default browser configuration values (minimumBases: 40, showIdeogram: true, showRuler: true, flanking: 1000, etc.).
- **`setDefaults(config, defaults?)`** -- Fills in missing config properties from defaults.

#### `util/bufferUtils.ts`
- **`concatenateArrayBuffers(arrayBuffers)`** -- Merges multiple `ArrayBuffer` instances into one. Used when reading multi-block compressed data.

#### `util/bgzLineReader.ts`
- **`BGZLineReader`** -- Line-by-line iterator over BGZip-compressed text files. Reads BGZF blocks sequentially, decompresses them, and yields lines. Useful for reading small BGZipped files from the start (not for indexed random access). Used for chromSizes and similar files.

#### `util/ucscUtils.ts`
UCSC-specific data utilities:
- **`scoreShade(score)`** -- Converts a UCSC score (0-1000) to an alpha transparency value.
- **`parseAutoSQL(str)`** -- Parses UCSC autoSQL schema definitions, extracting table name and field descriptions (type, name, description). Used to interpret bigBed extra fields.

#### `util/sessionResourceValidator.ts`
Utilities for detecting session resources that may not be portable:
- **`isLocalFile(obj)`** -- Tests if a value is a `File` instance.
- **`isGoogleDriveURL(url)`** -- Detects Google Drive URLs.
- **`extractGoogleDriveFileId(url)`** -- Extracts file IDs from various Google Drive URL formats.
- **`isProblematicResource(value)`** -- Returns `'local-file'`, `'google-drive'`, or `null`.

## Data Flow

1. **Browser initialization**: `setDefaults()` fills in missing config values --> `inferFileFormat()` / `inferTrackType()` determine track types --> `createViewport()` creates the correct viewport class.
2. **Data loading**: `buildOptions()` prepares HTTP request options --> `igvxhr.load*()` fetches data --> `BGZLineReader` reads compressed text line-by-line --> features are cached in `LRU`.
3. **Rendering**: `doAutoscale()` computes data range from features --> `paintAxis()` draws the Y-axis --> color scales (`GradientColorScale`, `BinnedColorScale`) map values to colors --> `nucleotideColors` provide base colors --> `sequenceUtils` computes complements for negative-strand display.
4. **Downsampling**: When feature density exceeds rendering capacity, `downsample()` reduces the array to a manageable size.
5. **Session management**: `deepCopy()` clones session state --> `sessionResourceValidator` checks for non-portable resources (local files, Google Drive URLs).

## Dependencies

**Depends on**:
- `igv-utils` (IGVColor, IGVMath, StringUtils, FileUtils, BGZip, igvxhr)
- `js/binary.ts` (BinaryParser for magic number detection in fileFormatUtils)
- `js/igv-canvas.ts` (IGVGraphics for paintAxis)
- `js/types/config.ts` (LoadConfig, FileFormat interfaces)
- `js/rulerViewport.ts`, `js/ideogramViewport.ts`, `js/trackViewport.ts` (for viewportUtils factory)
- `js/qtl/qtlParser.ts`, `js/gwas/gwasParser.ts`, `js/feature/decode/bedpe.ts` (for format detection in fileFormatUtils)

**Depended on by**: Virtually every module in igv.js. Key consumers include:
- All track types (color scales, nucleotide colors, track utilities, paint axis)
- All feature readers/sources (buildOptions, file format detection, LRU cache)
- `js/browser.ts` (default options, igvUtils, viewport creation)
- `js/trackView.ts` and `js/trackViewport.ts` (viewport creation, downsampling)
- `js/ui/` components (color palettes, color picker palette)
- `js/genome/` (sequence utilities, bgzLineReader)
