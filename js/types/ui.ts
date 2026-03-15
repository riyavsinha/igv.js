/**
 * UI-related type definitions used across tracks, viewports, and interaction handlers
 */

import type ReferenceFrame from "../referenceFrame.js"
import type {GenomicFeature, PopupData} from "./feature"
import type {TrackConfig} from "./config"

export interface ClickState {
    viewport: TrackViewportLike
    genomicLocation: number
    canvasX: number
    canvasY: number
    y: number
    referenceFrame: ReferenceFrame
    event?: MouseEvent
}

/** Minimal viewport shape needed by ClickState consumers */
export interface TrackViewportLike {
    cachedFeatures: unknown
    referenceFrame: ReferenceFrame
    trackView: TrackViewLike
    getWidth(): number
}

/** Minimal trackView shape needed by click/popup handlers */
export interface TrackViewLike {
    track: TrackLike
    viewports: { setContentHeight(h: number): void }[]
    repaintViews(): void
    setTrackHeight(h: number, force?: boolean): void
    checkContentHeight?(): void
    updateViews?(force?: boolean): void
}

/** Minimal track shape for cross-cutting concerns */
export interface TrackLike {
    type?: string
    name?: string
    id?: string
    displayMode?: string
    draw(options: unknown): void
    [key: string]: unknown
}

export interface FeatureCacheLike {
    features: GenomicFeature[]
    roiFeatures?: { features: GenomicFeature[]; track: TrackLike }[]
    containsRange(chr: string, start: number, end: number, bpPerPixel?: number, windowFunction?: string): boolean
}

export interface DataRange {
    min: number
    max: number
    logScale?: boolean
}

export interface MenuItem {
    name?: string
    element?: HTMLElement
    label?: string | HTMLElement
    click?: (this: any, e?: Event) => void
    dialog?: (this: any, e?: Event) => void
    init?: () => void
    type?: string
    value?: unknown
    doAllMultiSelectedTracks?: boolean
    menuItemType?: string
}

export interface DrawConfiguration {
    context: CanvasRenderingContext2D
    pixelWidth: number
    pixelHeight: number
    bpPerPixel: number
    bpStart: number
    bpEnd: number
    pixelTop: number
    pixelShift?: number
    windowFunction?: string
    referenceFrame: ReferenceFrame
    viewport: TrackViewportLike
    viewportWidth: number
    /** Features to draw — polymorphic: arrays, alignment containers, coverage objects, etc. */
    features?: unknown
    /** Device pixel ratio for HiDPI rendering */
    devicePixelRatio?: number
    /** Content scroll offset, used in trackViewport rendering */
    contentTop?: number
    /** Pixel X offset for canvas positioning */
    pixelXOffset?: number
    /** Genomic selection region */
    selection?: { chr: string; start: number; end: number }
    /** Cached sequence interval for amino acid rendering */
    sequenceInterval?: unknown
    /** Per-row last X pixel position for feature rendering */
    rowLastX?: number[]
    /** Per-row last label X position for feature rendering */
    rowLastLabelX?: number[]
    /** Whether to draw feature labels */
    drawLabel?: boolean
    /** Whether to label all features regardless of density */
    labelAllFeatures?: boolean
    /** Allow additional dynamic properties set by track renderers */
    [key: string]: unknown
}


/**
 * Structural interface for all track types used by TrackView, TrackViewport, and Viewport.
 * The [key: string]: any index signature is intentional — tracks have many dynamic properties
 * set via config merging in TrackBase.init().
 */
export interface Track {
    // Identity
    type?: string
    id?: string
    name?: string
    config?: TrackConfig

    // Back-reference (set by TrackView constructor)
    trackView?: TrackViewLike

    // Layout
    height: number
    minHeight?: number
    maxHeight?: number
    autoHeight?: boolean
    order?: number
    removable?: boolean

    // Visibility
    visibilityWindow?: number
    supportsWholeGenome?: boolean

    // Rendering
    displayMode?: string
    color?: string | ((feature: GenomicFeature) => string)
    altColor?: string
    _initialColor?: string
    _initialAltColor?: string
    supportHiDPI?: boolean

    // State
    selected?: boolean
    disposed?: boolean

    // Scaling
    autoscale?: boolean
    autoscaleGroup?: string
    dataRange?: DataRange
    resolutionAware?: boolean
    windowFunction?: string
    groupBy?: unknown

    // ROI
    roiSets?: { getFeatures(chr: string, start: number, end: number, bpPerPixel?: number): Promise<unknown[]>; draw(config: DrawConfiguration): void }[]

    // Menu
    ignoreTrackMenu?: boolean
    disableButtons?: boolean

    // Required methods
    draw(config: DrawConfiguration): void

    // Optional methods
    paintAxis?: (ctx: CanvasRenderingContext2D, width: number, height: number, rgba?: string) => void
    computePixelHeight?: (features: unknown, bpPerPixel?: number) => number
    getFeatures?: (chr: string, start: number, end: number, bpPerPixel: number, viewport?: unknown) => Promise<unknown>
    popupData?: (clickState: ClickState, features?: unknown[]) => Promise<PopupData[]> | PopupData[]
    contextMenuItemList?: (clickState: ClickState) => (string | MenuItem)[] | null | undefined
    hoverText?: (clickState: ClickState) => string | undefined
    getSamples?: () => { names: string[]; height?: number; yOffset?: number }
    createGroupLabels?: () => void
    doAutoscale?: (features: unknown[]) => DataRange
    updateScales?: (viewports: unknown[]) => unknown
    dispose?: () => void
    description?: string | (() => DocumentFragment | HTMLElement | string)
    clickedFeatures?: (clickState: ClickState) => unknown[]

    // Variant-specific
    nVariantRows?: number
    variantRowCount?: (count: number) => void

    // Static access pattern — class constructors may have defaultColor
    constructor: { defaultColor?: string; [key: string]: unknown }

    // Dynamic property access — intentional any for config-merged properties
    [key: string]: any
}
