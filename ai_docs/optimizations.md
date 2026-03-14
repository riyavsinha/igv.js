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
