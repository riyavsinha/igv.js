/**
 * Configuration interfaces for tracks and browser initialization
 */

import type {GenomicFeature} from "./feature"

/** Common properties for data-loading configuration passed to buildOptions/igvxhr */
export interface LoadConfig {
    oauthToken?: string | (() => string | Promise<string>)
    headers?: Record<string, string>
    withCredentials?: boolean
    filename?: string
    /** Allow additional properties for format-specific options */
    [key: string]: unknown
}

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
    features?: GenomicFeature[]
    /** Allow arbitrary additional properties for backward compatibility */
    [key: string]: any
}

/** Search service configuration as provided by the user */
export interface SearchConfigInput {
    url: string
    coords?: number
    chromosomeField?: string
    startField?: string
    endField?: string
    geneField?: string
    snpField?: string
    resultsField?: string
}

/** Resolved search configuration used internally */
export interface SearchConfig {
    type: string
    url: string
    coords: number
    chromosomeField: string
    startField: string
    endField: string
    geneField: string
    snpField: string
    resultsField?: string
}

/** Configuration for loading sample metadata */
export interface SampleInfoConfig {
    url?: string
    file?: File
    filename?: string
    [key: string]: unknown
}

/** Configuration for regions of interest */
export interface ROIConfig {
    url?: string
    name?: string
    color?: string
    isUserDefined?: boolean
    isVisible?: boolean
    format?: string
    features?: GenomicFeature[]
    [key: string]: unknown
}

/** Custom button configuration for the navbar */
export interface CustomButtonConfig {
    label: string
    callback: () => void
    [key: string]: unknown
}

/** Options for loading a session */
export interface SessionLoadOptions {
    url?: string
    file?: File
    filename?: string
    [key: string]: unknown
}

/** Serialized session state */
export interface SessionObject {
    version?: string
    reference?: Record<string, unknown>
    genome?: string | Record<string, unknown>
    locus?: string | string[]
    tracks?: TrackConfig[]
    roi?: ROIConfig[]
    qtlSelections?: Record<string, unknown>
    showSampleNames?: boolean
    sampleNameViewportWidth?: number
    sampleinfo?: SampleInfoConfig[]
    [key: string]: unknown
}

/** Browser creation options */
export interface BrowserConfig {
    genome?: string | Record<string, unknown>
    reference?: string | Record<string, unknown>
    locus?: string | string[]
    tracks?: TrackConfig[]
    sessionURL?: string

    // Display toggles
    showNavigation?: boolean
    showControls?: boolean
    showRuler?: boolean
    showIdeogram?: boolean
    showCenterGuide?: boolean
    showCenterGuideButton?: boolean
    showCursorTrackingGuide?: boolean
    showCursorGuide?: boolean
    showSampleNames?: boolean
    showTrackLabels?: boolean
    showCircularViewButton?: boolean
    showChromosomeWidget?: boolean
    showSampleNameButton?: boolean
    showCytobandNames?: boolean

    // Layout
    sampleNameViewportWidth?: number
    formEmbedMode?: boolean
    minimumBases?: number

    // Timing
    doubleClickDelay?: number

    // Data
    flanking?: number
    crossDomainProxy?: string
    formats?: Record<string, unknown>
    trackDefaults?: Record<string, Record<string, unknown>>
    nucleotideColors?: Partial<Record<string, string>>

    // Search
    search?: SearchConfigInput

    // Authentication
    apiKey?: string
    oauthToken?: string | (() => string | Promise<string>)
    clientId?: string

    // Events
    listeners?: Record<string, (...args: unknown[]) => void>
    queryParametersSupported?: boolean

    // Sample info
    sampleinfo?: SampleInfoConfig[]

    // ROI
    roi?: ROIConfig[]

    // Custom UI
    customButtons?: CustomButtonConfig[]

    /** Allow arbitrary additional properties */
    [key: string]: unknown
}
