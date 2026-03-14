import TDFReader from "./tdfReader"
import GenomicInterval from "../genome/genomicInterval"
import BaseFeatureSource from "../feature/baseFeatureSource"

interface TDFConfig {
    [key: string]: any
}

interface Genome {
    wgChromosomeNames?: string[]
    getChromosome(chr: string): { bpLength: number }
    getGenomeCoordinate(chr: string, pos: number): number
    [key: string]: any
}

interface TDFFeature {
    chr: string
    start: number
    end: number
    value: number
    _f?: any
}

interface TDFTile {
    type: string
    nPositions: number
    start: number | number[]
    end?: number[]
    span: number
    data: number[][]
}

interface TDFDataset {
    tileWidth: number
    tiles: any[]
}

interface GetFeaturesParams {
    chr: string
    start: number
    end: number
    bpPerPixel: number
    windowFunction?: string
}

class TDFSource extends BaseFeatureSource {

    #wgValues: Record<string, { values: TDFFeature[]; bpPerPixel: number }> = {}
    searchable: boolean = false
    genome: Genome
    reader: any
    queryable: boolean
    rootGroup: any
    normalizationFactor?: number


    constructor(config: TDFConfig, genome: Genome) {
        super(genome)
        this.genome = genome
        this.reader = new TDFReader(config, genome as any)
        this.queryable = true
    }

    async getFeatures({chr, start, end, bpPerPixel, windowFunction = "mean"}: GetFeaturesParams): Promise<TDFFeature[]> {

        if (chr.toLowerCase() === "all") {
            return this.getWGValues(windowFunction, bpPerPixel)
        } else {
            return this._getFeatures(chr, start, end, bpPerPixel, windowFunction)
        }
    }

    async _getFeatures(chr: string, start: number, end: number, bpPerPixel: number, windowFunction: string): Promise<TDFFeature[]> {
        const genomicInterval = new GenomicInterval(chr, start, end, undefined)
        const genome = this.genome


        if (!this.rootGroup) {
            this.rootGroup = await this.reader.readRootGroup()
            if (!this.normalizationFactor) {
                const totalCount = this.rootGroup.totalCount
                if (totalCount) {
                    this.normalizationFactor = 1.0e6 / totalCount
                }
            }
        }

        ;(genomicInterval as any).bpPerPixel = bpPerPixel
        const zoom = zoomLevelForScale(chr, bpPerPixel, genome)
        let queryChr: string = this.reader.chrAliasTable[chr]
        let maxZoom: number = this.reader.maxZoom
        if (queryChr === undefined) queryChr = chr
        if (maxZoom === undefined) maxZoom = -1

        const wf = zoom > maxZoom ? "raw" : windowFunction
        const dataset: TDFDataset | null = await this.reader.readDataset(queryChr, wf, zoom)
        if (dataset == null) {
            return []
        }

        const tileWidth = dataset.tileWidth
        const startTile = Math.floor(start / tileWidth)
        const endTile = Math.floor(end / tileWidth)
        const NTRACKS = 1   // TODO read this
        const tiles: TDFTile[] = await this.reader.readTiles(dataset.tiles.slice(startTile, endTile + 1), NTRACKS)
        const features: TDFFeature[] = []
        for (let tile of tiles) {
            switch (tile.type) {
                case "bed":
                    decodeBedTile(tile, chr, start, end, bpPerPixel, features)
                    break
                case "variableStep":
                    decodeVaryTile(tile, chr, start, end, bpPerPixel, features)
                    break
                case "fixedStep":
                    decodeFixedTile(tile, chr, start, end, bpPerPixel, features)
                    break
                default:
                    throw ("Unknown tile type: " + tile.type)
            }
        }
        features.sort(function (a: TDFFeature, b: TDFFeature) {
            return a.start - b.start
        })

        return features
    }

    get supportsWholeGenome(): boolean {
        return true
    }

    get windowFunctions(): string[] {
        return this.reader.windowFunctions
    }

    async getWGValues(windowFunction: string, bpPerPixel: number): Promise<TDFFeature[]> {

        const cached = this.#wgValues[windowFunction]
        if (cached && cached.bpPerPixel > 0.8 * bpPerPixel && cached.bpPerPixel < 1.2 * bpPerPixel) {
            return cached.values
        } else {
            const wgFeatures: TDFFeature[] = []
            const genome = this.genome
            const chrNames = this.genome.wgChromosomeNames
            if (chrNames) {
                for (let c of genome.wgChromosomeNames!) {
                    const len = genome.getChromosome(c).bpLength
                    bpPerPixel = len / 1000
                    const chrFeatures = await this._getFeatures(c, 0, len, bpPerPixel, windowFunction)
                    if (chrFeatures) {
                        for (let f of chrFeatures) {
                            const wg: TDFFeature = Object.assign({}, f)
                            wg.chr = "all"
                            wg.start = genome.getGenomeCoordinate(f.chr, f.start)
                            wg.end = genome.getGenomeCoordinate(f.chr, f.end)
                            wg._f = f
                            wgFeatures.push(wg)
                        }
                    }
                }
            }
            this.#wgValues[windowFunction] = {values: wgFeatures, bpPerPixel}
            return wgFeatures
        }
    }

}

function decodeBedTile(tile: TDFTile, chr: string, bpStart: number, bpEnd: number, bpPerPixel: number, features: TDFFeature[]): void {

    const nPositions = tile.nPositions
    const starts = tile.start as number[]
    const ends = tile.end!
    const data = tile.data[0]   // Single track for now
    for (let i = 0; i < nPositions; i++) {
        const s = starts[i]
        const e = ends[i]
        if (e < bpStart) continue
        if (s > bpEnd) break
        features.push({
            chr: chr,
            start: s,
            end: e,
            value: data[i]
        })
    }
}

function decodeVaryTile(tile: TDFTile, chr: string, bpStart: number, bpEnd: number, bpPerPixel: number, features: TDFFeature[]): void {

    const nPositions = tile.nPositions
    const starts = tile.start as number[]
    const span = tile.span
    const data = tile.data[0]   // Single track for now
    for (let i = 0; i < nPositions; i++) {
        const s = starts[i]
        const e = s + span
        if (e < bpStart) continue
        if (s > bpEnd) break
        features.push({
            chr: chr,
            start: s,
            end: e,
            value: data[i]
        })
    }
}

function decodeFixedTile(tile: TDFTile, chr: string, bpStart: number, bpEnd: number, bpPerPixel: number, features: TDFFeature[]): void {

    const nPositions = tile.nPositions
    let s = tile.start as number
    const span = tile.span
    const data = tile.data[0]   // Single track for now

    for (let i = 0; i < nPositions; i++) {
        const e = s + span
        if (s > bpEnd) break
        if (e >= bpStart) {
            if (!Number.isNaN(data[i])) {
                features.push({
                    chr: chr,
                    start: s,
                    end: e,
                    value: data[i]
                })
            }
        }
        s = e
    }
}


const log2: number = Math.log(2)

function zoomLevelForScale(chr: string, bpPerPixel: number, genome: Genome): number {

    // Convert bpPerPixel to IGV "zoom" level.   This is a bit convoluted,  TDF is computed zoom levels assuming
    // display in a 700 pixel window.  The fully zoomed out view of a chromosome is zoom level "0".
    // Zoom level 1 is magnified 2X,  and so forth

    const chrSize = genome.getChromosome(chr).bpLength

    return Math.ceil(Math.log(Math.max(0, (chrSize / (bpPerPixel * 700)))) / log2)
}

export default TDFSource
