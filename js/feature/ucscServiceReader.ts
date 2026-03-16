import {igvxhr} from "../../node_modules/igv-utils/src/index.js"

interface UCSCServiceConfig {
    url: string
    db: string
    tableName: string
    [key: string]: any
}

interface Exon {
    start: number
    end: number
    utr?: boolean
    cdStart?: number
    cdEnd?: number
}

interface UCSCSample {
    exonCount?: number
    exonStarts?: string
    exonEnds?: string
    exons?: Exon[]
    cdsStart?: number
    cdsEnd?: number
    [key: string]: any
}

class UCSCServiceReader {
    config: UCSCServiceConfig
    genome: { getChromosome(chr: string): { bpLength: number } | undefined } | undefined
    expandQueryInterval: boolean

    constructor(config: UCSCServiceConfig, genome?: { getChromosome(chr: string): { bpLength: number } | undefined }) {
        this.config = config
        this.genome = genome
        this.expandQueryInterval = false
    }

    readFeatures(chr: string, start: number, end: number): Promise<UCSCSample[] | null> {

        const s: number = Math.max(0, Math.floor(start))
        let e: number = Math.ceil(end)

        if (this.genome) {
            const c = this.genome.getChromosome(chr)
            if (c && e > c.bpLength) {
                e = c.bpLength
            }
        }


        const url: string = this.config.url + '?db=' + this.config.db + '&table=' + this.config.tableName + '&chr=' + chr + '&start=' + s + '&end=' + e

        return igvxhr.loadJson(url, this.config)
            .then(function (data: UCSCSample[] | undefined) {
                if (data) {
                    data.forEach(function (sample: UCSCSample) {
                        if (sample.hasOwnProperty('exonStarts') &&
                            sample.hasOwnProperty('exonEnds') &&
                            sample.hasOwnProperty('exonCount') &&
                            sample.hasOwnProperty('cdsStart') &&
                            sample.hasOwnProperty('cdsEnd')) {
                            addExons(sample)
                        }
                    })
                    return data
                } else {
                    return null
                }
            })
    }
}

function addExons(sample: UCSCSample): void {
    var exonCount: number, exonStarts: string[], exonEnds: string[], exons: Exon[], eStart: number, eEnd: number
    exonCount = sample['exonCount']!
    exonStarts = sample['exonStarts']!.split(',')
    exonEnds = sample['exonEnds']!.split(',')
    exons = []

    for (var i = 0; i < exonCount; i++) {
        eStart = parseInt(exonStarts[i])
        eEnd = parseInt(exonEnds[i])
        var exon: Exon = {start: eStart, end: eEnd}

        if (sample.cdsStart! > eEnd || sample.cdsEnd! < sample.cdsStart!) exon.utr = true   // Entire exon is UTR
        if (sample.cdsStart! >= eStart && sample.cdsStart! <= eEnd) exon.cdStart = sample.cdsStart
        if (sample.cdsEnd! >= eStart && sample.cdsEnd! <= eEnd) exon.cdEnd = sample.cdsEnd

        exons.push(exon)
    }

    sample.exons = exons
}

export default UCSCServiceReader
