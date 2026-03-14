# Code Optimizations & Inefficiencies

Tracked during the TypeScript migration. Each item notes the file, what was suboptimal, and the fix applied.

---

## Bugs (fixed during migration)

### `js/util/downsample.ts` — `RAND.nextDouble()` undefined [FIXED]
The original code called `RAND.nextDouble()` which was never defined in scope. This would crash at runtime if the downsampling branch was hit. Fixed to `Math.random()`.

---

## Performance

### `js/util/colorScale.ts:55-61` — O(n²) color lookup in BinnedColorScale [FIXED]
`getColor` iterated thresholds with `for-of`, then called `this.thresholds.indexOf(threshold)` inside the loop to find the index. This was O(n²). Fixed to use an indexed `for` loop.

```js
// Before
for (let threshold of this.thresholds) {
    if (value < threshold) {
        return this.colors[this.thresholds.indexOf(threshold)]
    }
}

// After
for (let i = 0; i < this.thresholds.length; i++) {
    if (value < this.thresholds[i]) {
        return this.colors[i]
    }
}
```

### `js/util/igvUtils.ts:19-23` — Set created on every call [FIXED]
`isSimpleType` allocated a new `Set` of type strings on every invocation. Hoisted to module-level constant `SIMPLE_TYPES`.

```js
// Before
function isSimpleType(value) {
    const simpleTypes = new Set(["boolean", "number", "string", "symbol"])
    ...
}

// After
const SIMPLE_TYPES = new Set(["boolean", "number", "string", "symbol"])
function isSimpleType(value) { ... }
```

### `js/igv-canvas.ts:10-20,57` — unused debug logging with eager string concat [FIXED]
The `debug` flag was hardcoded to `false`, `log` was only called in one place (`strokeLine`), and `log("stroke line, prop: " + properties)` built the string regardless of whether `debug` was true. Removed the entire debug logging infrastructure (`debug`, `log`, and the call site).

### `js/util/deepCopy.ts:8-23` — `Object.keys()` on arrays [FIXED]
`cloneArray` called `Object.keys(a)` on an array, returning string indices, then indexed with those strings. Fixed to use a simple numeric `for` loop.

```js
// Before
function cloneArray(a, fn) {
    const keys = Object.keys(a)
    const a2 = new Array(keys.length)
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        const cur = a[k]
        ...
    }
}

// After
function cloneArray(a, fn) {
    const a2 = new Array(a.length)
    for (let i = 0; i < a.length; i++) {
        const cur = a[i]
        ...
    }
}
```

---

## Mutability / Correctness

### `js/util/fileFormats.ts:31-45` — `expandFormat` mutates stored format objects [FIXED]
`getFormat` called `expandFormat` which mutated the `FileFormats` entry in-place by writing `chr`, `start`, `end` index fields onto it. Repeated calls kept re-mutating the same object. Fixed to return a shallow copy instead of mutating the original.

### `js/util/igvUtils.ts:19-23` — `isSimpleType` duck-types with `.substring` / `.toFixed` [FIXED]
After checking `typeof`, the function also checked for `.substring` and `.toFixed` properties to catch boxed String/Number primitives. This duck-typing could give false positives on arbitrary objects. Fixed to use `instanceof String` / `instanceof Number` instead.

---

## Style / Modernization

### `js/intervalTree.ts` — free functions with `.call(this)` instead of class methods [FIXED]
`searchAll`, `leftRotate`, `rightRotate`, `applyUpdate`, and `treeInsert` were module-level functions that used `.call(this, ...)` to access the `IntervalTree` instance. Converted to private `#method()` class members. Also replaced `var` with `const`/`let` throughout.

### `js/util/colorPalletes.ts` — `RandomColorGenerator` uses prototype-based patterns [FIXED]
While the rest of the codebase uses ES6 classes, `RandomColorGenerator` was defined with old-style `function` constructor + `.prototype` method assignments. Converted to an ES6 class with proper typed method signatures. Also fixed the comma-operator expressions in `hsvToRgb` switch cases to use semicolons.

### `js/util/ucscUtils.ts:26,27` — uses deprecated `String.prototype.substr` [FIXED]
`parseAutoSQL` used `.substr()` which is deprecated. Replaced with `.substring()`.

---

## Unused Code

### `js/util/paintAxis.ts:4` — `diagnosticColor` defined but never used [FIXED]
The constant `diagnosticColor = "rgb(251,128,114)"` was declared but never referenced. Removed.

### `js/util/igvUtils.ts:4-10` — `extend` function (prototypal inheritance helper) [FIXED]
This was a pre-ES6 inheritance helper (`child.prototype = Object.create(parent.prototype)`). Confirmed no callers exist (only a different `extend` method on `Locus`/`ReferenceFrame` classes). Removed the function and its export.

---

## Phase 2 Bugs

### `js/ui/popover.ts` & `js/ui/menuPopup.ts` — `typeof item === 'Node'` always false [FIXED]
Both files used `typeof item === 'Node'` to check if a menu item was a DOM node. But `typeof` returns `'object'` for DOM nodes, never `'Node'`. This check was always false, meaning DOM node menu items were never handled correctly. Fixed to `item instanceof Node`.

### `js/ui/menuPopup.ts` — `dispose()` loses `this` context [FIXED]
The `dispose()` method used `Object.keys(this).forEach(function(key) { this[key] = undefined })`. The regular `function` keyword creates its own `this` binding, so `this` inside the callback was `undefined` (strict mode) or `window` — never the MenuPopup instance. Fixed to an arrow function to preserve `this`.

### `js/ui/circularViewControl.ts` — constructor-function pattern instead of ES6 class [FIXED]
Used old-style `function CircularViewControl(...)` with prototype method assignments, inconsistent with the rest of the codebase. Converted to an ES6 `class` with proper constructor and method declarations.

---

## Phase 1d Bugs

### `js/genome/cytoband.ts` — 4 unused imports [FIXED]
The file had imports for `igvUtils`, `igv-utils`, `BWReader`, and `Chromosome` — none of which were used. The file only defines the `Cytoband` class with no dependencies. Removed all 4 imports.

### `js/genome/chromSizes.ts:43` — `this.fastaURL` should be `this.url` [FIXED]
In `loadAll()`, the data URL branch referenced `this.fastaURL` which doesn't exist on the `ChromSizes` class. The class only has a `url` property. Fixed to `this.url`.

### `js/genome/chromSizes.ts:29-33` — `chromosomeNames` getter missing return statement [FIXED]
The `get chromosomeNames()` accessor computed `this.#chromosomeNames` but never returned it. Added `return this.#chromosomeNames`.

### `js/genome/chromSizes.ts:7` — unused `reservedProperties` constant [FIXED]
A `Set` of reserved property names was defined at module scope but never referenced. Removed.

---

## Phase 3 Bugs

### `js/bigwig/bbDecoders.ts:56` — variable shadowing bug in exon frames [FIXED]
Inner `for` loop reused `let i` variable from outer loop, shadowing the outer iteration variable. This meant the outer `i` (iterating autoSql fields) was overwritten by the inner exon iteration. Renamed inner variable to `j`.

### `js/bigwig/chromTree.ts:96` — incorrect `idToName` cache population [FIXED]
`searchForName()` had `this.idToName.set(id, itemId)` which stored a number as the value in a `Map<number, string>`. Should have been `this.idToName.set(itemId, key)` to correctly map chromosome ID → name. The cache was being populated with incorrect entries.

### `js/genome/cachedSequence.ts` — `#trimCache` called `interval.contains(i)` with wrong args [FIXED]
`GenomicInterval.contains()` expects 3 arguments `(chr, start, end)` but was being passed a single `SequenceInterval` object. The `start` and `end` params would be `undefined`, so the comparison always failed (cache never trimmed subsumed intervals). Fixed to use `interval.containsRange(i)`.

### `js/search.ts:182` — `extent` is undefined (ReferenceError) [FIXED]
`const delta = -extent.start` referenced an undeclared variable `extent`. Would throw `ReferenceError` at runtime if the code path was reached (negative coordinates with softclipping off). Fixed to `const delta = -locusObject.start`.

### `js/search.ts` — `String.replaceAll` not in ES2020 target [FIXED]
`string.replaceAll(' ', '+')` is not available in `ES2020` lib target. Changed to `string.replace(/ /g, '+')`.

### `js/genome/genome.ts` — `computeCumulativeOffsets` used `.call(this)` with private fields [FIXED]
A nested function used `.call(this, ...)` to access private `#wgChromosomeNames`. This is invalid in TypeScript (private fields are lexically scoped). Converted to a private class method `#computeCumulativeOffsets()`.

### `js/genome/genome.ts` — `var` in `getGenomeCoordinate` [FIXED]
Changed `var offset` to `const offset`.

---

## Phase 4 Bugs

### `js/bam/bamSource.ts` — `console.warning()` doesn't exist [FIXED]
Called `console.warning()` which is not a valid Console method. Would throw at runtime. Fixed to `console.warn()`.

### `js/feature/segParser.ts:203` — Bitwise `&` on booleans [FIXED]
Used `&` (bitwise AND) on boolean operands instead of `&&` (logical AND). The bitwise operator coerces booleans to 0/1 and returns a number, which is truthy for `1` — so the logic happened to work, but the intent was clearly logical AND. Fixed to `&&`.

### `js/bam/alignmentTrack.ts:541` — Bitwise `|` on booleans [FIXED]
Used `|` (bitwise OR) on boolean operands instead of `||` (logical OR). Same category as above — worked by accident since `1 | 0 = 1` is truthy, but intent was logical OR. Fixed to `||`.

### `js/feature/segTrack.ts:408` — Extra argument to `drawGroupDividers` [FIXED]
Called `drawGroupDividers` with 8 arguments but the function signature only accepts 7. The extra `GROUP_MARGIN_HEIGHT` argument was silently ignored by JavaScript. Removed the extra argument.

### `js/feature/textFeatureSource.ts` & `js/feature/staticFeatureSource.ts` — `replaceAll` not in ES2020 [FIXED]
Used `String.prototype.replaceAll()` which is only available in ES2021+, but the project targets ES2020. Fixed to `replace(/ /g, '+')`.

### `js/variant/vcfParser.ts:137` — ASI (Automatic Semicolon Insertion) issue [FIXED]
`new Variant(tokens)` on one line followed by `(variant as any).header = ...` on the next was parsed as a function call: `new Variant(tokens)(variant as any)`. Added semicolon after the `new` expression.

### `js/variant/variantTrack.ts:738` — Missing `position` in sort object [FIXED]
The sort object passed to `sortSamplesByGenotype` was missing the required `position` property. The function destructures `{chr, position, start, end, direction}` but the caller only provided `{direction, option, chr, start, end}`. Added `position: Math.floor(genomicLocation)`.

---

## Phase 5 Bugs

### `js/cnvpytor/MeanShiftUtil.ts` — Multiple Python→JS port bugs [FIXED]
This file was clearly ported from Python and retained many Python-isms:
- `elif` instead of `else if`
- `return start, end` (Python tuple return) → `return [start, end]`
- `Math.min[(...)]` bracket syntax → `Math.min(...)`
- `flags.fill(["d"] * ...)` Python list replication → `flags.fill("d", ...)`
- `var border_start, border_end = adj` Python tuple unpacking → `[border_start, border_end] = adj`
- 6x bitwise `&` on booleans → `&&`
- Wrong variable reference `levels[borders[ix + 1]]` → `chr_levels[borders[ix + 1]]`

### `js/cnvpytor/baseCNVpytorVCF.ts` — Comma operator returns null instead of array [FIXED]
`return [0, 0, 0], null` uses the comma operator, which evaluates both expressions but returns only the last (`null`). The array `[0, 0, 0]` is created and immediately discarded. Fixed to `return [0, 0, 0]`.

### `js/cnvpytor/HDF5IndexedReader.ts` — `.at(-1)` not in ES2020 [FIXED]
`Array.prototype.at()` is ES2022, but the project targets ES2020. Fixed to `arr[arr.length - 1]`.

### `js/shoebox/shoeboxTrack.ts` — Missing 2nd argument to `extractPopupData` [FIXED]
`this.extractPopupData(f)` was missing the required `genomeId` second argument. Fixed to `this.extractPopupData(f, this.browser.genome.id)`.

### `js/qtl/qtlSelections.ts` — `this.qtls` doesn't exist [FIXED]
`hasQTL()` referenced `this.qtls.has(qtl)` but the class only has a `qtl` property (singular), not `qtls`. Fixed to `this.qtl && this.qtl === qtl`.

### `js/ideogramTrack.ts` — `roundRect`/`polygon` called with numbers for boolean params [FIXED]
`IGVGraphics.roundRect(..., 0, 1)` and `IGVGraphics.polygon(..., 1, 0)` passed numbers where booleans were expected for fill/stroke parameters. Worked by coercion (0→false, 1→true) but was incorrect. Fixed to explicit `true`/`false`.

---

## Phase 3 Recommendations (not yet fixed)

### `js/genome/indexedFasta.ts` — `desPos` variable assigned but never read
In `readSequence()`, a variable `desPos` is incremented alongside `srcPos` but never used. Appears to be dead code from an older implementation.

### `js/genome/indexedFasta.ts` — uses deprecated `String.prototype.substr()`
Two instances of `.substr()` should be replaced with `.substring()`.

### `js/bigwig/bwReader.ts` — unused variables `extensionSize` and `fieldId` in `loadExtendedHeader`
Values read from binary parser but never used. Intentional to advance parser position, but could be replaced with explicit parser offset advancement.

### `js/genome/genome.ts` — `isDigit()` function appears unused
Defined but not called anywhere in the file. May be dead code.
