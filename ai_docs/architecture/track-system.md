# Track System

## Track Type Hierarchy

All tracks inherit from `TrackBase` (`js/trackBase.ts`), which provides config merging, state serialization, and shared properties. Each track type specializes data loading and rendering.

### Built-in Track Types

| Type string | Class | Module | Description |
|-------------|-------|--------|-------------|
| `sequence` | SequenceTrack | js/sequenceTrack.ts | Reference genome sequence (A/C/G/T) |
| `ideogram` | IdeogramTrack | js/ideogramTrack.ts | Chromosome ideogram/karyotype band |
| `ruler` | RulerTrack | js/rulerTrack.ts | Coordinate ruler with tick marks |
| `feature` | FeatureTrack | js/feature/featureTrack.ts | Generic features (BED, GFF, GTF, GenBank) |
| `wig` | WigTrack | js/feature/wigTrack.ts | Quantitative data (BigWig, WIG, bedGraph) |
| `seg` | SegTrack | js/feature/segTrack.ts | Copy number segmentation (SEG, MAF, MUT) |
| `alignment` | BAMTrack | js/bam/bamTrack.ts | BAM/CRAM alignments (composite track) |
| `variant` | VariantTrack | js/variant/variantTrack.ts | VCF variants |
| `interaction` | InteractionTrack | js/feature/interactionTrack.ts | Chromatin interactions (BEDPE, interact) |
| `junction` | SpliceJunctionTrack | js/feature/spliceJunctionTrack.ts | RNA splice junctions |
| `merged` | MergedTrack | js/feature/mergedTrack.ts | Overlay of multiple tracks |
| `gwas` | GWASTrack | js/gwas/gwasTrack.ts | GWAS Manhattan plot |
| `qtl` / `eqtl` | QTLTrack | js/qtl/qtlTrack.ts | QTL/eQTL associations |
| `gcnv` | GCNVTrack | js/gcnv/gcnvTrack.ts | gCNV copy number predictions |
| `cnvpytor` | CNVPytorTrack | js/cnvpytor/cnvpytorTrack.ts | CNVpytor analysis results |
| `arc` | RnaStructTrack | js/rna/rnaStruct.ts | RNA secondary structure arcs |
| `blat` | BlatTrack | js/blat/blatTrack.ts | BLAT sequence search results |
| `shoebox` | ShoeboxTrack | js/shoebox/shoeboxTrack.ts | Shoebox/motif heatmaps |
| `image` | ImageTrack | js/ucsc/imageTrack.ts | Static image tiles (UCSC) |

### Type Aliases
The track factory (`js/trackFactory.ts`) maps alternative type names:
- `annotation`, `genes`, `fusionjuncspan`, `snp` → `feature`
- `maf`, `mut` → `seg`
- `junctions`, `splicejunctions` → `junction`
- `interact` → `interaction`
- `eqtl` → `qtl`

## TrackBase: Config Merging

Tracks are configured via a plain object. `TrackBase.init()` merges defaults in order:

```
1. TrackBase.defaults          {height: 50, autoHeight: false, ...}
2. Subclass.defaults           e.g., FeatureTrack.defaults = {displayMode: "COLLAPSED"}
3. User config                 The object passed to loadTrack()
```

Properties from config are copied directly onto the track instance:
```typescript
for (let key of Object.keys(defaults)) {
    this[key] = config.hasOwnProperty(key) ? config[key] : defaults[key]
}
```

This is why `TrackBase` and `Browser` use `[key: string]: any` — properties are dynamically set from config objects.

## TrackView: Visual Container

`TrackView` (`js/trackView.ts`) wraps a track with DOM elements:

```
┌─ TrackView ──────────────────────────────────────────────┐
│ ┌──────┐ ┌──────────────────────────────┐ ┌──────┐ ┌──┐│
│ │ Axis │ │     Viewport(s)              │ │Sample│ │Sc││
│ │      │ │ ┌────────────┬─────────────┐ │ │ Info │ │ro││
│ │ (data│ │ │  Column 1  │  Column 2   │ │ │      │ │ll││
│ │ range│ │ │ (chr1:...) │ (chr2:...) │ │ │      │ │  ││
│ │  y-  │ │ └────────────┴─────────────┘ │ └──────┘ └──┘│
│ │ axis)│ │   (one per referenceFrame)    │  ┌──┐ ┌──┐  │
│ └──────┘ └──────────────────────────────┘  │Dr│ │Ge│  │
│                                             │ag│ │ar│  │
│                                             └──┘ └──┘  │
└──────────────────────────────────────────────────────────┘
```

Key methods:
- `addDOMToColumnContainer()` — Creates all DOM elements
- `createViewports()` — Creates one viewport per reference frame column
- `updateViews()` — Triggers feature loading + repaint for all viewports
- `repaintViews()` — Repaints without reloading features
- `renderSVGContext()` — SVG export via Canvas2SVG
- `getInViewFeatures()` — Returns features currently visible (for autoscale)

## Track Factory

`js/trackFactory.ts` maps type strings to constructor functions:

```typescript
const trackFunctions = new Map<string, TrackCreator>([
    ['alignment', (config, browser) => new BAMTrack(config, browser)],
    ['variant',   (config, browser) => new VariantTrack(config, browser)],
    // ...
])
```

External code can register custom track types:
```typescript
igv.registerTrackClass("myType", MyTrackClass)
igv.registerTrackCreatorFunction("myType", (config, browser) => new MyTrack(config, browser))
```

## Composite Tracks

### BAMTrack
`BAMTrack` (`js/bam/bamTrack.ts`) is a composite that manages two sub-tracks:
- `CoverageTrack` — Shows read depth as a bar chart
- `AlignmentTrack` — Shows individual aligned reads

Both share a single `BamSource` but render separately within the same TrackView.

### MergedTrack
`MergedTrack` (`js/feature/mergedTrack.ts`) overlays multiple tracks in one view. Each child track renders onto the same canvas with transparency.

## Display Modes

Most feature tracks support three display modes:
- **COLLAPSED** — All features in a single row
- **SQUISHED** — Features packed tightly, small font
- **EXPANDED** — Features packed with more spacing, full labels

The `FeaturePacker` (`js/feature/featurePacker.ts`) assigns features to rows to minimize vertical space while avoiding overlaps.

## Track Menu System

Each track has a gear menu with configurable items. `TrackBase` provides default items; tracks override `menuItemList()` to add track-specific options.

Menu item types (defined in `js/types/ui.ts`):
- `MenuItem` — Click handler with label
- Checkbox items — Toggle display properties
- Separator — Visual divider (`<hr>`)
- DOM node — Custom HTML content

`MenuUtils` (`js/ui/menuUtils.ts`) provides standard menu item factories: color picker, data range, display mode selector, etc.

## Track Ordering

Tracks have an `order` property (numeric). Special tracks use reserved orders:
- Ideogram: internal (always top)
- Ruler: internal (below ideogram)
- Sequence: `defaultSequenceTrackOrder` (typically high number)

`Browser.reorderTracks()` sorts `trackViews` by `track.order` and reorders DOM elements accordingly.
