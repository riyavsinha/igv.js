/**
 * Configuration interfaces for tracks and browser initialization
 */

import type {GenomicFeature} from "./feature"

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
    description?: string | (() => string)
    /** Allow arbitrary additional properties for backward compatibility */
    [key: string]: unknown
}

/** Browser creation options */
export interface BrowserConfig {
    genome?: string | Record<string, unknown>
    reference?: string | Record<string, unknown>
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
    search?: Record<string, unknown>
    nucleotideColors?: Partial<Record<string, string>>
    /** Allow arbitrary additional properties */
    [key: string]: unknown
}
