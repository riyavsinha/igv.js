import gmodCRAM from "./cram-bundle.js"
import AlignmentContainer from "../bam/alignmentContainer"
import BamUtils from "../bam/bamUtils"
import BamAlignment from "../bam/bamAlignment"
import AlignmentBlock from "../bam/alignmentBlock"
import FileHandler from "./fileHandler"


const READ_STRAND_FLAG: number = 0x10
const MATE_STRAND_FLAG: number = 0x20

const CRAM_MATE_STRAND_FLAG: number = 0x1
const CRAM_MATE_MAPPED_FLAG: number = 0x2

interface CramHeader {
    indexToChr: string[];
    chrToIndex: Record<string, number>;
    chrNames: string[];
    readGroups: any[];
}

interface CramConfig {
    fileHandle?: any;
    indexFileHandle?: any;
    url: string;
    indexURL: string;
    seqFetch?: (seqID: number, start: number, end: number) => Promise<string>;
    checkSequenceMD5?: boolean;
    fetchSizeLimit?: number;
    [key: string]: any;
}

interface CramRecord {
    sequenceId: number;
    alignmentStart: number;
    lengthOnRef: number;
    flags: number;
    templateLength?: number;
    templateSize?: number;
    mappingQuality: number;
    readGroupId: number;
    mate?: {
        sequenceId: number;
        alignmentStart: number;
        flags?: number;
    };
    readLength: number;
    readFeatures?: CramReadFeature[];
    tags: Record<string, any>;
    readName: string;
    qualityScores: number[];
    getReadBases(): string;
}

interface CramReadFeature {
    code: string;
    data: any;
    pos: number;
    refPos: number;
}

/**
 * Class for reading a cram file.  Wraps the gMOD Cram package.
 *
 * @param config
 * @constructor
 */
class CramReader {

    chrAliasTable: Map<string, string | undefined> = new Map()
    config: CramConfig;
    browser: any;
    genome: any;
    cramFile: any;
    indexedCramFile: any;
    header: CramHeader;
    filter: any;

    constructor(config: CramConfig, genome: any, browser: any) {

        this.config = config
        this.browser = browser
        this.genome = genome

        this.cramFile = new gmodCRAM.CramFile({
            filehandle: config.fileHandle ? config.fileHandle : new FileHandler(config.url, config),
            //url: config.url,
            seqFetch: config.seqFetch || seqFetch.bind(this),
            checkSequenceMD5: config.checkSequenceMD5 !== undefined ? config.checkSequenceMD5 : true
        })

        const indexFileHandle = config.indexFileHandle ? config.indexFileHandle : new FileHandler(config.indexURL, config)
        this.indexedCramFile = new gmodCRAM.IndexedCramFile({
            cram: this.cramFile,
            index: new gmodCRAM.CraiIndex({
                //url: config.indexURL
                filehandle: indexFileHandle
            }),
            fetchSizeLimit: config.fetchSizeLimit || 1000000000
        })

        BamUtils.setReaderDefaults(this, config)

        async function seqFetch(this: CramReader, seqID: number, start: number, end: number): Promise<string> {
            const genome = this.genome
            const header = await this.getHeader()
            const chr: string = genome.getChromosomeName(header.indexToChr[seqID])
            return this.genome.getSequence(chr, start - 1, end)
        }
    }


    /**
     * Parse the sequence dictionary from the SAM header and build chr name tables.
     */

    async getHeader(): Promise<CramHeader> {

        if (!this.header) {
            const samHeader: any[] = await this.cramFile.getSamHeader()
            const chrToIndex: Record<string, number> = {}
            const indexToChr: string[] = []
            const readGroups: any[] = []

            for (let line of samHeader) {
                if ('SQ' === line.tag) {
                    for (let d of line.data) {
                        if (d.tag === "SN") {
                            const seq: string = d.value
                            chrToIndex[seq] = indexToChr.length
                            indexToChr.push(seq)
                            break
                        }
                    }
                } else if ('RG' === line.tag) {
                    readGroups.push(line.data)
                }
            }

            this.header = {
                indexToChr: indexToChr,
                chrToIndex: chrToIndex,
                chrNames: Object.keys(chrToIndex),
                readGroups: readGroups

            }
        }

        return this.header
    }

    async #getRefId(chr: string): Promise<number | undefined> {

        await this.getHeader()

        if (this.chrAliasTable.has(chr)) {
            chr = this.chrAliasTable.get(chr) as string
            if (chr === undefined) {
                return undefined
            }
        }

        let refId: number | undefined = this.header.chrToIndex[chr]

        // Try alias
        if (refId === undefined) {
            const aliasRecord: any = await this.genome.getAliasRecord(chr)
            let alias: string | undefined
            if (aliasRecord) {
                const aliases: string[] = Object.keys(aliasRecord)
                    .filter((k: string) => k !== "start" && k !== "end")
                    .map((k: string) => aliasRecord[k])
                    .filter((a: string) => undefined !== this.header.chrToIndex[a])
                if (aliases.length > 0) {
                    alias = aliases[0]
                    refId = this.header.chrToIndex[aliases[0]]
                }
            }
            this.chrAliasTable.set(chr, alias)  // alias may be undefined => no alias exists. Setting prevents repeated attempts
        }
        return refId
    }


    async readAlignments(chr: string, bpStart: number, bpEnd: number): Promise<any> {

        const header: CramHeader = await this.getHeader()

        const chrIdx: number | undefined = await this.#getRefId(chr)

        const alignmentContainer = new AlignmentContainer(chr, bpStart, bpEnd, this.config as any)

        if (chrIdx === undefined) {
            return alignmentContainer

        } else {

            try {
                const records: CramRecord[] = await this.indexedCramFile.getRecordsForRange(chrIdx, bpStart, bpEnd)

                for (let record of records) {

                    const refID: number = record.sequenceId
                    const pos: number = record.alignmentStart
                    const alignmentEnd: number = pos + record.lengthOnRef

                    if (refID < 0) {
                        continue   // unmapped read
                    } else if (refID > chrIdx || pos > bpEnd) {
                        return    // off right edge, we're done
                    } else if (refID < chrIdx) {
                        continue   // Sequence to left of start, not sure this is possible
                    }
                    if (alignmentEnd < bpStart) {
                        continue
                    }  // Record out-of-range "to the left", skip to next one

                    const alignment: any = decodeCramRecord(record, header.chrNames)

                    if (this.filter.pass(alignment)) {
                        alignmentContainer.push(alignment)
                    }
                }

                alignmentContainer.finish()

                return alignmentContainer
            } catch (error) {
                let message: string = error.message
                if (message && message.indexOf("MD5") >= 0) {
                    message = "Sequence mismatch. Is this the correct genome for the loaded CRAM?"
                }
                this.browser.alert.present(new Error(message))
                throw error
            }
        }

        function decodeCramRecord(record: CramRecord, chrNames: string[]): any {

            const alignment = new BamAlignment()

            alignment.chr = chrNames[record.sequenceId]
            alignment.start = record.alignmentStart - 1
            alignment.lengthOnRef = record.lengthOnRef
            alignment.flags = record.flags
            alignment.strand = !(record.flags & READ_STRAND_FLAG)
            alignment.fragmentLength = record.templateLength || record.templateSize || 0
            alignment.mq = record.mappingQuality
            alignment.end = record.alignmentStart + record.lengthOnRef
            ;(alignment as any).readGroupId = record.readGroupId

            if (record.mate && record.mate.sequenceId !== undefined) {
                const strand: boolean = record.mate.flags !== undefined ?
                    !(record.mate.flags & CRAM_MATE_STRAND_FLAG) :
                    !(record.flags & MATE_STRAND_FLAG)

                alignment.mate = {
                    chr: chrNames[record.mate.sequenceId],
                    position: record.mate.alignmentStart,
                    strand: strand
                }
            }

            alignment.seq = record.getReadBases()
            alignment.qual = record.qualityScores
            alignment.tagDict = record.tags
            alignment.readName = record.readName

            // TODO -- cigar encoded in tag?
            // BamUtils.bam_tag2cigar(ba, blockEnd, p, lseq, alignment, cigarArray);

            makeBlocks(record, alignment)

            if (alignment.mate && alignment.start > alignment.mate.position && alignment.fragmentLength > 0) {
                alignment.fragmentLength = -alignment.fragmentLength
            }

            BamUtils.setPairOrientation(alignment)

            return alignment

        }

        function makeBlocks(cramRecord: CramRecord, alignment: any): void {

            const blocks: any[] = []
            let insertions: any[] | undefined
            let gaps: any[] | undefined
            let basesUsed: number = 0
            let cigarString: string = ''

            alignment.scStart = alignment.start
            alignment.scLengthOnRef = alignment.lengthOnRef

            if (cramRecord.readFeatures) {

                for (let feature of cramRecord.readFeatures) {

                    const code: string = feature.code
                    const data: any = feature.data
                    const readPos: number = feature.pos - 1
                    const refPos: number = feature.refPos - 1

                    switch (code) {
                        case 'S' :
                        case 'I':
                        case 'i':
                        case 'N':
                        case 'D':
                            if (readPos > basesUsed) {
                                const len: number = readPos - basesUsed
                                blocks.push(new AlignmentBlock({
                                    start: refPos - len,
                                    seqOffset: basesUsed,
                                    len: len,
                                    type: 'M'
                                }))
                                basesUsed += len
                                cigarString += len + 'M'
                            }

                            if ('S' === code) {
                                let scPos: number = refPos
                                alignment.scLengthOnRef += data.length
                                if (readPos === 0) {
                                    alignment.scStart -= data.length
                                    scPos -= data.length
                                }
                                const len: number = data.length
                                blocks.push(new AlignmentBlock({
                                    start: scPos,
                                    seqOffset: basesUsed,
                                    len: len,
                                    type: 'S'
                                }))
                                basesUsed += len
                                cigarString += len + code
                            } else if ('I' === code || 'i' === code) {
                                if (insertions === undefined) {
                                    insertions = []
                                }
                                const len: number = 'i' === code ? 1 : data.length
                                insertions.push(new AlignmentBlock({
                                    start: refPos,
                                    len: len,
                                    seqOffset: basesUsed,
                                    type: 'I'
                                }))
                                basesUsed += len
                                cigarString += len + code
                            } else if ('D' === code || 'N' === code) {
                                if (!gaps) {
                                    gaps = []
                                }
                                gaps.push({
                                    start: refPos,
                                    len: data,
                                    type: code
                                })
                                cigarString += data + code
                            }
                            break

                        case 'H':
                        case 'P':
                            cigarString += data + code
                            break
                        default :
                        //  Ignore
                    }
                }
            }

            // Last block
            const len: number = cramRecord.readLength - basesUsed
            if (len > 0) {
                blocks.push(new AlignmentBlock({
                    start: cramRecord.alignmentStart + cramRecord.lengthOnRef - len - 1,
                    seqOffset: basesUsed,
                    len: len,
                    type: 'M'
                }))

                cigarString += len + 'M'
            }

            alignment.blocks = blocks
            alignment.insertions = insertions
            alignment.gaps = gaps
            alignment.cigar = cigarString

        }

    }
}


export default CramReader


