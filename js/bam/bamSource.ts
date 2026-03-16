import BamReaderNonIndexed from "./bamReaderNonIndexed.js"
import ShardedBamReader from "./shardedBamReader.js"
import BamReader from "./bamReader.js"
import BamWebserviceReader from "./bamWebserviceReader.js"
import HtsgetBamReader from "../htsget/htsgetBamReader.js"
import CramReader from "../cram/cramReader.js"
import {isDataURL} from "../util/igvUtils.js"
import {StringUtils} from "../../node_modules/igv-utils/src/index.js"
import {inferIndexPath} from "../util/fileFormatUtils.js"
import AlignmentContainer, {type AlignmentContainerOptions} from "./alignmentContainer"
import type {BaseFeatureSourceGenome} from "../feature/baseFeatureSource.js"

interface BamSourceConfig {
    url: string
    indexURL?: string
    indexed?: boolean
    sourceType?: string
    format?: string
    name?: string
    [key: string]: unknown
}

interface BamReaderLike {
    readAlignments(chr: string, start: number, end: number): Promise<AlignmentContainer | unknown[] | undefined>
    postInit?(): Promise<void>
}

class BamSource {

    config: BamSourceConfig
    genome: BaseFeatureSourceGenome
    bamReader: BamReaderLike

    constructor(config: BamSourceConfig, browser: { genome: BaseFeatureSourceGenome }) {

        const genome = browser.genome

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
            this.bamReader = new ShardedBamReader(config as unknown as ConstructorParameters<typeof ShardedBamReader>[0], genome)
        } else if ("cram" === config.format) {
            this.bamReader = new CramReader(
                config as unknown as ConstructorParameters<typeof CramReader>[0],
                genome as unknown as ConstructorParameters<typeof CramReader>[1],
                browser as unknown as ConstructorParameters<typeof CramReader>[2]
            )
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


    async getAlignments(chr: string, bpStart: number, bpEnd: number): Promise<AlignmentContainer> {

        const result = await this.bamReader.readAlignments(chr, bpStart, bpEnd)

        // Some readers (e.g. HtsgetBamReader for 'all') return empty arrays
        if (!result || Array.isArray(result)) {
            return new AlignmentContainer(chr, bpStart, bpEnd, this.config as AlignmentContainerOptions)
        }

        const alignmentContainer = result
        if (alignmentContainer.hasAlignments) {
            const sequence = await this.genome.getSequence?.(chr, alignmentContainer.start, alignmentContainer.end)
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
