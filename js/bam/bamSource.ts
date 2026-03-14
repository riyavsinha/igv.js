import BamReaderNonIndexed from "./bamReaderNonIndexed.js"
import ShardedBamReader from "./shardedBamReader.js"
import BamReader from "./bamReader.js"
import BamWebserviceReader from "./bamWebserviceReader.js"
import HtsgetBamReader from "../htsget/htsgetBamReader.js"
import CramReader from "../cram/cramReader.js"
import {isDataURL} from "../util/igvUtils.js"
import {StringUtils} from "../../node_modules/igv-utils/src/index.js"
import {inferIndexPath} from "../util/fileFormatUtils.js"

interface BamSourceConfig {
    url: string
    indexURL?: string
    indexed?: boolean
    sourceType?: string
    format?: string
    name?: string
    [key: string]: any
}

class BamSource {

    config: BamSourceConfig
    genome: any
    bamReader: any

    constructor(config: BamSourceConfig, browser: any) {

        const genome: any = browser.genome

        this.config = config
        this.genome = genome

        if (isDataURL(config.url)) {
            this.config.indexed = false
        }

        if ("ga4gh" === config.sourceType) {
            throw Error("Unsupported source type 'ga4gh'")
        } else if ("pysam" === config.sourceType) {
            this.bamReader = new BamWebserviceReader(config, genome)
        } else if ("htsget" === config.sourceType) {
            this.bamReader = new HtsgetBamReader(config, genome)
        } else if ("shardedBam" === config.sourceType) {
            this.bamReader = new ShardedBamReader(config as any, genome)
        } else if ("cram" === config.format) {
            this.bamReader = new CramReader(config as any, genome, browser)
        } else {
            if (!this.config.indexURL && config.indexed !== false) {
                if (StringUtils.isString(this.config.url)) {
                    const indexPath: string | undefined = inferIndexPath(this.config.url, "bai")
                    if (indexPath) {
                        console.warn(`Warning: no indexURL specified for ${this.config.url}.  Guessing ${indexPath}`)
                        this.config.indexURL = indexPath
                    } else {
                        console.warn(`Warning: no indexURL specified for ${this.config.url}.`)
                        this.config.indexed = false
                    }
                } else {
                    console.warn(`Warning: no indexURL specified for ${this.config.name}.`)
                    this.config.indexed = false
                }
            }

            if (this.config.indexed !== false) { // && this.config.indexURL) {
                this.bamReader = new BamReader(config, genome)
            } else {
                this.bamReader = new BamReaderNonIndexed(config, genome)
            }
        }
    }

    async postInit(): Promise<void> {
        if(typeof this.bamReader.postInit === 'function') {
            await this.bamReader.postInit()
        }
    }


    async getAlignments(chr: string, bpStart: number, bpEnd: number): Promise<any> {

        const genome: any = this.genome

        const alignmentContainer: any = await this.bamReader.readAlignments(chr, bpStart, bpEnd)

        if (alignmentContainer.hasAlignments) {
            const sequence: string | undefined = await genome.getSequence(chr, alignmentContainer.start, alignmentContainer.end)
            if (sequence) {
                alignmentContainer.coverageMap.refSeq = sequence
                alignmentContainer.sequence = sequence
                return alignmentContainer
            } else {
                console.error("No sequence for: " + chr + ":" + alignmentContainer.start + "-" + alignmentContainer.end)
            }
        }
        return alignmentContainer

    }
}

export default BamSource
