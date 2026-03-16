import AlignmentContainer, {type AlignmentContainerOptions} from "./alignmentContainer"
import BamUtils, {type BamHeader, type BamFilterLike} from "./bamUtils"
import {igvxhr} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions} from "../util/igvUtils.js"
import type {BaseFeatureSourceGenome} from "../feature/baseFeatureSource.js"

interface BamWebserviceConfig {
    url: string
    referenceFile?: string
    alignmentFile?: string
    [key: string]: unknown
}

interface WebserviceHeader {
    chrAliasTable: Record<string, string>
    chrToIndex: Record<string, number>
    chrNames: string[]
}

/**
 * Class for reading bam records from an igv.js-flask server backed by pysam.  Deprecated.
 */
class BamWebserviceReader {

    config: BamWebserviceConfig
    genome: BaseFeatureSourceGenome
    filter: BamFilterLike | undefined
    header: WebserviceHeader | undefined

    constructor(config: BamWebserviceConfig, genome: BaseFeatureSourceGenome) {
        this.config = config
        this.genome = genome
        BamUtils.setReaderDefaults(this, config)
    }

    // Example http://localhost:5000/alignments/?reference=/Users/jrobinso/hg19mini.fa&file=/Users/jrobinso/cram_with_crai_index.cram&region=1:100-2000

    async readAlignments(chr: string, bpStart: number, bpEnd: number): Promise<AlignmentContainer> {

        const header = await this.getHeader()

        const queryChr: string = header.chrAliasTable.hasOwnProperty(chr) ? header.chrAliasTable[chr] : chr

        const url: string = this.config.url +
            "?reference=" + this.config.referenceFile +
            "&file=" + this.config.alignmentFile + "" +
            "&region=" + queryChr + ":" + bpStart + "-" + bpEnd

        const sam: string = await igvxhr.loadString(url, buildOptions(this.config))

        const alignmentContainer = new AlignmentContainer(chr, bpStart, bpEnd, this.config as AlignmentContainerOptions)

        BamUtils.decodeSamRecords(sam, alignmentContainer, queryChr, bpStart, bpEnd, this.filter)

        return alignmentContainer
    }

    // Example  http://localhost:5000/alignments/?reference=/Users/jrobinso/hg19mini.fa&file=/Users/jrobinso/cram_with_crai_index.cram&options=-b%20-H
    async getHeader(): Promise<WebserviceHeader> {

        if (this.header) {
            return this.header
        }

        const url: string = this.config.url + "?file=" + this.config.alignmentFile + "&options=-b,-H"
        const options = buildOptions(this.config)

        const header = await BamUtils.readHeader(url, options, this.genome) as unknown as WebserviceHeader
        this.header = header
        return header
    }
}

export default BamWebserviceReader
