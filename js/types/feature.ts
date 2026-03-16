/**
 * Base genomic coordinate types used throughout igv.js
 */

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
    /** Dynamic attributes from format-specific fields */
    [key: string]: any
}

export interface Exon {
    start: number
    end: number
    cdStart?: number
    cdEnd?: number
    utr?: boolean
}

export interface PopupDataItem {
    name?: string
    value?: string | number
    html?: string
    borderTop?: boolean
}

/** A popup data entry is either a structured item or an HTML string separator */
export type PopupData = PopupDataItem | string

/** BedPE interaction feature with two genomic loci */
export interface BedpeFeature extends GenomicFeature {
    chr1: string
    start1: number
    end1: number
    chr2: string
    start2: number
    end2: number
    strand1?: string
    strand2?: string
    value?: number
    type?: string
    thickness?: number
    extras?: string[]
    /** Duplicate flag for inter-chromosome features */
    dup?: boolean
    /** Transient rendering state set during draw */
    drawState?: BedpeDrawState
}

export interface BedpeNestedDrawState { xc: number; yc: number; r: number }
export interface BedpeProportionalDrawState { xc: number; yc: number; radiusX: number; radiusY: number }
export interface BedpeRectDrawState { x: number; y: number; w: number; h: number }

export type BedpeDrawState = BedpeNestedDrawState | BedpeProportionalDrawState | BedpeRectDrawState
