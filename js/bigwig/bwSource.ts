import BWReader from "./bwReader"
import pack from "../feature/featurePacker"
import BaseFeatureSource from "../feature/baseFeatureSource"

interface WigFeature {
    chr: string
    start: number
    end: number
    value: number
    _f?: WigFeature
    [key: string]: unknown
}

interface GetFeaturesParams {
    chr: string
    start: number
    end: number
    bpPerPixel: number
    windowFunction?: string
    visibilityWindow?: number
}

interface CachedWGValues {
    values: WigFeature[]
    bpPerPixel: number
}

class BWSource extends BaseFeatureSource {

    queryable: boolean = true
    #wgValues: Record<string, CachedWGValues> = {}
    windowFunctions: string[] = ["mean", "min", "max", "none"]
    reader: BWReader
    genome: any
    format: string

    constructor(config: Record<string, any>, genome: any) {
        super(genome)
        this.reader = new BWReader(config, genome)
        this.genome = genome
        this.format = config.format || "bigwig"
    }

    async getFeatures({chr, start, end, bpPerPixel, windowFunction}: GetFeaturesParams): Promise<WigFeature[]> {

        await this.reader.loadHeader()
        const isBigWig: boolean = this.reader.type === "bigwig"

        let features: WigFeature[]
        if ("all" === chr.toLowerCase()) {
            const wgChromosomeNames: string[] = this.genome.wgChromosomeNames
            features = isBigWig && wgChromosomeNames? await this.getWGValues(wgChromosomeNames, windowFunction, bpPerPixel) : []
        } else {
            features = await this.reader.readFeatures(chr, start, chr, end, bpPerPixel, windowFunction)
        }

        if (!isBigWig) {
            pack(features)
        }
        return features
    }

    async getHeader(): Promise<any> {
        return this.reader.loadHeader()
    }

    async defaultVisibilityWindow(): Promise<number> {
        if (this.reader.type === "bigwig") {
            return -1
        } else {
            return this.reader.featureDensity ? Math.floor(10000 / this.reader.featureDensity) : -1
        }

    }

    async getWGValues(wgChromosomeNames: string[], windowFunction: string, bpPerPixel: number): Promise<WigFeature[]> {

        const genome = this.genome
        const cached: CachedWGValues | undefined = this.#wgValues[windowFunction]
        if (cached && cached.bpPerPixel > 0.8 * bpPerPixel && cached.bpPerPixel < 1.2 * bpPerPixel) {
            return cached.values
        } else {
            const features: WigFeature[] = await this.reader.readWGFeatures(wgChromosomeNames, bpPerPixel, windowFunction)
            let wgValues: WigFeature[] = []
            for (let f of features) {
                const chr: string = f.chr
                const offset: number | undefined = genome.getCumulativeOffset(chr)
                if (undefined === offset) continue
                const wgFeature: WigFeature = Object.assign({}, f) as WigFeature
                wgFeature.chr = "all"
                wgFeature.start = offset + f.start
                wgFeature.end = offset + f.end
                wgFeature._f = f
                wgValues.push(wgFeature)
            }
            wgValues.sort((a: WigFeature, b: WigFeature) => a.start - b.start)
            this.#wgValues[windowFunction] = {values: wgValues, bpPerPixel}
            return wgValues
        }
    }

    supportsWholeGenome(): boolean {
        return this.reader.type === "bigwig"
    }

    async trackType(): Promise<string> {
        return this.reader.getTrackType()
    }

    get searchable(): boolean {
        return this.reader.searchable
    }

    async search(term: string): Promise<any> {
        return this.reader.search(term)
    }
}

export default BWSource
