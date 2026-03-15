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
    name: string
    value: string | number
}
