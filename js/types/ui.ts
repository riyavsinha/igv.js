/**
 * UI-related type definitions used across tracks, viewports, and interaction handlers
 */

import type ReferenceFrame from "../referenceFrame.js"
import type {GenomicFeature} from "./feature"

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
    cachedFeatures: FeatureCacheLike | undefined
    referenceFrame: ReferenceFrame
    trackView: TrackViewLike
    getWidth(): number
}

/** Minimal trackView shape needed by click/popup handlers */
export interface TrackViewLike {
    track: TrackLike
    repaintViews(): void
    checkContentHeight(): void
    updateViews(force?: boolean): void
}

/** Minimal track shape for cross-cutting concerns */
export interface TrackLike {
    type?: string
    name?: string
    id?: string
    displayMode?: string
    draw(options: DrawConfiguration): void
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
    label?: string | HTMLElement
    click?: (this: unknown) => void
    init?: () => void
    object?: HTMLElement
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
    features?: GenomicFeature[]
    /** Device pixel ratio for HiDPI rendering */
    devicePixelRatio?: number
}
