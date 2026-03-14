import BaseFeatureSource from "./baseFeatureSource"
import {igvxhr} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions} from "../util/igvUtils.js"
import getDataWrapper from "./dataWrapper"

type FeatureSourceFactory = (config: any, genome: any) => any

interface ListFeatureSourceConfig {
    url: string
    [key: string]: any
}

class ListFeatureSource extends BaseFeatureSource {

    config: ListFeatureSourceConfig
    featureSourceFactory: FeatureSourceFactory
    featureSourceMap: Map<string, any> | null
    header: any

    constructor(config: ListFeatureSourceConfig, genome: any, featureSourceFactory: FeatureSourceFactory) {
        super(genome)
        this.config = config
        this.featureSourceFactory = featureSourceFactory
        this.featureSourceMap = null
        this.header = null
    }

    async getHeader(): Promise<any> {

        if (!this.header) {

            if (!this.featureSourceMap) {
                await this.init()
            }
            // Return the header from the first feature source.  It is assumed that all sources have a common header.
            const firstFS = this.featureSourceMap!.values().next().value
            if (firstFS && firstFS.getHeader) {
                this.header = firstFS.getHeader()
            } else {
                this.header = Promise.resolve(undefined)
            }
        }

        return this.header

    }

    async getFeatures({chr, start, end, bpPerPixel, visibilityWindow}: {chr: string, start: number, end: number, bpPerPixel?: number, visibilityWindow?: number}): Promise<any[]> {

        if (!this.featureSourceMap) {
            await this.init()
        }
        const fs = this.featureSourceMap!.get(chr)
        if (fs) {
            return fs.getFeatures({chr, start, end, bpPerPixel, visibilityWindow})
        } else {
            return []
        }
    }

    async init(): Promise<void> {
        this.featureSourceMap = new Map()

        const options = buildOptions(this.config)
        const data = await igvxhr.loadByteArray(this.config.url, options)
        const dataWrapper = getDataWrapper(data)

        let line: string | undefined
        while ((line = dataWrapper.nextLine()) !== undefined) {
            const trimmed: string = line.trim()
            if (!trimmed.startsWith('#')) {
                const tokens: string[] = trimmed.split(/\s+/)
                if (tokens.length > 1) {
                    const chr: string = tokens[0]
                    const path: string = tokens[1]
                    const sourceConfig: any = Object.assign({}, this.config)
                    sourceConfig.url = path
                    if (path.endsWith(".vcf.gz")) {
                        sourceConfig.format = "vcf"
                        sourceConfig.indexURL = path + ".tbi"
                    }
                    this.featureSourceMap.set(chr, this.featureSourceFactory(sourceConfig, this.genome))
                }
            }
        }
    }

    supportWholeGenome(): boolean {
        return false
    }
}

export default ListFeatureSource

// chrY	https://1000genomes.s3.amazonaws.com/release/20130502/ALL.chrY.phase3_integrated_v1b.20130502.genotypes.vcf.gz
// chrX	https://1000genomes.s3.amazonaws.com/release/20130502/ALL.chrX.phase3_shapeit2_mvncall_integrated_v1b.20130502.genotypes.vcf.gz
