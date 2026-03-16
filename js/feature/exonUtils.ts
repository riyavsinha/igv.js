import {translationDict} from "../util/translationDict"
import {complementSequence} from "../util/sequenceUtils"

interface Exon {
    readingFrame?: number
    start: number
    end: number
    cdStart?: number
    cdEnd?: number
    utr?: boolean
}

function getExonPhase(exon: Exon): number {
    return (3 - exon.readingFrame!) % 3
}

function getCodingStart(exon: Exon): number {
    return exon.cdStart || exon.start
}

function getCodingEnd(exon: Exon): number {
    return exon.cdEnd || exon.end
}

function getCodingLength(exon: Exon): number {
    if (exon.utr) return 0
    const start = exon.cdStart || exon.start
    const end = exon.cdEnd || exon.end
    return end - start
}


export { getExonPhase, getCodingStart, getCodingEnd, getCodingLength }
