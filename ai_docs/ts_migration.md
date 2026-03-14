# igv.js TypeScript Migration Plan

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Migration Strategy Overview](#2-migration-strategy-overview)
3. [Phase 0: Tooling & Infrastructure](#3-phase-0-tooling--infrastructure)
4. [Type System Design](#4-type-system-design)
5. [Phase 1: Utilities & Data Models](#5-phase-1-utilities--data-models)
6. [Phase 2: Canvas, UI Utilities & Components](#6-phase-2-canvas-ui-utilities--components)
7. [Phase 3: Genome, Sequence & Data Infrastructure](#7-phase-3-genome-sequence--data-infrastructure)
8. [Phase 4: Reader/Source Layer](#8-phase-4-readersource-layer)
9. [Phase 5: Track Classes](#9-phase-5-track-classes)
10. [Phase 6: Core Orchestration](#10-phase-6-core-orchestration)
11. [Phase 7: Strict Mode Escalation](#11-phase-7-strict-mode-escalation)
12. [Phase 8: Test Migration (Optional)](#12-phase-8-test-migration-optional)
13. [Handling Special Cases](#13-handling-special-cases)
14. [CI/CD Changes](#14-cicd-changes)
15. [Risk Assessment](#15-risk-assessment)
16. [Timeline Summary](#16-timeline-summary)

---

## 1. Current State Analysis

### Codebase Metrics

| Metric | Value |
|--------|-------|
| Source files | 275 `.js` files in `js/` |
| Total LOC | ~61,800 |
| Module system | ES6 modules (`import`/`export`) |
| Package type | `"type": "module"` in package.json |
| Build tool | Rollup 2.66.0 |
| Output formats | ESM, UMD, IIFE |
| Test framework | Mocha 11.1.0 (TDD) + Chai 4.3.7 |
| Existing TS support | Handwritten `js/igv.d.ts` (667 lines, public API only) |
| CI | GitHub Actions (Node 19) |
| Linting | ESLint 6.4.0 (many rules disabled) |
| Dependencies | All in devDependencies (0 production deps) |

### Directory Structure

```
js/
├── index.js              # Main entry point (public API exports)
├── browser.js            # Core Browser class (~2000+ LOC, 50+ imports)
├── trackBase.js          # Base class for all track types
├── trackFactory.js       # Track creation registry/factory
├── igv-create.js         # createBrowser(), removeBrowser() factory functions
├── igv-canvas.js         # Canvas graphics wrapper
├── events.js             # EventEmitter class
├── trackView.js          # Track viewport management
├── referenceFrame.js     # Genomic coordinate system
├── sequenceTrack.js      # DNA sequence display
├── ideogramTrack.js      # Chromosome ideogram
├── rulerTrack.js         # Genome ruler
├── bam/          (31 files)  # BAM/CRAM alignment handling
├── feature/      (28 files)  # Feature/annotation tracks, parsers, renderers
├── genome/       (21 files)  # Genome reference management
├── ui/           (60 files)  # UI components, dialogs, controls
├── util/         (21 files)  # Utility functions
├── bigwig/       (11 files)  # BigWig/BigBed format support
├── cnvpytor/      (8 files)  # CNVpytor format
├── roi/           (7 files)  # Region of Interest management
├── ucsc/          (7 files)  # UCSC hub integration
├── sample/        (7 files)  # Sample metadata display
├── variant/       (3 files)  # VCF variant handling
├── cram/          (3 files)  # CRAM file support
├── hic/           (3 files)  # Hi-C data
├── gwas/          (3 files)  # GWAS data
├── qtl/           (4 files)  # QTL tracks
├── vendor/        (4 files)  # Vendored third-party libraries
└── (other small modules: blat, gbk, htsget, tdf, aed, rna, shoebox, websocket, etc.)
```

### Key Architectural Patterns

**Class hierarchy:** All tracks extend `TrackBase`. `TrackBase.init(config)` dynamically copies
properties from a config object using `this.constructor.defaults` and `Object.keys()` iteration.

**Module pattern:** 100% ES6 modules. No mixed `require`/`import`. All imports use explicit
`.js` extensions (e.g., `import Foo from './foo.js'`).

**Configuration objects:** Deeply polymorphic — the valid properties on a track config depend
on its `type` field. Heavy use of `Object.assign`, spread, `config.hasOwnProperty()`.

**Event system:** Simple `EventEmitter` class with `on()`/`off()`/`emit()`.

**External dependency pattern:** `igv-utils` is imported directly from source via
`../node_modules/igv-utils/src/index.js` (used by ~95 files).

### What Already Exists for TypeScript

- `js/igv.d.ts` — 667 lines of handwritten type definitions for the **public API only**
  - Advanced conditional types: `TrackLoad<T>`, `TrackFormatOf<T>`, `CustomReaderOf<T>`
  - Discriminated unions for track configs
  - `BrowserEvents` namespace with typed event handlers
  - `Opaque<N>` utility type for branded types
- `dist/igv.d.ts` — copy of the above, published to npm
- `package.json` has `"types": "dist/igv.d.ts"`

---

## 2. Migration Strategy Overview

### Approach: Incremental, Leaf-First

The migration follows an **incremental, file-by-file** approach. Files are renamed from `.js` to
`.ts` one at a time (or in small batches), starting with leaf modules that have no internal
dependencies and working inward toward the core `Browser` class.

**Key principles:**
1. **The project compiles and tests pass after every single file migration.** No "big bang" phase.
2. **TypeScript is used for type-checking only.** Rollup remains the bundler. `tsc` runs with
   `noEmit: true`.
3. **Start with `strict: false`.** Strictness is escalated only after all files are `.ts`.
4. **The existing `igv.d.ts` remains the published API contract** until the migration is complete.
5. **Tests stay in JavaScript** during source migration. They are optionally migrated afterward.

### File Ordering Principle

```
Leaf utilities → Data models → Readers/Sources → Track classes → Core orchestration → Entry point
```

This ensures that when you migrate a file, everything it depends on is either:
- Already migrated to `.ts` (and thus fully typed), or
- Still `.js` but importable via `allowJs: true`

---

## 3. Phase 0: Tooling & Infrastructure

**Goal:** Set up TypeScript compilation, update the build pipeline, and add type-checking to CI
without changing any source files.

### 3.1 Install Dependencies

```bash
npm install --save-dev \
  typescript@rc \
  @rollup/plugin-typescript \
  tslib \
  --legacy-peer-deps
```

> **Note:** TypeScript 6.0 RC is used. The `--legacy-peer-deps` flag is needed because
> `@rollup/plugin-typescript` peer dep range hasn't been updated for TS 6.0 yet.
> **STATUS: DONE** — these are already installed.

### 3.2 Create `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    // Output target matching browserslist ("> 1%, not dead")
    "target": "ES2018",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],

    // Mixed JS/TS coexistence — the linchpin of incremental migration
    "allowJs": true,
    "checkJs": false,

    // TypeScript is used ONLY for type-checking; Rollup handles bundling
    "noEmit": true,

    // Start permissive — TS 6.0 defaults strict to true, override for migration
    "strict": false,
    "noImplicitAny": false,
    "strictNullChecks": false,

    // Module interop
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,

    // TS 6.0-specific: types defaults to [] and rootDir defaults to "."
    "types": [],
    "rootDir": "js"
  },
  "include": ["js/**/*"],
  "exclude": ["node_modules", "dist", "test", "js/vendor"]
}
```

**Why these choices:**
- `allowJs: true` lets `.ts` files import `.js` files seamlessly — the linchpin of incremental migration.
- `strict: false` overrides the TS 6.0 default of `true` to avoid thousands of errors on day one.
- `moduleResolution: "bundler"` is the TS 6.0 default and works well with Rollup.
- `types: []` is the TS 6.0 default — prevents auto-discovering `@types` packages.
- `rootDir: "js"` set explicitly since TS 6.0 changed the default from "inferred" to `"."`.
- `noEmit: true` because Rollup is the actual bundler. TypeScript only type-checks.
- `js/vendor/` is excluded — vendored third-party code is not migrated (see §13.2).

> **STATUS: DONE** — `tsconfig.json` is created and `tsc --noEmit` passes cleanly.

### 3.3 Update Rollup Config

The current `rollup.config.js` is minimal (strip + terser plugins). Add the TypeScript plugin:

```js
// rollup.config.js
import strip from '@rollup/plugin-strip'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'

export default [
  {
    input: 'js/index.js', // stays .js until Phase 6
    output: [
      { file: 'dist/igv.esm.js', format: 'es' },
      { file: 'dist/igv.esm.min.js', format: 'es', sourcemap: true, plugins: [terser()] }
    ],
    plugins: [
      typescript({ tsconfig: './tsconfig.json', noEmit: false, declaration: false, outDir: 'dist' }),
      strip({ debugger: true, functions: ['assert.*', 'debug'] })
    ]
  },
  {
    input: 'js/index.js',
    output: [
      { file: 'dist/igv.js', format: 'umd', name: 'igv' },
      { file: 'dist/igv.min.js', format: 'umd', name: 'igv', sourcemap: true, plugins: [terser()] }
    ],
    plugins: [
      typescript({ tsconfig: './tsconfig.json', noEmit: false, declaration: false, outDir: 'dist' }),
      strip({ debugger: true, functions: ['assert.*', 'debug'] })
    ]
  }
]
```

The TypeScript plugin handles `.ts` → `.js` transpilation inline during the Rollup build. The
`declaration: false` override means Rollup doesn't generate `.d.ts` files (the handwritten one
is still used).

Apply the same changes to `rollup.config.iife.js`.

> **STATUS: DONE** — both Rollup configs updated and `npm run build` produces correct outputs.

### 3.4 Update ESLint

The current ESLint 6.4.0 is too old for TypeScript support. Upgrade:

```bash
npm install --save-dev \
  eslint@^9 \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin \
  globals
```

Create `eslint.config.mjs` (flat config format):

```js
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import globals from 'globals'

export default [
  // JS files — preserve existing relaxed rules
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node }
    },
    rules: {
      'no-unused-vars': 'off',
      'no-prototype-builtins': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-cond-assign': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
      'require-atomic-updates': 'off',
      'no-inner-declarations': 'off'
    }
  },
  // TS files — stricter rules
  {
    files: ['js/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: './tsconfig.json' }
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  }
]
```

Remove the old `.eslintrc.json` once the new config is verified.

> **STATUS: DONE** — ESLint 9 with flat config is set up. The JS rule set disables all rules that
> ESLint 9's `recommended` config added since v6 (e.g., `no-fallthrough`, `no-case-declarations`,
> `no-unused-private-class-members`). `.d.ts` and `vendor/` files are globally ignored.
> Old `.eslintrc.json` has been removed. `npm run lint` passes with 0 errors.

### 3.5 Add package.json Scripts

```jsonc
{
  "scripts": {
    // ...existing scripts...
    "typecheck": "tsc --noEmit",
    "lint": "eslint js/"
  }
}
```

### 3.6 Configure Test Runner for TS Imports

Install `tsx` for transparent `.ts` loading in Mocha:

```bash
npm install --save-dev tsx
```

Create/update `.mocharc.yml`:

```yaml
ui: tdd
node-option:
  - import=tsx
spec: "test/*.{js,ts}"
```

This lets test files (which stay `.js`) import source files regardless of whether they are `.js`
or `.ts`. Note: `--import=tsx` is used instead of `--loader` (deprecated in Node v20.6+).
The spec uses `test/*.{js,ts}` (non-recursive) to match the original behavior and avoid
broken files in `test/old/`.

> **STATUS: DONE** — Mocha configured, all 245 tests pass. `test` script updated to just `mocha`
> (options are in `.mocharc.yml`).

### 3.7 Import Path Convention

When a file is renamed from `foo.js` to `foo.ts`, all files that import it need their import
paths updated. The convention:

- **In `.ts` files:** Use extensionless imports: `import Foo from './foo'`
- **In `.js` files that haven't been migrated yet:** The `tsx` loader and Rollup TypeScript
  plugin both resolve `.ts` files from `.js` import paths, but it's safest to update the
  extension to `.ts` or drop it entirely.

**Recommendation:** When migrating each file, also update imports in all files that reference it.
Use a script to automate this:

```bash
# Example: rename foo.js → foo.ts and update all importers
find js/ test/ -name '*.js' -o -name '*.ts' | xargs sed -i '' "s|from '\(.*\)/foo\.js'|from '\1/foo'|g"
```

---

## 4. Type System Design

This section defines the core TypeScript types to be created during migration. These types
live in a new `js/types/` directory and are imported by source files as they are migrated.

### 4.1 Core Interfaces

```typescript
// js/types/config.ts

/** Base configuration shared by all track types */
export interface TrackConfig {
  type?: string
  format?: string
  url?: string | File | Promise<string> | (() => string | Promise<string>)
  indexURL?: string | Promise<string>
  name?: string
  label?: string
  height?: number
  autoHeight?: boolean
  minHeight?: number
  maxHeight?: number
  visibilityWindow?: number | string
  color?: string | ((feature: GenomicFeature) => string)
  altColor?: string
  displayMode?: string
  order?: number
  removable?: boolean
  headers?: Record<string, string>
  oauthToken?: string | (() => string | Promise<string>)
  sourceType?: string
  filename?: string
  roi?: ROIConfig[]
  onclick?: (feature: GenomicFeature) => void
  description?: string | (() => string)
  // Allow arbitrary additional properties for backward compatibility
  [key: string]: unknown
}

/** Browser creation options */
export interface BrowserConfig {
  genome?: string | ReferenceGenome
  reference?: string | ReferenceGenome
  locus?: string | string[]
  tracks?: TrackConfig[]
  sessionURL?: string
  showNavigation?: boolean
  showControls?: boolean
  showRuler?: boolean
  showCenterGuide?: boolean
  showCursorTrackingGuide?: boolean
  showSampleNames?: boolean
  flanking?: number
  roi?: ROIConfig[]
  search?: SearchConfig
  nucleotideColors?: Partial<Record<string, string>>
  // ... remaining fields from defaultOptions.js
  [key: string]: unknown
}
```

### 4.2 Track Config Discriminated Unions

For internal use, define per-track config interfaces. These parallel and eventually replace the
types in `igv.d.ts`:

```typescript
// js/types/tracks.ts

export interface FeatureTrackConfig extends TrackConfig {
  type?: 'annotation' | 'feature' | 'genes'
  displayMode?: 'EXPANDED' | 'SQUISHED' | 'COLLAPSED'
  maxRows?: number
  searchable?: boolean
  searchableFields?: string[]
  nameField?: string
  filterTypes?: string[]
  colorBy?: string
  colorTable?: Record<string, string>
}

export interface AlignmentTrackConfig extends TrackConfig {
  type?: 'alignment'
  showCoverage?: boolean
  showAlignments?: boolean
  viewAsPairs?: boolean
  samplingDepth?: number
  samplingWindowSize?: number
  colorBy?: string
  groupBy?: string
  filter?: AlignmentFilter
  showSoftClips?: boolean
  showMismatches?: boolean
  showAllBases?: boolean
}

export interface WigTrackConfig extends TrackConfig {
  type?: 'wig'
  autoscale?: boolean
  autoscaleGroup?: string
  min?: number
  max?: number
  graphType?: 'points' | 'bar' | 'line' | 'heatmap' | 'dynseq'
  flipAxis?: boolean
  windowFunction?: 'mean' | 'max' | 'min'
}

// ... similar for VariantTrackConfig, SegTrackConfig, GWASTrackConfig,
//     InteractionTrackConfig, QTLTrackConfig, etc.
```

### 4.3 Genomic Feature Types

Features in igv.js are generic objects with dynamic attribute access. Define a permissive base
interface:

```typescript
// js/types/feature.ts

export interface GenomicFeature {
  chr: string
  start: number
  end: number
  name?: string
  score?: number
  strand?: '+' | '-' | '.'
  color?: string
  cdStart?: number
  cdEnd?: number
  exons?: Exon[]
  getAttributeValue?(name: string): string | number | undefined
  popupData?(genomicLocation: number): PopupDataItem[]
  // Dynamic attributes from format-specific fields
  [key: string]: unknown
}

export interface PopupDataItem {
  name: string
  value: string | number
}

export interface Exon {
  start: number
  end: number
  cdStart?: number
  cdEnd?: number
  utr?: boolean
}
```

### 4.4 Reader/Source Interfaces

Define interfaces for the duck-typed reader/source patterns:

```typescript
// js/types/reader.ts

export interface FeatureReader {
  readFeatures(chr: string, start: number, end: number): Promise<GenomicFeature[]>
  readHeader?(): Promise<unknown>
}

export interface AlignmentReader {
  readAlignments(chr: string, start: number, end: number): Promise<AlignmentContainer>
  readHeader?(): Promise<unknown>
}

export interface FeatureSource {
  getFeatures(options: FeatureQueryOptions): Promise<GenomicFeature[]>
  supportsWholeGenome?(): boolean
  trackType?: string
}

export interface FeatureQueryOptions {
  chr: string
  start: number
  end: number
  bpPerPixel?: number
  visibilityWindow?: number
}
```

### 4.5 Event System Types

```typescript
// js/types/events.ts

export interface BrowserEventMap {
  'trackremoved': [track: Track[]]
  'locuschange': [loci: LocusInfo[]]
  'trackclick': [track: Track, popoverData?: PopupDataItem[], genomicLocation?: number]
  'trackorderchanged': [trackNames: string[]]
  'trackdrag': []
  'trackdragend': []
  'zoom': []
  'roiadded': [roi: { chr: string; start: number; end: number; name?: string }]
  'roiremoved': [roi: { chr: string; start: number; end: number; name?: string }]
}
```

### 4.6 Typing the `TrackBase.init()` Config Merge Pattern

The `TrackBase.init(config)` method dynamically copies properties from config and
`this.constructor.defaults`. This is the hardest pattern to type. Strategy:

```typescript
// In TrackBase.ts
class TrackBase {
  static defaults: Record<string, unknown> = {
    height: 50,
    autoHeight: false,
    visibilityWindow: undefined,
    color: undefined,
    altColor: undefined,
    supportHiDPI: true,
    selected: false
  }

  config: TrackConfig
  browser: Browser
  height: number
  color?: string
  altColor?: string
  name?: string
  // ... declare all properties that come from defaults

  constructor(config: TrackConfig, browser: Browser) {
    this.browser = browser
    this.init(config)
  }

  init(config: TrackConfig): void {
    this.config = config

    const defaults: Record<string, unknown> = { ...TrackBase.defaults }

    // Access subclass defaults via constructor
    const ctor = this.constructor as typeof TrackBase
    if (ctor.defaults) {
      Object.assign(defaults, ctor.defaults)
    }

    for (const key of Object.keys(defaults)) {
      ;(this as Record<string, unknown>)[key] =
        Object.prototype.hasOwnProperty.call(config, key) ? config[key] : defaults[key]
    }

    // ... remaining init logic
  }
}
```

The `(this as Record<string, unknown>)[key]` cast is intentional — this pattern is inherently
dynamic and fighting it with pure types would add complexity without benefit.

---

## 5. Phase 1: Utilities & Data Models

**~35 files, ~5,000 LOC**

Start with files that have zero or minimal internal dependencies. These are the "leaves" of the
dependency tree.

### Subphase 1a: Zero-dependency files

| File | LOC | Notes |
|------|-----|-------|
| `js/version.js` | 1 | Single constant export |
| `js/events.js` | ~60 | Standalone EventEmitter class |
| `js/locus.js` | ~50 | Locus parsing utilities |
| `js/binary.js` | ~80 | Binary data utilities |

### Subphase 1b: Pure utility functions

| File | Notes |
|------|-------|
| `js/util/nucleotideColors.js` | Color mapping constants |
| `js/util/sequenceUtils.js` | Sequence manipulation |
| `js/util/deepCopy.js` | Deep cloning utility |
| `js/util/colorPalletes.js` | Color palette definitions |
| `js/util/colorScale.js` | Color scale class |
| `js/util/getChrColor.js` | Chromosome color lookup |
| `js/util/lruCache.js` | LRU cache data structure |
| `js/util/downsample.js` | Downsampling algorithm |
| `js/util/bufferUtils.js` | ArrayBuffer utilities |
| `js/util/translationDict.js` | Amino acid translation table |

### Subphase 1c: Utility files with cross-dependencies

| File | Notes |
|------|-------|
| `js/util/defaultOptions.js` | Default browser config values |
| `js/util/fileFormats.js` | File format registry |
| `js/util/fileFormatUtils.js` | Format detection utilities |
| `js/util/trackUtils.js` | Track-specific helpers |
| `js/util/igvUtils.js` | Core utility functions |
| `js/util/ucscUtils.js` | UCSC-specific utilities |
| `js/util/sessionResourceValidator.js` | Session validation |
| `js/util/bgzLineReader.js` | BGZF line reader |
| `js/util/paintAxis.js` | Axis painting helper |
| `js/util/viewportUtils.js` | Viewport utilities |
| `js/util/trackClassRegistry.js` | Track class registry (Map-based) |

### Subphase 1d: Genome data models

| File | Notes |
|------|-------|
| `js/genome/chromosome.js` | Chromosome data class |
| `js/genome/genomicInterval.js` | Genomic interval representation |
| `js/genome/chromAliasDefaults.js` | Default chromosome aliases |
| `js/genome/chromAliasFile.js` | Alias file parser |
| `js/genome/chromAliasBB.js` | BigBed alias source |
| `js/genome/cytobandFile.js` | Cytoband file parser |
| `js/genome/cytobandFileBB.js` | BigBed cytoband source |
| `js/genome/chromSizes.js` | Chromosome sizes |
| `js/genome/cytoband.js` | Cytoband data model |
| `js/genome/sequenceInterval.js` | Cached sequence interval |

### Subphase 1e: Create `js/types/` directory

During this phase, create the foundational type files:
- `js/types/config.ts`
- `js/types/feature.ts`
- `js/types/reader.ts`
- `js/types/events.ts`
- `js/types/tracks.ts`
- `js/types/genome.ts`

### Migration Steps for Each File

For each file in this phase:

1. **Rename** `foo.js` → `foo.ts`
2. **Add type annotations** to function parameters and return types
3. **Add explicit types** for class properties (declare them at the top of the class body)
4. **Update import paths** in all files that import this module
5. **Run `npm run typecheck`** — must pass with no errors
6. **Run `npm test`** — must pass

---

## 6. Phase 2: Canvas, UI Utilities & Components

**~25 files, ~4,000 LOC**

### Subphase 2a: Graphics utilities

| File | Notes |
|------|-------|
| `js/igv-canvas.js` | Canvas 2D drawing wrapper (IGVGraphics) |
| `js/canvas2svg.js` | SVG export from canvas commands |
| `js/igv-icons.js` | Icon SVG generation |

### Subphase 2b: UI utility functions

| File | Notes |
|------|-------|
| `js/ui/utils/dom-utils.js` | DOM manipulation helpers |
| `js/ui/utils/icons.js` | Icon utilities |
| All files in `js/ui/navbarIcons/` | Navigation bar icon components |

### Subphase 2c: UI components (leaf components)

All files in `js/ui/components/`:

| File | Notes |
|------|-------|
| `alertDialog.js` | Alert/error dialog |
| `checkbox.js` | Checkbox component |
| `colorScaleEditor.js` | Color scale editor UI |
| `dataRangeDialog.js` | Data range input dialog |
| `dialog.js` | Generic modal dialog |
| `genericColorPicker.js` | Color picker wrapper |
| `genericContainer.js` | Container component |
| `inputDialog.js` | Text input dialog |
| `panel.js` | Panel component |
| `segFilterDialog.js` | Segmentation filter dialog |
| `sliderDialog.js` | Slider input dialog |
| `table.js` | Table component |
| `textbox.js` | Text display component |

### Subphase 2d: Higher-level UI

| File | Notes |
|------|-------|
| `js/ui/alert.js` | Alert system |
| `js/ui/popover.js` | Popover/tooltip system |
| `js/ui/menuPopup.js` | Context menu |
| `js/ui/menuUtils.js` | Menu construction helpers |
| `js/ui/dropdown.js` | Dropdown component |
| Remaining `js/ui/*.js` files | Various UI components |

### Typing Considerations for UI Code

UI code involves heavy DOM manipulation. Key patterns to type:

```typescript
// DOM element creation — common pattern in igv.js UI code
function createEl(tag: string, parent?: HTMLElement, className?: string): HTMLElement {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (parent) parent.appendChild(el)
  return el
}

// Event handler callbacks
type MenuItemConfig = {
  label: string
  click: (e: MouseEvent) => void
  init?: () => HTMLElement
}
```

---

## 7. Phase 3: Genome, Sequence & Data Infrastructure

**~25 files, ~6,000 LOC**

### Subphase 3a: Sequence readers

| File | Notes |
|------|-------|
| `js/genome/indexedFasta.js` | Indexed FASTA reader |
| `js/genome/nonIndexedFasta.js` | Non-indexed FASTA reader |
| `js/genome/loadSequence.js` | Sequence loading factory |
| `js/genome/twobit.js` | 2bit format reader |
| `js/genome/cachedSequence.js` | Sequence caching layer |

### Subphase 3b: Genome utility files

| File | Notes |
|------|-------|
| `js/genome/hgvs.js` | HGVS notation support |
| `js/genome/clinVar.js` | ClinVar integration |
| `js/genome/updateReference.js` | Reference genome updates |

### Subphase 3c: Core Genome class

| File | Notes |
|------|-------|
| `js/genome/genome.js` | Core Genome class (depends on all genome/ files) |
| `js/genome/genomeUtils.js` | Genome utility functions |

### Subphase 3d: Navigation infrastructure

| File | Notes |
|------|-------|
| `js/referenceFrame.js` | Genomic coordinate ↔ pixel mapping |
| `js/intervalTree.js` | Interval tree data structure |
| `js/search.js` | Feature search by name/locus |
| `js/searchFeatures.js` | Feature search helpers |

### Subphase 3e: BigWig/BigBed data access

All 11 files in `js/bigwig/`:

| File | Notes |
|------|-------|
| `bwReader.js` | BigWig/BigBed file reader |
| `bwSource.js` | BigWig data source |
| `bpTree.js` | B+ tree index |
| `rpTree.js` | R tree index |
| `chromTree.js` | Chromosome tree |
| `bbDecoders.js` | BigBed field decoders |
| `bufferedReader.js` | Buffered binary reader |
| `trix.js` | TRIX text index |
| etc. | |

---

## 8. Phase 4: Reader/Source Layer

**~40 files, ~15,000 LOC**

This is the largest phase. These files implement data access for all supported file formats.

### Subphase 4a: BAM index infrastructure

| File | Notes |
|------|-------|
| `js/bam/bamIndex.js` | BAI index parsing |
| `js/bam/csiIndex.js` | CSI index parsing |
| `js/bam/indexFactory.js` | Index creation factory |
| `js/bam/indexUtils.js` | Index utility functions |
| `js/bam/bgzBlockLoader.js` | BGZF block loading |

### Subphase 4b: BAM data models

| File | Notes |
|------|-------|
| `js/bam/bamAlignment.js` | Single alignment record |
| `js/bam/alignmentBlock.js` | Alignment block (CIGAR operation) |
| `js/bam/pairedAlignment.js` | Paired-end alignment |
| `js/bam/supplementaryAlignment.js` | Supplementary alignment |
| `js/bam/bamAlignmentRow.js` | Packed alignment row |
| `js/bam/alignmentContainer.js` | Container for alignments + coverage |
| `js/bam/packedAlignments.js` | Packed alignment layout |
| `js/bam/bamFilter.js` | Alignment filtering |
| `js/bam/orientationTypes.js` | Pair orientation constants |
| `js/bam/pairedEndStats.js` | Insert size statistics |

### Subphase 4c: BAM readers

| File | Notes |
|------|-------|
| `js/bam/bamReader.js` | Standard BAM reader |
| `js/bam/bamReaderNonIndexed.js` | Non-indexed BAM reader |
| `js/bam/shardedBamReader.js` | Sharded BAM reader |
| `js/bam/bamWebserviceReader.js` | BAM web service reader |
| `js/bam/bamUtils.js` | BAM utility functions |
| `js/bam/bamSource.js` | BAM data source |

### Subphase 4d: Base modifications

All files in `js/bam/mods/`:

| File | Notes |
|------|-------|
| `baseModificationCounts.js` | Modification counting |
| `baseModificationColors.js` | Modification color mapping |
| `baseModificationKey.js` | Modification key types |
| `baseModifications.js` | Modification parsing |

### Subphase 4e: Feature parsing infrastructure

| File | Notes |
|------|-------|
| `js/feature/featureParser.js` | Generic feature parser |
| `js/feature/featureFileReader.js` | Feature file reader |
| `js/feature/featureCache.js` | Feature caching |
| `js/feature/featurePacker.js` | Feature row packing |
| `js/feature/featureUtils.js` | Feature utilities |
| `js/feature/exonUtils.js` | Exon manipulation |

### Subphase 4f: Decoders and GFF

All files in `js/feature/decode/` and `js/feature/gff/`.

### Subphase 4g: Feature sources

| File | Notes |
|------|-------|
| `js/feature/featureSource.js` | Main feature source |
| `js/feature/textFeatureSource.js` | Text file source |
| `js/feature/staticFeatureSource.js` | In-memory feature source |
| `js/feature/listFeatureSource.js` | Feature list source |
| `js/feature/baseFeatureSource.js` | Base source class |
| `js/feature/customServiceReader.js` | Custom API reader |
| `js/feature/ucscServiceReader.js` | UCSC API reader |
| `js/feature/dataWrapper.js` | Data wrapping utility |
| `js/feature/tribble.js` | Tribble index reader |

### Subphase 4h: Variant support

| File | Notes |
|------|-------|
| `js/variant/variant.js` | Variant data model |
| `js/variant/vcfParser.js` | VCF file parser |

### Subphase 4i: Remaining format support

| Module | Files | Notes |
|--------|-------|-------|
| `js/cram/` | 3 files | CRAM reader (wraps @gmod/cram) |
| `js/htsget/` | 3 files | htsget protocol |
| `js/tdf/` | 2 files | TDF format |
| `js/hic/` | 3 files | Hi-C data |
| `js/gbk/` | 3 files | GenBank format |
| `js/aed/` | 1 file | AED format |

---

## 9. Phase 5: Track Classes

**~20 files + renderers, ~12,000 LOC**

### Subphase 5a: TrackBase

`js/trackBase.js` is the single most critical file. All 15+ track types extend it.

Key typing challenges:
- Dynamic property assignment in `init()` from config + defaults
- `this.constructor.defaults` pattern (typed as `static defaults` on each subclass)
- Color function callbacks: `color` can be string or function

See §4.6 for the typing approach.

### Subphase 5b: FeatureTrack and renderers

| File | Notes |
|------|-------|
| `js/feature/featureTrack.js` | Main annotation/feature track |
| `js/feature/render/renderFeature.js` | Feature rendering |
| `js/feature/render/renderSnp.js` | SNP rendering |
| `js/feature/render/renderFusionJunction.js` | Fusion junction rendering |

### Subphase 5c: Other feature-based tracks

| File | Notes |
|------|-------|
| `js/feature/wigTrack.js` | Quantitative data track |
| `js/feature/segTrack.js` | Segmentation track |
| `js/feature/segParser.js` | SEG file parser |
| `js/feature/spliceJunctionTrack.js` | RNA-seq junction track |
| `js/feature/interactionTrack.js` | Long-range interaction track |
| `js/feature/mergedTrack.js` | Multi-track overlay |

### Subphase 5d: Alignment tracks

| File | Notes |
|------|-------|
| `js/bam/bamTrack.js` | BAM track (composite: coverage + alignments) |
| `js/bam/alignmentTrack.js` | Alignment rendering track |
| `js/bam/coverageTrack.js` | Coverage histogram track |

### Subphase 5e: Specialized tracks

| File | Notes |
|------|-------|
| `js/variant/variantTrack.js` | VCF variant track |
| `js/gwas/gwasTrack.js` | GWAS Manhattan plot |
| `js/gwas/gwasParser.js` | GWAS data parser |
| `js/gwas/gwasColors.js` | GWAS color scheme |
| `js/qtl/qtlTrack.js` | QTL track |
| `js/qtl/qtlParser.js` | QTL data parser |
| `js/qtl/qtlSelections.js` | QTL selection handling |
| `js/qtl/gtexReader.js` | GTEx web service reader |

### Subphase 5f: Remaining specialized tracks

| Module | Notes |
|--------|-------|
| `js/cnvpytor/*.js` (8 files) | CNVpytor track + utilities |
| `js/gcnv/*.js` (2 files) | gCNV track |
| `js/rna/*.js` (1 file) | RNA-specific track |
| `js/shoebox/*.js` (3 files) | Shoebox format |
| `js/blat/*.js` (3 files) | BLAT interface |

### Subphase 5g: Built-in browser tracks

| File | Notes |
|------|-------|
| `js/sequenceTrack.js` | DNA sequence display |
| `js/ideogramTrack.js` | Chromosome ideogram |
| `js/rulerTrack.js` | Genome coordinate ruler |

---

## 10. Phase 6: Core Orchestration

**~20 files, ~15,000 LOC**

### Subphase 6a: Track factory and registry

| File | Notes |
|------|-------|
| `js/trackFactory.js` | Track creation factory (Map-based registry) |
| `js/util/trackClassRegistry.js` | Runtime track class registry |

The factory maps string type names to track constructor functions. Type with a generic registry:

```typescript
type TrackConstructor = new (config: TrackConfig, browser: Browser) => TrackBase

const trackFunctions = new Map<string, TrackConstructor | ((config: TrackConfig, browser: Browser) => TrackBase)>()
```

### Subphase 6b: Viewport management

| File | Notes |
|------|-------|
| `js/trackView.js` | Track view (container for track + viewport) |
| `js/trackViewport.js` | Feature track viewport |
| `js/viewport.js` | Base viewport class |
| `js/viewportColumnManager.js` | Multi-locus column management |

### Subphase 6c: Specialized viewports

| File | Notes |
|------|-------|
| `js/ideogramViewport.js` | Ideogram viewport |
| `js/rulerViewport.js` | Ruler viewport |
| `js/rulerSweeper.js` | Ruler drag selection |
| `js/windowSizePanel.js` | Window size display |

### Subphase 6d: Navigation and UI controls

| File | Notes |
|------|-------|
| `js/responsiveNavbar.js` | Responsive navigation bar |
| `js/ui/cursorGuide.js` | Cursor tracking guide |
| `js/ui/viewportCenterLine.js` | Center line indicator |
| `js/ui/circularViewControl.js` | Circular view toggle |
| Remaining `js/ui/` files | Various UI controls |

### Subphase 6e: ROI and sample management

| Module | Notes |
|--------|-------|
| `js/roi/*.js` (7 files) | Region of Interest manager, sets, menus |
| `js/sample/*.js` (7 files) | Sample info, viewports, name display |

### Subphase 6f: Integration modules

| Module | Notes |
|--------|-------|
| `js/session/*.js` | Session save/load |
| `js/ucsc/*.js` | UCSC track hub integration |
| `js/jbrowse/*.js` | JBrowse compatibility |
| `js/websocket/*.js` | WebSocket client |

### Subphase 6g: Browser class

`js/browser.js` is the last major source file to migrate. It is the central orchestrator with
50+ imports and ~2,000+ LOC. Key typing areas:

- Constructor: accepts `BrowserConfig`, creates DOM elements, initializes subsystems
- Track management: `loadTrack()`, `removeTrack()`, `findTracks()`
- Navigation: `search()`, `zoomIn()`, `zoomOut()`, `goto()`
- Session: `toJSON()`, `loadSession()`, `compressedSession()`
- Events: typed event emitter methods
- State: `this.genome`, `this.trackViews`, `this.referenceFrameList`

### Subphase 6h: Entry points

| File | Notes |
|------|-------|
| `js/igv-create.js` | `createBrowser()`, `removeBrowser()`, module-level `allBrowsers` array |
| `js/index.js` | Public API surface — the default export object |

When `index.js` is migrated to `index.ts`, the Rollup input path must be updated to
`js/index.ts`.

---

## 11. Phase 7: Strict Mode Escalation

**After all 275 files are `.ts`.**

### Step 1: Enable `noImplicitAny`

Update `tsconfig.json`:
```jsonc
{
  "compilerOptions": {
    "noImplicitAny": true
  }
}
```

**Expected:** 500-1,500 errors. Most will be function parameters missing type annotations in
code that was converted with `any` placeholders. Fix systematically by directory:
1. `js/util/` — smallest, most self-contained
2. `js/genome/` — well-defined data types
3. `js/bam/` — complex but has clear domain types
4. `js/feature/` — many dynamic patterns
5. `js/ui/` — DOM-heavy, use `HTMLElement` types
6. Core files last

### Step 2: Enable `strictNullChecks`

```jsonc
{
  "compilerOptions": {
    "strictNullChecks": true
  }
}
```

**Expected:** 1,000-2,000 errors. Common fixes:
- Add `| undefined` to optional property types
- Add null guards before accessing potentially-null values
- Use optional chaining (`?.`) and nullish coalescing (`??`)

### Step 3: Enable `strictPropertyInitialization`

```jsonc
{
  "compilerOptions": {
    "strictPropertyInitialization": true
  }
}
```

**Expected:** 200-500 errors. Many class properties are initialized in `init()` rather than the
constructor. Fix with definite assignment assertions:

```typescript
class TrackBase {
  config!: TrackConfig  // Initialized in init()
  height!: number       // Initialized in init()
}
```

### Step 4: Enable full `strict`

```jsonc
{
  "compilerOptions": {
    "strict": true
  }
}
```

This enables remaining checks: `strictFunctionTypes`, `strictBindCallApply`,
`noImplicitThis`, `alwaysStrict`, `useUnknownInCatchVariables`.

### Step 5: Replace handwritten `igv.d.ts`

Once the internal types are stable and strict:
1. Enable `declaration: true` in the main tsconfig
2. Configure Rollup to emit `.d.ts` files
3. Write a compatibility test that compiles a consumer project against the new declarations
4. Validate the auto-generated types are a superset of the handwritten ones
5. Remove `js/igv.d.ts` and update the build script

---

## 12. Phase 8: Test Migration (Optional)

**84 test files — migrate after source is complete.**

### Strategy

1. Install `@types/mocha` and `@types/chai`
2. Start with small, simple tests:
   - `test/testVersion.js`
   - Small parser tests
3. Work up to complex integration tests:
   - `test/testBrowser.js`
   - `test/testBamReader.js`
4. Migrate test utilities:
   - `test/utils/MockGenome.js` → `.ts`
   - `test/utils/mockObjects.js` → `.ts` (with `declare global` for DOM mocks)

### Benefits of Typed Tests

- Catch config typos at compile time
- Auto-complete on track configs and API calls
- Type-safe assertions on feature properties

---

## 13. Handling Special Cases

### 13.1 The `igv-utils` Dependency

~95 files import from `../node_modules/igv-utils/src/index.js` — a direct source import of a
GitHub-pinned dependency. This is unusual and creates a typing challenge.

**Immediate solution:** Create an ambient declaration file:

```typescript
// js/types/igv-utils.d.ts
declare module '*/igv-utils/src/index.js' {
  export const StringUtils: {
    isString(value: unknown): value is string
    numberFormatter(number: number): string
    hashCode(str: string): number
    capitalize(str: string): string
    // ... other used methods
  }

  export const FileUtils: {
    isFile(value: unknown): value is File
    isFilePath(path: string): boolean
    getFilename(path: string): string
    // ... other used methods
  }

  export const igvxhr: {
    load(url: string, options?: Record<string, unknown>): Promise<unknown>
    loadArrayBuffer(url: string, options?: Record<string, unknown>): Promise<ArrayBuffer>
    loadString(url: string, options?: Record<string, unknown>): Promise<string>
    setOauthToken(token: string, host?: string): void
    setApiKey(key: string): void
    corsProxy?: string
    oauth: unknown
    // ... other used methods
  }

  export const FeatureUtils: {
    packFeatures(features: unknown[], maxRows?: number): unknown[]
    // ... other used methods
  }

  export const IGVColor: {
    rgbColor(r: number, g: number, b: number): string
    rgbaColor(r: number, g: number, b: number, a: number): string
    addAlpha(color: string, alpha: number): string
    // ... other used methods
  }

  export const BGZip: {
    unzip(data: ArrayBuffer): ArrayBuffer
    // ... other used methods
  }

  export const URIUtils: {
    isDataURL(url: string): boolean
    // ... other used methods
  }

  export const GoogleAuth: {
    // ... methods
  }
}
```

**Long-term solution:** Either:
- Fork igv-utils and add TypeScript types to it
- Migrate igv-utils to TypeScript
- Publish igv-utils to npm with a proper `types` field

### 13.2 Vendor Files

The 4 files in `js/vendor/` are third-party code and should NOT be converted to TypeScript.

Create minimal ambient declarations for each:

```typescript
// js/vendor/rbtree.d.ts
declare class RBTree<T> {
  constructor(comparator: (a: T, b: T) => number)
  insert(item: T): void
  remove(item: T): void
  find(item: T): T | null
  forEach(callback: (item: T) => void): void
}
export default RBTree

// js/vendor/tdigest.d.ts
declare class TDigest {
  push(value: number, weight?: number): void
  percentile(p: number): number
  compress(): void
}
export { TDigest }

// js/vendor/detect-element-resize.d.ts
export function addResizeListener(element: HTMLElement, callback: () => void): void
export function removeResizeListener(element: HTMLElement, callback: () => void): void

// js/vendor/lm-esm.d.ts
// Type only the exports actually used by igv.js
export function levenbergMarquardt(
  data: { x: number[]; y: number[] },
  parameterizedFunction: (params: number[]) => (x: number) => number,
  options?: Record<string, unknown>
): { parameterValues: number[]; iterations: number }
```

### 13.3 CSS/SCSS Handling

The SCSS build pipeline (`compileSass.cjs` → `generateEmbedCss.js` → `js/embedCss.js`) is
unaffected by the TypeScript migration. The generated `embedCss.js` file should be:
- Kept as `.js` (it's generated code)
- Given a `.d.ts` sidecar: `declare const css: string; export default css;`

### 13.4 Web Worker (`dataWorker.js`)

The `dist/dataWorker.js` file is a standalone web worker. It can remain JavaScript or be
migrated independently. If migrated, it needs its own `tsconfig.worker.json` with
`lib: ["ES2020", "WebWorker"]` instead of `"DOM"`.

### 13.5 Build Scripts (`scripts/`)

The `.cjs` files in `scripts/` (updateVersion, compileSass, generateEmbedCss, copyArtifacts,
buildDevDashboard) are Node.js build scripts using CommonJS. They can remain as `.cjs` files —
there is no benefit to migrating them.

---

## 14. CI/CD Changes

### Phase 0 Changes

Update `.github/workflows/ci_build.yml`:

```yaml
name: CI Build

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: ['20.x', '22.x']  # Upgrade from EOL Node 19

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - run: npm install --legacy-peer-deps

      - name: Type check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build
        run: npm run build

      - name: Verify dist outputs
        run: |
          test -f dist/igv.esm.js
          test -f dist/igv.js
          test -f dist/igv.d.ts
```

> **STATUS: DONE** — CI workflow updated with Node 20/22 matrix, typecheck step, build
> verification. Uses `--legacy-peer-deps` for TS 6.0 RC compatibility.

### Phase 7+ Changes

Add a strict type-check job for already-migrated directories:

```yaml
      - name: Strict type check
        run: npx tsc -p tsconfig.strict.json --noEmit
```

Where `tsconfig.strict.json` extends the base config with `strict: true` and only includes
completed directories.

---

## 15. Risk Assessment

### High Risk Areas

| Risk | Impact | Mitigation |
|------|--------|------------|
| `TrackBase.init()` dynamic property copying | Breaks all track subclasses if typed wrong | Use `Record<string, unknown>` cast; type properties explicitly on each subclass |
| `igv-utils` import path changes | 95 files affected | Create ambient declarations first; migrate imports in a single batch |
| Rollup + TypeScript plugin compatibility | Build breaks | Test with a single `.ts` file before migrating any source |
| `this.constructor.defaults` pattern | TypeScript types `this.constructor` as `Function` | Use `static defaults` declarations with explicit typing on each subclass |
| Config object index signatures | Too permissive (`[key: string]: unknown`) makes property access verbose | Balance strictness vs usability; use type assertions where needed |

### Medium Risk Areas

| Risk | Impact | Mitigation |
|------|--------|------------|
| Import path changes when renaming `.js` → `.ts` | Broken imports | Automate with find-and-replace script; run tests after each file |
| DOM types in UI code | Many `any` casts needed | Use `HTMLElement` and specific element types; cast where unavoidable |
| Third-party libraries without types | Type errors at boundaries | Create ambient declarations for igv-utils, vendor libs, and untyped deps |
| Test runner compatibility with `.ts` imports | Tests fail | Configure `tsx` loader in Mocha early (Phase 0) |

### Low Risk Areas

| Risk | Impact | Mitigation |
|------|--------|------------|
| Utility function typing | Localized | These are leaf modules with clear interfaces |
| Data model typing | Localized | Well-defined domain objects (Chromosome, Alignment, etc.) |
| Enum/constant typing | Localized | Convert string constants to TypeScript `const` assertions or enums |

---

## 16. Timeline Summary

| Phase | Description | Files | Est. Duration |
|-------|-------------|-------|---------------|
| **0** | Tooling setup (tsconfig, rollup, eslint, CI) | Config only | 1 week |
| **1** | Utilities & data models | ~35 | 2-3 weeks |
| **2** | Canvas, UI utilities & components | ~25 | 2 weeks |
| **3** | Genome, sequence & BigWig infrastructure | ~25 | 2-3 weeks |
| **4** | Reader/source layer (BAM, feature, variant, etc.) | ~40 | 4-5 weeks |
| **5** | Track classes | ~20+ renderers | 3-4 weeks |
| **6** | Core orchestration (Browser, viewports, entry points) | ~20 | 3-4 weeks |
| **7** | Strict mode escalation | All 275 (fixes only) | 3-4 weeks |
| **8** | Test migration (optional) | 84 test files | 2-3 weeks |
| | **Total** | **~275 source + 84 test** | **~22-30 weeks** |

### Milestones

- **After Phase 0:** TypeScript tooling works, CI runs type checks, zero source changes
- **After Phase 1:** ~35 leaf files are `.ts`, type foundation established
- **After Phase 4:** All data access code is typed — the "data layer" is complete
- **After Phase 6:** All source files are `.ts` (with `strict: false`)
- **After Phase 7:** Full strict mode — the migration is complete
