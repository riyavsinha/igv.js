import HtsgetReader from "./htsgetReader"
import AlignmentContainer, {type AlignmentContainerOptions} from "../bam/alignmentContainer"
import BamUtils from "../bam/bamUtils"
import {BGZip} from "../../node_modules/igv-utils/src/index.js"
import ChromAliasManager from "../feature/chromAliasManager"
import type {BaseFeatureSourceGenome} from "../feature/baseFeatureSource.js"

interface BamHeader {
    chrNames: string[]
    chrToIndex: Record<string, number>
    size: number
}

class HtsgetBamReader extends HtsgetReader {

    // Dynamic properties set via BamUtils.setReaderDefaults()
    [key: string]: unknown

    chrNames: Set<string> = new Set()
    header: BamHeader | undefined
    chromAliasManager: ChromAliasManager | null = null

    constructor(config: Record<string, unknown>, genome: BaseFeatureSourceGenome) {
        super(config as ConstructorParameters<typeof HtsgetReader>[0], genome)
        BamUtils.setReaderDefaults(this, config)
    }


    async readAlignments(chr: string, start: number, end: number): Promise<AlignmentContainer | unknown[]> {

        if('all' === chr) {
            return []    // This should never happen, but just in case
        }

        if (!this.header) {
            const compressedData = await this.readHeaderData()
            const ba: Uint8Array = BGZip.unbgzf(compressedData.buffer)
            this.header = BamUtils.decodeBamHeader(ba, this.genome)
            for(let name of this.header.chrNames) {
                this.chrNames.add(name)
            }
            this.chromAliasManager = this.genome ? new ChromAliasManager(this.header.chrNames, this.genome) : null
        }

        // If the chromosome is not in the BAM header, check for an alias.
        let queryChr: string = chr
        if (this.chrNames.size > 0 && !this.chrNames.has(chr) && this.chromAliasManager) {
            queryChr = await this.chromAliasManager.getAliasName(chr)
        }

        if (!this.chrNames.has(queryChr)) {
            console.warn("Chromosome " + chr + " not found in BAM header")
            return new AlignmentContainer(chr, start, end, this.config as AlignmentContainerOptions)  // Empty container
        }

        const compressedData = await this.readData(queryChr, start, end)

        // BAM decoding
        const ba: Uint8Array = BGZip.unbgzf(compressedData.buffer)
        this.header = BamUtils.decodeBamHeader(ba, this.genome)

        const chrIdx: number = this.header.chrToIndex[chr]
        const alignmentContainer = new AlignmentContainer(chr, start, end, this.config as AlignmentContainerOptions)
        BamUtils.decodeBamRecords(ba, this.header.size, alignmentContainer as unknown as Parameters<typeof BamUtils.decodeBamRecords>[2], this.header.chrNames, chrIdx, start, end, this.filter)
        alignmentContainer.finish()

        return alignmentContainer

    }

}


export default HtsgetBamReader
