/**
 * Interfaces for the duck-typed reader/source patterns used throughout igv.js
 */

import type {GenomicFeature} from "./feature"

export interface FeatureReader {
    readFeatures(chr: string, start: number, end: number): Promise<GenomicFeature[]>
    readHeader?(): Promise<unknown>
}

export interface FeatureSource {
    getFeatures(...args: any[]): Promise<any>
    supportsWholeGenome?: boolean | (() => boolean)
    trackType?: string | (() => Promise<string>)
    /** Allow duck-typed methods (getHeader, search, reader, etc.) used by various track implementations */
    [key: string]: any
}

export interface FeatureQueryOptions {
    chr: string
    start: number
    end: number
    bpPerPixel?: number
    visibilityWindow?: number
    /** Allow additional options used by specific feature source implementations */
    [key: string]: any
}
