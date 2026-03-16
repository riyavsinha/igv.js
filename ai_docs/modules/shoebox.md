# Shoebox Module

## Purpose

The Shoebox module implements a specialized track type for visualizing multi-value genomic data as a heatmap, where each genomic interval contains an array of numeric values rendered as rows of colored cells. It is designed for data such as DNase footprinting scores, where each genomic position has values at multiple footprint sizes. The module provides a custom decoder for the "shoebox" BED-like format, a binned color scale with white-to-color interpolation, and a track class with configurable row height, data range, and axis labeling.

## Genomic Context

The Shoebox format represents data from genomic footprinting experiments, particularly DNase-seq footprinting analysis. In these experiments, each genomic interval is scored at multiple footprint sizes (radii), producing a 2D matrix of values: genomic position on the x-axis and footprint size on the y-axis. The data format is a BED-like tab-delimited file where columns 1-3 are chr/start/end and columns 4+ are numeric scores, one per footprint size. The track renders this as a heatmap where color intensity indicates the footprint score, with the y-axis representing footprint size (labeled in base pairs on a painted axis). This visualization helps researchers identify transcription factor binding sites and assess the protection patterns at different scales.

## Key Classes & Files

### `shoebox/decodeShoebox.ts`
A decoder function for parsing shoebox-format records from tab-delimited text. Takes an array of string tokens (from a split line) and returns a feature object:
- `chr`: Chromosome name (token 0)
- `start`: Start position as integer (token 1)
- `end`: End position as integer (token 2)
- `values`: Array of floating-point numbers parsed from tokens 3+ (one per footprint size row)
- Returns `undefined` if fewer than 4 tokens are present.
- Returns a `DecodeError` if start/end are not valid numbers.

The decoder is registered via the feature source system by setting `config.format = 'shoebox'` in the track's `init()` method.

### `shoebox/shoeboxColorScale.ts`
A binned color scale that maps numeric values to RGB color strings via linear interpolation between white and a configurable base color. Key behavior:
- **Binning**: Divides the min-max range into 1000 bins for efficient color caching. Colors are computed once per bin and cached as RGB strings.
- **Interpolation**: For a value `v`, computes `alpha = (v - min) / (max - min)` and blends between white `(255, 255, 255)` and the base color `(r, g, b)` using `rgb(alpha*r + beta*br, alpha*g + beta*bg, alpha*b + beta*bb)`.
- **Boundary handling**: Values at or below `min` return `"white"`; values at or above `max` return the solid base color.
- `updateColor(color)`: Parses an `rgb(r,g,b)` string and resets the cache.
- `setMinMax(min, max)`: Updates the range and resets the cache.
- `toJson()`: Serializes to `{ min, max, color }` for session persistence.
- `parse(str)` (static): Parses a legacy comma-separated string format `"min,max,r,g,b"`.

Default configuration: min=0, max=3000, color=`rgb(0,0,255)` (blue).

### `shoebox/shoeboxTrack.ts`
The main track class (extends `TrackBase`) for rendering shoebox heatmap data. Key aspects:

**Configuration defaults:**
- `height`: 300px
- `rowHeight`: 3px per data row
- `min`: 0.5, `max`: 3 (data range for color scale)
- `visibilityWindow`: 10,000 bp (hides data when zoomed out too far)
- `supportHiDPI`: false
- `startSize`: 4 (footprint size for first column, in bp)
- `stepSize`: 2 (step size per row in bp)

**Initialization (`init()` / `postInit()`):**
- Creates a `FeatureSource` with format forced to `'shoebox'`, which routes to the `decodeShoebox` decoder.
- After loading the header, determines `rowCount` from the first feature's values array length.
- Creates a `ShoeboxColorScale` from the configured data range and color.

**Rendering (`draw()`):**
- Clears the canvas and iterates over features.
- For each feature, iterates through `feature.values` array in reverse order (so larger footprint sizes are at the bottom).
- Colors each cell using `colorScale.getColor(value)`, skipping values below `dataRange.min`.
- Each cell occupies `rowHeight` pixels vertically and spans the feature's genomic interval horizontally.

**Axis painting (`paintAxis()`):**
- Draws tick marks at 50bp intervals along the y-axis.
- Labels show footprint size in base pairs, calculated as `startSize + (row * stepSize)`.
- Draws a rotated "Footprint size (bp)" label.

**Interactivity:**
- `computePixelHeight()`: Returns `values.length * rowHeight`, allowing the track to auto-size based on data.
- `menuItemList()`: Provides "Set row height" and "Set data range" dialogs.
- `setDataRange()`: Updates both `dataRange` and `colorScale`, then repaints.
- `popupData()` / `hoverText()`: Show feature information on click/hover.
- `getState()`: Serializes track state including color scale configuration.

## Data Flow

```
Shoebox BED-like file (tab-delimited)
    |
    v
FeatureSource (format='shoebox')
    |
    +-- decodeShoebox(tokens)
    |       +-- returns { chr, start, end, values: number[] }
    |
    v
ShoeboxTrack.getFeatures(chr, start, end, bpPerPixel)
    |
    +-- featureSource.getFeatures()
    |
    v
ShoeboxTrack.draw({ context, features, ... })
    |
    +-- For each feature:
    |       +-- Compute pixel x from (start - bpStart) / bpPerPixel
    |       +-- For each value (reverse order):
    |       |       +-- row = values.length - 1 - i
    |       |       +-- y = row * rowHeight
    |       |       +-- color = colorScale.getColor(value)
    |       |       +-- context.fillRect(x, y, width, rowHeight)
    |       v
    +-- ShoeboxTrack.paintAxis()
            +-- Draw footprint size tick marks and labels

Color pipeline:
    value -> ShoeboxColorScale.getColor(value)
           -> bin = floor((value - min) / binsize)
           -> alpha = (value - min) / (max - min)
           -> rgb(alpha*r + (1-alpha)*255, ...)
```

## Dependencies

### Depends On
- `js/trackBase.ts` -- `TrackBase` base class providing standard track lifecycle (`init()`, `postInit()`, config merging)
- `js/feature/featureSource.ts` -- `FeatureSource` factory for creating the data source with `format='shoebox'`
- `js/feature/decode/decodeError.ts` -- `DecodeError` class for reporting parse failures
- `js/igv-canvas.ts` -- `IGVGraphics` for canvas drawing (fill rect, stroke line, fill text)
- `js/browser.ts` -- `Browser` type for dialog access, track view management
- `js/types/config.ts` -- `TrackConfig` type
- `js/types/ui.ts` -- `ClickState` type
- `js/types/feature.ts` -- `GenomicFeature` type
- `igv-utils` -- `IGVMath` (imported in color scale but not actively used)

### Depended On By
- `js/trackFactory.ts` (or equivalent) -- Registers `'shoebox'` as a track type, routing to `ShoeboxTrack`
- `js/feature/decode/` -- The decode system routes `format='shoebox'` to the `decodeShoebox` function
