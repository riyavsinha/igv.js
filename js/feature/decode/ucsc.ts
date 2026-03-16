import {IGVColor} from "../../../node_modules/igv-utils/src/index.js"
import DecodeError from "./decodeError"

import {parseAttributeString} from "../gff/parseAttributeString"
import GFFHelper from "../gff/gffHelper"

interface BedHeader {
    gffTags?: boolean
    nameField?: string
    shift?: number
    thicknessColumn?: number
    colorColumn?: number
    wig?: WigState
    format?: string
}

interface WigState {
    format: string
    index: number
    step: number
    start: number
    span: number
    chrom: string
}

interface Exon {
    start: number
    end: number
    utr?: boolean
    cdStart?: number
    cdEnd?: number
    readingFrame?: number
    number?: number
}

interface PopupDataEntry {
    name: string
    value: string | number
}

/**
 * Decode the UCSC bed format.  Only the first 3 columns (chr, start, end) are required.   The remaining columns
 * must follow standard bed order, but we will tolerate deviations after column 3.
 *
 * @param tokens
 * @param header
 * @param maxColumnCount
 * @returns decoded feature, or null if this is not a valid record
 */
function decodeBed(tokens: string[], header: BedHeader | undefined, maxColumnCount: number = Number.MAX_SAFE_INTEGER): UCSCBedFeature | DecodeError | undefined {

    if (tokens.length < 3) return undefined

    const gffTags = header && header.gffTags

    const chr = tokens[0]
    const start = parseInt(tokens[1])
    const end = tokens.length > 2 ? parseInt(tokens[2]) : start + 1
    if (isNaN(start) || isNaN(end)) {
        return new DecodeError(`Unparsable bed record.`)
    }
    const feature = new UCSCBedFeature({chr: chr, start: start, end: end, score: 1000})

    let columnCount = 3
    try {
        if (tokens.length > 3 && columnCount++ < maxColumnCount) {

            // Potentially parse name field as GFF column 9 style string.
            if (tokens[3].indexOf(';') > 0 && tokens[3].indexOf('=') > 0) {
                const attributeKVs = parseAttributeString(tokens[3], '=')
                feature.attributes = {}
                for (let kv of attributeKVs) {
                    feature.attributes[kv[0]] = kv[1]
                    if(gffTags) {
                        if (header!.nameField != undefined && kv[0] === header!.nameField) {
                            feature.name = kv[1]
                        } else if (!feature.name && GFFHelper.gffNameFields.has(kv[0])) {
                            feature.name = kv[1]
                        }
                    }
                }
            }
            if (!feature.name && !gffTags) {
                feature.name = tokens[3] === '.' ? '' : tokens[3]
            }
        }

        if (tokens.length > 4 && columnCount++ < maxColumnCount) {
            feature.score = tokens[4] === '.' ? 0 : Number(tokens[4])
            if (isNaN(feature.score)) {
                return feature
            }
        }

        if (tokens.length > 5 && columnCount++ < maxColumnCount) {
            feature.strand = tokens[5]
            if (!(feature.strand === '.' || feature.strand === '+' || feature.strand === '-')) {
                return feature
            }
        }

        if (tokens.length > 6 && columnCount++ < maxColumnCount) {
            feature.cdStart = parseInt(tokens[6])
            if (isNaN(feature.cdStart)) {
                return feature
            }
        }

        if (tokens.length > 7 && columnCount++ < maxColumnCount) {
            feature.cdEnd = parseInt(tokens[7])
            if (isNaN(feature.cdEnd)) {
                return feature
            }
        }

        if (tokens.length > 8 && columnCount++ < maxColumnCount) {
            if (tokens[8] !== "." && tokens[8] !== "0")
                feature.color = IGVColor.createColorString(tokens[8])
        }

        if (tokens.length > 11 && columnCount++ < maxColumnCount) {
            const exonCount = parseInt(tokens[9])
            // Some basic validation
            if (exonCount > 1000) {
                // unlikely
                return feature
            }

            const exonSizes = tokens[10].replace(/,$/, '').split(',')
            const exonStarts = tokens[11].replace(/,$/, '').split(',')
            if (!(exonSizes.length === exonStarts.length && exonCount === exonSizes.length)) {
                return feature
            }

            const exons: Exon[] = []
            for (let i = 0; i < exonCount; i++) {
                const eStart = start + parseInt(exonStarts[i])
                const eEnd = eStart + parseInt(exonSizes[i])
                exons.push({start: eStart, end: eEnd})
            }
            if (exons.length > 0) {
                findUTRs(exons, feature.cdStart, feature.cdEnd)
                feature.exons = exons
            }
        }

        // Optional extra columns
        if (header) {
            let thicknessColumn = header.thicknessColumn
            let colorColumn = header.colorColumn
            if (colorColumn && colorColumn < tokens.length) {
                feature.color = IGVColor.createColorString(tokens[colorColumn])
            }
            if (thicknessColumn && thicknessColumn < tokens.length) {
                feature.thickness = tokens[thicknessColumn]
            }
        }
    } catch
        (e) {

    }

    return feature
}


function decodeGappedPeak(tokens: string[], header: BedHeader | undefined): UCSCBedFeature | DecodeError | undefined {
    const feature = decodeBed(tokens, header) as UCSCBedFeature | undefined
    if (feature && tokens.length > 14) {
        feature.signal = Number(tokens[12])
        feature.pValue = Number(tokens[13])
        feature.qValue  = Number(tokens[14])
    }
    return feature
}

/**
 * Decode a bedMethyl file.
 * Reference: https://www.encodeproject.org/data-standards/wgbs/
 */
function decodeBedmethyl(tokens: string[], header: BedHeader | undefined): UCSCBedFeature | DecodeError | undefined {

    // Bedmethyl is a 9+9 format
    const feature = decodeBed(tokens, header, 9) as UCSCBedFeature | undefined
    if (feature) {
        const extraColumnHeadings = ["Coverage", "% Showing Methylation", "N-mod", "N-canonical", "N-other mod",
            "N-delete", "N-fail", "N-dff", "N-nocall"]
        for (let i = 9; i < tokens.length; i++) {
            const heading = extraColumnHeadings[i - 9]
            feature[heading] = tokens[i]
        }
    }

    return feature
}


/**
 * Decode a UCSC repeat masker record.
 */
function decodeRepeatMasker(tokens: string[], header: BedHeader | undefined): Record<string, unknown> | undefined {

    if (tokens.length <= 15) return undefined

    const feature: Record<string, unknown> = {
        swScore: Number.parseInt(tokens[1]),
        milliDiv: Number.parseInt(tokens[2]),
        milliDel: Number.parseInt(tokens[3]),
        milliIns: Number.parseInt(tokens[4]),
        chr: tokens[5],
        start: Number.parseInt(tokens[6]),
        end: Number.parseInt(tokens[7]),
        strand: tokens[9],
        repName: tokens[10],
        repClass: tokens[11],
        repFamily: tokens[12],
        repStart: Number.parseInt(tokens[13]),
        repEnd: Number.parseInt(tokens[14]),
        repLeft: Number.parseInt(tokens[15])
    }

    return feature

}

/**
 * Decode a UCSC "genePred" record.
 */
function decodeGenePred(tokens: string[], header: BedHeader): Record<string, unknown> | undefined {

    const shift = header.shift === undefined ? 0 : 1

    if (tokens.length <= 9 + shift) return undefined

    const cdStart = parseInt(tokens[5 + shift])
    const cdEnd = parseInt(tokens[6 + shift])
    const feature: Record<string, unknown> = {
        name: tokens[0 + shift],
        chr: tokens[1 + shift],
        strand: tokens[2 + shift],
        start: parseInt(tokens[3 + shift]),
        end: parseInt(tokens[4 + shift]),
        cdStart: cdStart,
        cdEnd: cdEnd,
        id: tokens[0 + shift]
    }
    const exons = decodeExons(parseInt(tokens[7 + shift]), tokens[8 + shift], tokens[9 + shift])
    findUTRs(exons, cdStart, cdEnd)

    feature.exons = exons

    return feature

}

/**
 * Decode a UCSC "genePredExt" record.  refGene files are in this format.
 */
function decodeGenePredExt(tokens: string[], header: BedHeader): Record<string, unknown> | undefined {

    const shift = header.shift === undefined ? 0 : 1

    if (tokens.length <= 11 + shift) return undefined

    const cdStart = parseInt(tokens[5 + shift])
    const cdEnd = parseInt(tokens[6 + shift])
    const feature: Record<string, unknown> = {
        name: tokens[11 + shift],
        chr: tokens[1 + shift],
        strand: tokens[2 + shift],
        start: parseInt(tokens[3 + shift]),
        end: parseInt(tokens[4 + shift]),
        cdStart: cdStart,
        cdEnd: cdEnd,
        id: tokens[0 + shift]
    }

    const exons = decodeExons(
        parseInt(tokens[7 + shift]),
        tokens[8 + shift],
        tokens[9 + shift],
        tokens[14 + shift])
    findUTRs(exons, cdStart, cdEnd)

    feature.exons = exons

    return feature
}

/**
 * Decode a UCSC "refFlat" record
 */
function decodeReflat(tokens: string[], header: BedHeader): Record<string, unknown> | undefined {

    const shift = header.shift === undefined ? 0 : 1

    if (tokens.length <= 10 + shift) return undefined

    const cdStart = parseInt(tokens[6 + shift])
    const cdEnd = parseInt(tokens[7 + shift])
    const feature: Record<string, unknown> = {
        name: tokens[0 + shift],
        id: tokens[1 + shift],
        chr: tokens[2 + shift],
        strand: tokens[3 + shift],
        start: parseInt(tokens[4 + shift]),
        end: parseInt(tokens[5 + shift]),
        cdStart: cdStart,
        cdEnd: cdEnd
    }

    const exons = decodeExons(parseInt(tokens[8 + shift]), tokens[9 + shift], tokens[10 + shift])
    findUTRs(exons, cdStart, cdEnd)
    feature.exons = exons

    return feature
}

/**
 * Decode a UCS PSL record
 */
function decodePSL(tokens: string[], header: BedHeader | undefined): PSLFeature | undefined {

    if (tokens.length < 21) return undefined

    const chr = tokens[13]
    const start = parseInt(tokens[15])
    const end = parseInt(tokens[16])
    const strand = tokens[8].charAt(0)
    const exonCount = parseInt(tokens[17])
    const exons: Exon[] = []
    const exonStarts = tokens[20].replace(/,$/, '').split(',')
    const exonSizes = tokens[18].replace(/,$/, '').split(',')

    for (let i = 0; i < exonCount; i++) {
        const s = parseInt(exonStarts[i])
        const e = s + parseInt(exonSizes[i])
        exons.push({start: s, end: e})
    }

    return new PSLFeature({chr, start, end, strand, exons, tokens})
}


function decodeExons(exonCount: number, startsString: string, endsString: string, frameOffsetsString?: string): Exon[] {

    const exonStarts = startsString.replace(/,$/, '').split(',')
    const exonEnds = endsString.replace(/,$/, '').split(',')
    const frameOffsets = frameOffsetsString ? frameOffsetsString.replace(/,$/, '').split(',') : undefined
    const exons: Exon[] = []
    for (let i = 0; i < exonCount; i++) {
        const start = parseInt(exonStarts[i])
        const end = parseInt(exonEnds[i])
        const exon: Exon = {start, end}
        if (frameOffsets) {
            const fo = parseInt(frameOffsets[i])
            if (fo !== -1) exon.readingFrame = fo
        }
        exons.push(exon)
    }
    return exons

}

function findUTRs(exons: Exon[], cdStart: number | undefined, cdEnd: number | undefined): void {

    for (let exon of exons) {
        const end = exon.end
        const start = exon.start
        if (end < cdStart! || start > cdEnd!) {
            exon.utr = true
        } else {
            if (cdStart! >= start && cdStart! <= end) {
                exon.cdStart = cdStart
            }
            if (cdEnd! >= start && cdEnd! <= end) {
                exon.cdEnd = cdEnd
            }
        }
    }

}

function decodePeak(tokens: string[], header: BedHeader | undefined): Record<string, unknown> | undefined {

    const tokenCount = tokens.length
    if (tokenCount < 9) {
        return undefined
    }

    const chr = tokens[0]
    const start = parseInt(tokens[1])
    const end = parseInt(tokens[2])
    const name = tokens[3]
    let score = Number(tokens[4])
    const strand = tokens[5].trim()
    const signal = Number(tokens[6])
    const pValue = Number(tokens[7])
    const qValue = Number(tokens[8])

    if (score === 0) score = signal

    return {
        chr: chr, start: start, end: end, name: name, score: score, strand: strand, signal: signal,
        pValue: pValue, qValue: qValue
    }
}

function decodeNarrowPeak(tokens: string[], header: BedHeader | undefined): Record<string, unknown> | undefined {

    const feature = decodePeak(tokens, header)
    if(feature && tokens.length > 9) {
        feature.peak = Number(tokens[9])
    }
    return feature
}

function decodeBedGraph(tokens: string[], header?: BedHeader): Record<string, unknown> | undefined {

    if (tokens.length <= 3) return undefined

    const chr = tokens[0]
    const start = parseInt(tokens[1])
    const end = parseInt(tokens[2])
    const value = Number(tokens[3])
    const feature: Record<string, unknown> = {chr: chr, start: start, end: end, value: value}

    // Optional extra columns
    if (header) {
        let colorColumn = header.colorColumn
        if (colorColumn && colorColumn < tokens.length) {
            feature.color = IGVColor.createColorString(tokens[colorColumn])
        }
    }

    return feature
}

function decodeWig(tokens: string[], header: BedHeader): Record<string, unknown> | null | undefined {

    const wig = header.wig

    if (wig && wig.format === "fixedStep") {
        const ss = (wig.index * wig.step) + wig.start
        const ee = ss + wig.span
        const value = Number(tokens[0])
        ++(wig.index)
        return isNaN(value) ? null : {chr: wig.chrom, start: ss, end: ee, value: value}
    } else if (wig && wig.format === "variableStep") {

        if (tokens.length < 2) return null
        const ss = parseInt(tokens[0], 10) - 1
        const ee = ss + wig.span
        const value = Number(tokens[1])
        return isNaN(value) ? null : {chr: wig.chrom, start: ss, end: ee, value: value}

    } else {
        return decodeBedGraph(tokens)
    }
}

/**
 * Decode a UCSC SNP record.
 * Reference: https://genome.ucsc.edu/FAQ/FAQformat.html#format1
 */
function decodeSNP(tokens: string[], header: BedHeader | undefined): Record<string, unknown> | undefined {

    if (tokens.length < 6) return undefined

    const autoSql: string[] = [
        'bin',
        'chr',
        'start',
        'end',
        'name',
        'score',
        'strand',
        'refNCBI',
        'refUCSC',
        'observed',
        'molType',
        'class',
        'valid',
        'avHet',
        'avHetSE',
        'func',
        'locType',
        'weight',
        'exceptions',
        'submitterCount',
        'submitters',
        'alleleFreqCount',
        'alleles',
        'alleleNs',
        'alleleFreqs',
        'bitfields'
    ]


    const feature: Record<string, unknown> = {
        chr: tokens[1],
        start: Number.parseInt(tokens[2]),
        end: Number.parseInt(tokens[3]),
        name: tokens[4],
        score: Number.parseInt(tokens[5])
    }

    const n = Math.min(tokens.length, autoSql.length)
    for (let i = 6; i < n; i++) {
        feature[autoSql[i]] = tokens[i]
    }
    return feature

}


interface UCSCBedProperties {
    chr: string
    start: number
    end: number
    score?: number
    // Dynamic properties from bed files with varying column counts
    [key: string]: unknown
}

class UCSCBedFeature {

    chr!: string
    start!: number
    end!: number
    score!: number
    name?: string
    strand?: string
    cdStart?: number
    cdEnd?: number
    color?: string
    exons?: Exon[]
    thickness?: string
    attributes?: Record<string, string>
    signal?: number
    pValue?: number
    qValue?: number;
    // Dynamic properties assigned via Object.assign from bed columns and extra headers
    [key: string]: unknown

    constructor(properties: UCSCBedProperties) {
        Object.assign(this, properties)
    }

    getAttributeValue(attributeName: string): unknown {
        if (this.hasOwnProperty(attributeName)) {
            return this[attributeName]
        } else if (this.attributes) {
            return this.attributes[attributeName]
        }
    }
}

interface PSLProperties {
    chr: string
    start: number
    end: number
    strand: string
    exons: Exon[]
    tokens: string[]
}

class PSLFeature {

    chr!: string
    start!: number
    end!: number
    strand!: string
    exons!: Exon[]
    tokens!: string[]

    constructor(properties: PSLProperties) {
        Object.assign(this, properties)
    }

    get score(): number {
        const tokens = this.tokens
        const match = parseInt(tokens[0])
        const repMatch = parseInt(tokens[2])
        const misMatch = parseInt(tokens[1])
        const qGapCount = parseInt(tokens[4])
        const tGapCount = parseInt(tokens[6])
        const qSize = parseInt(tokens[10])
        return Math.floor((1000 * (match + repMatch - misMatch - qGapCount - tGapCount)) / qSize)
    }

    get matches(): string {
        return this.tokens[0]
    }

    get misMatches(): string {
        return this.tokens[1]
    }

    get repMatches(): string {
        return this.tokens[2]
    }

    get nCount(): string {
        return this.tokens[3]
    }

    get qNumInsert(): string {
        return this.tokens[4]
    }

    get qBaseInsert(): string {
        return this.tokens[5]
    }

    get tNumInsert(): string {
        return this.tokens[6]
    }

    get tBaseInsert(): string {
        return this.tokens[7]
    }

    popupData(): PopupDataEntry[] {
        return [
            {name: 'chr', value: this.chr},
            {name: 'start', value: this.start + 1},
            {name: 'end', value: this.end},
            {name: 'strand', value: this.strand},
            {name: 'score', value: this.score},
            {name: 'match', value: this.matches},
            {name: "mis-match", value: this.misMatches},
            {name: "rep. match", value: this.repMatches},
            {name: "N's", value: this.nCount},
            {name: 'Q gap count', value: this.qNumInsert},
            {name: 'Q gap bases', value: this.qBaseInsert},
            {name: 'T gap count', value: this.tNumInsert},
            {name: 'T gap bases', value: this.tBaseInsert},
        ]
    }

}

export {
    decodeBed, decodeBedGraph, decodeGenePred, decodeGenePredExt, decodePeak, decodeReflat, decodeRepeatMasker,
    decodeSNP, decodeWig, decodePSL, decodeBedmethyl, decodeGappedPeak, decodeNarrowPeak
}
