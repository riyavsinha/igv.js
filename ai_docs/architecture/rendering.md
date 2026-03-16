# Rendering System

## Overview

igv.js renders genomic data onto HTML5 Canvas elements. The same drawing code also supports SVG export via Canvas2SVG, a vendored library that implements the `CanvasRenderingContext2D` API but generates SVG elements.

## Canvas Architecture

### IGVGraphics (`js/igv-canvas.ts`)

Static utility module providing high-level drawing functions that wrap the Canvas2D API:

```typescript
IGVGraphics.fillRect(ctx, x, y, w, h, properties)
IGVGraphics.strokeLine(ctx, x1, y1, x2, y2, properties)
IGVGraphics.fillText(ctx, text, x, y, properties)
IGVGraphics.roundRect(ctx, x, y, w, h, radius, fill, stroke)
IGVGraphics.polygon(ctx, x, y, fill, stroke)
IGVGraphics.drawArrowhead(ctx, x, y, size, direction)
```

These functions accept a `properties` object for styling (color, font, lineWidth, etc.) and handle property setup/teardown via `ctx.save()` / `ctx.restore()`.

### HiDPI Support

igv.js supports high-DPI displays (Retina):
- Canvas elements are sized at `width * devicePixelRatio`
- Context is scaled: `ctx.scale(devicePixelRatio, devicePixelRatio)`
- CSS dimensions remain at logical pixel size
- Controlled by `track.supportHiDPI` (default: `true`)

### Offscreen Canvas Pattern

TrackViewport uses an offscreen rendering approach:
1. Create a canvas sized to the full content area (may be taller than viewport)
2. Render all features onto this canvas
3. Copy the visible portion to the on-screen canvas, offset by `contentTop` (scroll position)

This enables smooth scrolling for tracks with many features without re-rendering.

## Draw Configuration

Every track's `draw()` method receives a `DrawConfiguration` object:

```typescript
interface DrawConfiguration {
    context: CanvasRenderingContext2D  // Canvas or C2SContext
    features: unknown                  // Features from cache
    pixelWidth: number
    pixelHeight: number
    bpStart: number                    // Genomic start of visible area
    bpPerPixel: number                 // Zoom level
    bpEnd: number
    viewportWidth: number
    referenceFrame: ReferenceFrame     // Coordinate conversion
    genome: Genome                     // Reference genome
    selection?: Map                    // Selected features
    // Track-specific additions possible
}
```

Key property: `context` is typed as `CanvasRenderingContext2D` even though it may be a `C2SContext` for SVG export. This works because `C2SContext` is assignable to `CanvasRenderingContext2D`.

## SVG Export

### Canvas2SVG (`js/canvas2svg.ts`)

Vendored library (`@nicolo-ribaudo/canvas2svg`) that generates SVG by intercepting Canvas2D API calls. Marked `@ts-nocheck` since it's vendored third-party code.

Exported as `C2SContext` type = `CanvasRenderingContext2D & C2SVGExtensions`:
```typescript
interface C2SVGExtensions {
    saveWithTranslationAndClipRect(groupId, dx, dy, width, height): void
    setHeight(height: number): void
    getSerializedSvg(fixNamedEntities?: boolean): string
}
```

### SVG Export Flow

```
Browser.toSVG()
│
├── Create C2S context (full-height canvas)
│
├── For each TrackView:
│   TrackView.renderSVGContext(context, delta)
│   ├── context.saveWithTranslationAndClipRect(...)  // Clip to track bounds
│   ├── Render axis
│   ├── For each Viewport:
│   │   Viewport.renderSVGContext(context, delta)
│   │   ├── context.save() + translate
│   │   ├── track.draw({context, features, ...})      // Same draw() as canvas
│   │   └── context.restore()
│   ├── Render sample info/name viewports
│   └── context.restore()
│
├── Render ROI overlays
│
├── context.setHeight(actualHeight)                    // Trim unused space
│
└── context.getSerializedSvg(true)                     // Return SVG string
```

### PNG Export

PNG export goes through SVG first:
```
toSVG() → SVG string → Image element → Canvas drawImage → canvas.toDataURL("image/png")
```

## Track-Specific Rendering

### Feature Rendering (`js/feature/render/`)

- `renderFeature.ts` — Generic feature rendering (rectangles, labels, arrows for strand)
  - Gene/transcript rendering with exon/intron/UTR structure
  - Display mode handling (COLLAPSED/SQUISHED/EXPANDED)
  - Alternating colors for overlapping features

- `renderSnp.ts` — SNP marker rendering
  - Diamond shapes for SNP variants

- `renderFusionJunction.ts` — Fusion junction arc rendering

### Alignment Rendering (`js/bam/`)

`AlignmentTrack.draw()` renders aligned reads with:
- Colored blocks for matched regions
- Gap lines for deletions
- Insertions as purple markers
- Soft-clipped regions in different color
- Base modification overlays (methylation, etc.)
- Pair connectors for paired-end reads
- Squished/expanded modes

### Coverage Rendering (`js/bam/coverageTrack.ts`)

Bar chart of read depth:
- Gray bars for total coverage
- Colored mismatches above threshold
- Configurable data range (autoscale or fixed)

### WIG/Quantitative Rendering (`js/feature/wigTrack.ts`)

- Bar chart or line graph for numerical data
- Supports: bar, line, points, heatmap graph types
- Color by value (positive/negative colors)
- Autoscale or fixed data range

### Variant Rendering (`js/variant/variantTrack.ts`)

Multi-row display:
- Top row: variant markers (colored by type)
- Genotype rows: one per sample, colored by zygosity (het/hom-ref/hom-alt)

## ROI Overlay Rendering

Regions of interest are rendered as semi-transparent overlays on top of track content:
- `TrackROISet` (`js/roi/trackROISet.ts`) draws colored rectangles spanning the ROI region
- Rendered after track content but within the same canvas context
- Uses alpha blending for transparency

## Axis Painting

`paintAxis()` (`js/util/paintAxis.ts`) draws the Y-axis for quantitative tracks:
- Data range labels (min/max)
- Scale markers
- Drawn on the axis canvas column (left of viewport)

## Color System

### Color Scales (`js/util/colorScale.ts`)
- `BinnedColorScale` — Discrete bins with threshold values
- `GradientColorScale` — Continuous gradient between two colors
- `ColorTable` — Named color lookup table
- `GenericColorScale` — Configurable scale with low/mid/high colors

### Color Palettes (`js/util/colorPalletes.ts`)
- `colorPalettes` — Named palettes (Brewer, etc.)
- `RandomColorGenerator` — Deterministic pseudo-random colors from HSV
- `hexToRGB()` — Color format conversion

### Nucleotide Colors (`js/util/nucleotideColors.ts`)
Standard colors for DNA bases: A=green, C=blue, G=orange/yellow, T=red

### Chromosome Colors (`js/util/getChrColor.ts`)
Consistent colors per chromosome for whole-genome views
