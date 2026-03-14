/**
 * Interfaces for the duck-typed reader/source patterns used throughout igv.js
 */

import type {GenomicFeature} from "./feature"

export interface FeatureReader {
    readFeatures(chr: string, start: number, end: number): Promise<GenomicFeature[]>
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
