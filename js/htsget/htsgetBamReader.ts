import HtsgetReader from "./htsgetReader"
import AlignmentContainer from "../bam/alignmentContainer"
import BamUtils from "../bam/bamUtils"
import {BGZip} from "../../node_modules/igv-utils/src/index.js"
import ChromAliasManager from "../feature/chromAliasManager"

interface BamHeader {
    chrNames: string[];
    chrToIndex: Record<string, number>;
    size: number;
    [key: string]: any;
}

class HtsgetBamReader extends HtsgetReader {

    chrNames: Set<string> = new Set()
    header: BamHeader | undefined;
    chromAliasManager: ChromAliasManager | null = null;
    filter: any;
    config: any;

    constructor(config: any, genome: any) {
        super(config, genome)
        BamUtils.setReaderDefaults(this, config)
    }


    async readAlignments(chr: string, start: number, end: number): Promise<any> {

        if('all' === chr) {
            return []    // This should never happen, but just in case
        }

        if (!this.header) {
            const compressedData: any = await this.readHeaderData()
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
            return new AlignmentContainer(chr, start, end, this.config)  // Empty container
        }

        const compressedData: any = await this.readData(queryChr, start, end)

        // BAM decoding
        const ba: Uint8Array = BGZip.unbgzf(compressedData.buffer)
        this.header = BamUtils.decodeBamHeader(ba, this.genome)

        const chrIdx: number = this.header.chrToIndex[chr]
        const alignmentContainer = new AlignmentContainer(chr, start, end, this.config)
        BamUtils.decodeBamRecords(ba, this.header.size, alignmentContainer as any, this.header.chrNames, chrIdx, start, end, this.filter)
        alignmentContainer.finish()

        return alignmentContainer

    }

}


export default HtsgetBamReader
