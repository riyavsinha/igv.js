# CLAUDE.md — igv.js Project Guidelines

## Build & Test Commands
- **Type check**: `npx tsc --noEmit`
- **Lint**: `npx eslint <files>`
- **Tests**: `npx mocha` (expect ~245 passing, 2 pre-existing timeout failures)
- Always run all three after changes to verify.

## TypeScript Migration: Eliminating `any`

This project is undergoing incremental TypeScript `any` elimination. The goal is zero `any` types — every `any` should be replaced with a semantically meaningful type or `unknown`.

### Core Principles

1. **No `any` left behind.** Every `any` must be replaced. If the type is truly dynamic/unknowable, use `unknown` (not `any`).
2. **Inspect deeply.** Don't just slap `unknown` on everything. Read the code to understand the actual shape of objects, then create or use proper types.
3. **Semantic types over structural.** Prefer named interfaces/types that describe what something *is* (e.g., `Track`, `ClickState`, `DrawConfiguration`) over inline structural types.
4. **Preserve the `[key: string]: any` index signature** only when genuinely needed (e.g., `Track` interface where config properties are dynamically merged, `TrackView` where `dispose()` nullifies all properties via `Object.keys`). Document why with a comment.
5. **Type vendored/third-party code at the boundary.** If a vendored `@ts-nocheck` file (like `canvas2svg.ts`) or untyped dependency is used in our code, add proper type declarations (export types, `.d.ts` files, or typed wrappers) so that *our* code stays cleanly typed without casts. Prefer fixing the type at the source over scattering `as unknown as X` casts everywhere.

### Typing Patterns Established

#### Track types
- `Track` interface in `js/types/ui.ts` — structural interface for all ~18 track types. Has `[key: string]: any` because tracks have dynamic properties set via config merging in `TrackBase.init()`.
- When a track-specific method is needed (e.g., ruler-only methods), cast at the call site: `(viewport as RulerViewport).presentLocusLabel(...)`.
- `IdeogramTrack` and `RulerTrack` don't fully implement `Track` — cast via `as unknown as Track` when creating `TrackView`.

#### Canvas2SVG (C2S) context
- `C2SContext` type exported from `js/canvas2svg.ts` = `CanvasRenderingContext2D & C2SVGExtensions`.
- `new C2S()` returns `C2SContext`, so it flows into `DrawConfiguration.context` (typed as `CanvasRenderingContext2D`) with zero casts.
- Use `C2SContext` in `renderSVGContext()` method signatures where C2S-specific methods (`saveWithTranslationAndClipRect`, `setHeight`, `getSerializedSvg`) are called.
- Local intersection types like `CanvasRenderingContext2D & { isSVG?: boolean }` are fine for track-specific draw methods that only need the `isSVG` flag.

#### Viewport hierarchy
- `Viewport` → `TrackViewport` → (used by most tracks). `IdeogramViewport` extends `Viewport` directly.
- `TrackView.viewports` typed as `Viewport[]`. Cast to `TrackViewport[]` where TrackViewport-specific methods (e.g., `featureCache`, `needsRepaint`) are accessed.
- Cast to `RulerViewport` for ruler-specific methods behind `track.type === 'ruler'` guards.

#### Features
- Features are polymorphic (arrays, alignment containers, coverage objects) — use `unknown` for feature types in generic contexts.
- `DrawConfiguration.features` is `unknown`.
- `FeatureCache.features` is `unknown`.
- Use `Array.isArray()` guards before accessing `.length`.

#### DOM elements
- Use specific types: `HTMLDivElement`, `HTMLCanvasElement`, etc. — not `HTMLElement` when the actual element type is known.
- Use definite assignment (`!:`) for fields always initialized in the constructor call path.

#### Method signatures
- Replace `(x: any)` params with actual types from usage analysis.
- `browser: any` → `Browser`, `referenceFrame: any` → `ReferenceFrame`, etc.
- For callbacks/handlers, type the parameter based on what the callback actually receives.

#### Popup data
- `PopupData` is a union: `string | PopupDataItem`. Use `typeof x === 'string'` narrowing before accessing `.name`/`.value`.

### Type definitions location
- Central types: `js/types/ui.ts` (Track, DrawConfiguration, ClickState, MenuItem, etc.)
- Feature types: `js/types/feature.ts` (GenomicFeature, PopupData, PopupDataItem, etc.)
- Config types: `js/types/config.ts` (TrackConfig, BrowserConfig, etc.)
- Browser types: `js/types/browser.ts`

### Files already typed (any-free)
- `js/viewport.ts`
- `js/trackViewport.ts`
- `js/trackView.ts`
- `js/ideogramViewport.ts`
- `js/rulerViewport.ts`
- `js/rulerTrack.ts`
- `js/rulerSweeper.ts`
- `js/feature/interactionTrack.ts`
- `js/ideogramTrack.ts`
- `js/bam/pairedAlignment.ts`
- `js/bam/bamAlignmentRow.ts`
- `js/bam/baseModificationCounts.ts`
- `js/bam/alignmentContainer.ts`
- `js/bam/alignmentTrack.ts`
- `js/canvas2svg.ts` (vendored, `@ts-nocheck`, but export is typed)
- `js/sample/sampleNameViewport.ts` (renderSVGContext typed)
- `js/sample/sampleInfoViewport.ts` (renderSVGContext typed)
- `js/roi/ROIManager.ts` (renderSVGContext typed)

### Common pitfalls
- **Don't widen `DrawConfiguration.context`** to include `C2SContext` — it causes cascade errors in every track's `draw()` method. Keep it as `CanvasRenderingContext2D`; C2SContext is assignable to it.
- **`replace_all` with Edit tool** can catch substrings in method/variable names — be careful (e.g., replacing "SVGContext" also matches "renderSVGContext").
- **Optional vs required fields**: If a type field is required but some implementers don't have it, make it optional (`?:`) rather than fighting the type system.
- **`TrackLike.draw` param is `unknown`** (widened from `DrawConfiguration`) because `IdeogramTrack.draw()` takes a different shape.
