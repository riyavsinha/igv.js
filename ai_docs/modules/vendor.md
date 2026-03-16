# Vendor Module

## Purpose

The `js/vendor/` directory contains third-party libraries that are vendored (bundled directly) into the igv.js source tree rather than being installed as npm dependencies. These are small, specialized libraries that either had no suitable npm package at the time of inclusion, required modifications, or were bundled to avoid additional dependency management complexity.

## Vendored Libraries

### `detect-element-resize.js`

- **Source**: https://github.com/sdecima/javascript-detect-element-resize (v0.5.3)
- **What it does**: Provides cross-browser element resize detection by attaching invisible scrollable trigger elements to a target DOM element. When the element's dimensions change, scroll events fire on these triggers, which are caught by a debounced listener using `requestAnimationFrame`.
- **Why it's bundled**: The browser's native `ResizeObserver` API was not widely available when this library was integrated. It exposes two global functions -- `window.addResizeListener(element, fn)` and `window.removeResizeListener(element, fn)` -- that igv.js uses to respond when the browser container or individual track elements are resized by the user or by layout changes.
- **Key implementation detail**: Uses CSS animations as a secondary detection mechanism for elements that are hidden and then re-shown (display/re-attach detection). Falls back to IE's native `attachEvent('onresize')` for older browsers.

### `lm-esm.js`

- **Source**: https://github.com/mljs/levenberg-marquardt (rollup-web branch)
- **What it does**: Implements the **Levenberg-Marquardt** nonlinear least-squares curve fitting algorithm. Given a set of (x, y) data points and a parameterized function, it iteratively adjusts parameters to minimize the sum of squared residuals. Supports configurable damping, gradient difference calculation (forward or central), convergence tolerance, timeout, min/max parameter bounds, and weighted fitting.
- **Why it's bundled**: Used by the CNVPytor track module for fitting statistical distributions to read depth data. The library was converted to an ES module (ESM) format for direct import compatibility. No standard npm ESM build was available at the time of integration.
- **Key exports**: The main function accepts `{x, y}` data, a parameterized function, and options, returning fitted parameters and residual error.

### `rbtree.js`

- **Source**: https://github.com/vadimg/js_bintrees (MIT license)
- **What it does**: Implements a **Red-Black Tree** -- a self-balancing binary search tree that guarantees O(log n) insertion, deletion, and lookup. Provides methods for `insert`, `remove`, `find`, `findIter` (returns an iterator), `lowerBound`, `upperBound`, `min`, `max`, and in-order traversal via `forEach` and `reach` (reverse each).
- **Why it's bundled**: Used as the underlying data structure for the TDigest algorithm (see below). Red-black trees efficiently maintain sorted centroid data needed for quantile estimation. The library was adapted from the js_bintrees package for direct inclusion.

### `tdigest.js`

- **Source**: https://github.com/welch/tdigest (MIT license)
- **What it does**: Implements the **t-digest** algorithm for approximate quantile/percentile estimation from streaming data. It maintains a compressed representation of a distribution using weighted centroids stored in a red-black tree. Key capabilities:
  - Streaming ingestion of real values via `push(x)` or `push([x1, x2, ...])`
  - Configurable compression factor (`delta`) controlling accuracy vs. memory tradeoff
  - Automatic recompression when the number of centroids exceeds a threshold (`K`)
  - Quantile queries: `percentile(p)` returns the value at a given percentile
  - CDF queries: `p_rank(x)` returns the percentile rank of a value
- **Why it's bundled**: Used for computing quantile statistics on genomic data (e.g., read depth distributions in BAM/alignment tracks). The t-digest is particularly suited for this use case because it processes data in a single pass without needing to store all values in memory, which is critical when working with millions of reads.
- **Depends on**: `rbtree.js` (imported directly from the vendor directory)
