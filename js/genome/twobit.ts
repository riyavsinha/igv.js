/**
 * Note: Some portions of this code adapated from the GMOD two-bit.js project, @Copyright (c) 2017 Robert Buels
 * * https://github.com/GMOD/twobit-js/blob/master/src/twoBitFile.ts*
 */


import {igvxhr} from "../../node_modules/igv-utils/src/index.js"
import BinaryParser from "../binary"
import BPTree from "../bigwig/bpTree"

const twoBit: string[] = ['T', 'C', 'A', 'G']
const byteTo4Bases: string[] = []
for (let i = 0; i < 256; i++) {
    byteTo4Bases.push(
        twoBit[(i >> 6) & 3] +
        twoBit[(i >> 4) & 3] +
        twoBit[(i >> 2) & 3] +
        twoBit[i & 3],
    )
}
const maskedByteTo4Bases: string[] = byteTo4Bases.map(bases => bases.toLowerCase())

interface TwobitIndex {
    search(name: string): Promise<{ offset: number } | undefined> | Promise<any>
}

interface SequenceRecordMeta {
    dnaSize: number
    nBlocks: Block[]
    maskBlocks: Block[]
    packedPos: number
    bpLength: number
}

class TwobitSequence {

    littleEndian: boolean | undefined
    metaIndex: Map<string, SequenceRecordMeta> = new Map()
    chromosomeNames: string[] | undefined
    url: string
    config: any
    bptURL: string | undefined
    index: TwobitIndex | undefined
    version: number | undefined
    sequenceCount: number | undefined
    reserved: number | undefined

    constructor(config: any) {
        this.url = config.twoBitURL || config.fastaURL
        this.config = config
        if(config.twoBitBptURL) {
            this.bptURL = config.twoBitBptURL
        }
     }

    async init(): Promise<void> {
        if(this.bptURL) {
            this.index = await BPTree.loadBpTree(this.bptURL, this.config, 0, undefined)
        } else {
            const idx: Map<string, number> = await this._readIndex()
            this.index = {
                search: async (name: string): Promise<{ offset: number } | undefined> =>  {
                    return idx.has(name) ? {offset: idx.get(name)!} : undefined
                }
            }
        }
    }

    async readSequence(seqName: string, regionStart: number, regionEnd?: number): Promise<string | null> {

        if (!this.index) {
            await this.init()
        }

        const record: SequenceRecordMeta | undefined = await this.getSequenceRecord(seqName)
        if (!record) {
            return null
        }

        if (regionStart < 0) {
            throw new TypeError('regionStart cannot be less than 0')
        }
        // end defaults to the end of the sequence
        if (regionEnd === undefined || regionEnd > record.dnaSize) {
            regionEnd = record.dnaSize
        }

        const nBlocks: Block[] = this._getOverlappingBlocks(
            regionStart,
            regionEnd,
            record.nBlocks
        )
        const maskBlocks: Block[] = this._getOverlappingBlocks(
            regionStart,
            regionEnd,
            record.maskBlocks
        )

        const baseBytesOffset: number = Math.floor(regionStart / 4)
        const start: number = record.packedPos + baseBytesOffset
        const size: number = Math.floor(regionEnd / 4) - baseBytesOffset + 1

        const baseBytesArrayBuffer: ArrayBuffer = await igvxhr.loadArrayBuffer(this.url, {range: {start, size}})
        const baseBytes: Uint8Array = new Uint8Array(baseBytesArrayBuffer)

        let sequenceBases = ''
        for (let genomicPosition = regionStart; genomicPosition < regionEnd; genomicPosition += 1) {

            // function checks if  we are currently masked

            while (maskBlocks.length && maskBlocks[0].end <= genomicPosition) {
                maskBlocks.shift()
            }
            const baseIsMasked: boolean = !!(maskBlocks[0] && maskBlocks[0].start <= genomicPosition && maskBlocks[0].end > genomicPosition)


            // process the N block if we have one.  Masked "N" ("n")  is not supported
            if (nBlocks[0] && genomicPosition >= nBlocks[0].start && genomicPosition < nBlocks[0].end) {
                const currentNBlock: Block = nBlocks.shift()!
                while (genomicPosition < currentNBlock.end && genomicPosition < regionEnd) {
                    sequenceBases += 'N'
                    genomicPosition++
                }
                genomicPosition--
            } else {
                const bytePosition: number = Math.floor(genomicPosition / 4) - baseBytesOffset
                const subPosition: number = genomicPosition % 4
                const byte: number = baseBytes[bytePosition]

                sequenceBases += baseIsMasked
                    ? maskedByteTo4Bases[byte][subPosition]
                    : byteTo4Bases[byte][subPosition]

            }
        }
        return sequenceBases
    }

    /**
     * Read the internal index of the 2bit file.  This is a list of sequence names and their offsets in the file.
     *
     * @returns {Promise<Map<string, number>>}
     * @private
     */
    async _readIndex(): Promise<Map<string, number>> {

        const index: Map<string, number> = new Map()
        this.chromosomeNames = []

        const loadRange = {start: 0, size: 64}
        let arrayBuffer: ArrayBuffer = await igvxhr.loadArrayBuffer(this.url, {range: loadRange})
        let dataView: DataView = new DataView(arrayBuffer)

        let ptr = 0
        const magicLE: number = dataView.getUint32(ptr, true)
        const magicBE: number = dataView.getUint32(ptr, false)
        ptr += 4

        const magic = 0x1A412743
        if (magicLE === magic) {
            this.littleEndian = true
        } else if (magicBE === magic) {
            this.littleEndian = false
        } else {
            throw Error(`Bad magic number ${magic}`)
        }

        this.version = dataView.getUint32(ptr, this.littleEndian)
        ptr += 4

        this.sequenceCount = dataView.getUint32(ptr, this.littleEndian)
        ptr += 4

        this.reserved = dataView.getUint32(ptr, this.littleEndian)
        ptr += 4

        // Loop through sequences loading name and file offset.  We don't know the precise size in bytes in advance.
        let estSize: number
        let binaryBuffer: BinaryParser | undefined

        let estNameLength = 20
        for (let i = 0; i < this.sequenceCount; i++) {

            if (!binaryBuffer || binaryBuffer.available() < 1) {
                estSize = (this.sequenceCount - i) * estNameLength
                binaryBuffer = await this._loadBinaryBuffer(ptr, estSize)
            }
            const len: number = binaryBuffer.getByte()
            ptr += 1

            if (binaryBuffer.available() < len + 5) {
                estSize = (this.sequenceCount - i) * estNameLength + 100
                binaryBuffer = await this._loadBinaryBuffer(ptr, estSize)
            }
            const name: string = binaryBuffer.getString(len)
            const offset: number = binaryBuffer.getUInt()
            ptr += len + 4
            index.set(name, offset)

            estNameLength = Math.floor(estNameLength * (i / (i + 1)) + name.length / (i + 1))

            this.chromosomeNames.push(name)
        }
        return index
    }

    /**
     * Fetch the sequence metadata for the given seq name *
     *
     * @param seqName
     * @returns {Promise<SequenceRecordMeta | undefined>}
     */
    async getSequenceRecord(seqName: string): Promise<SequenceRecordMeta | undefined> {

        if (!this.metaIndex.has(seqName)) {

            if (!this.index) {
                throw Error("TwobitSequence object must be initialized before accessing sequence")
            }

            let result: { offset: number } | undefined = await this.index.search(seqName)
            if (!result) {
                return
            }
            let offset: number = result.offset

            // Read size of dna data & # of "N" blocks
            let size = 8
            let binaryBuffer: BinaryParser = await this._loadBinaryBuffer(offset, size)
            const dnaSize: number = binaryBuffer.getUInt()
            const nBlockCount: number = binaryBuffer.getUInt()
            offset += size

            // Read "N" blocks and # of mask blocks
            size = nBlockCount * (4 + 4) + 4
            binaryBuffer = await this._loadBinaryBuffer(offset, size)
            const nBlockStarts: number[] = []
            for (let i = 0; i < nBlockCount; i++) {
                nBlockStarts.push(binaryBuffer.getUInt())
            }
            const nBlockSizes: number[] = []
            for (let i = 0; i < nBlockCount; i++) {
                nBlockSizes.push(binaryBuffer.getUInt())
            }
            const maskBlockCount: number = binaryBuffer.getUInt()
            offset += size

            // Read "mask" blocks
            size = maskBlockCount * (4 + 4) + 4
            binaryBuffer = await this._loadBinaryBuffer(offset, size)
            const maskBlockStarts: number[] = []
            for (let i = 0; i < maskBlockCount; i++) {
                maskBlockStarts.push(binaryBuffer.getUInt())
            }
            const maskBlockSizes: number[] = []
            for (let i = 0; i < maskBlockCount; i++) {
                maskBlockSizes.push(binaryBuffer.getUInt())
            }

            //Transform "N" and "mask" block data into something more useful
            const nBlocks: Block[] = []
            for (let i = 0; i < nBlockCount; i++) {
                nBlocks.push(new Block(nBlockStarts[i], nBlockSizes[i]))
            }
            const maskBlocks: Block[] = []
            for (let i = 0; i < maskBlockCount; i++) {
                maskBlocks.push(new Block(maskBlockStarts[i], maskBlockSizes[i]))
            }

            const reserved: number = binaryBuffer.getUInt()
            if (reserved != 0) {
                throw Error("Bad 2-bit file")
            }
            offset += size
            const packedPos: number = offset

            const meta: SequenceRecordMeta = {
                dnaSize,
                nBlocks,
                maskBlocks,
                packedPos,
                bpLength: dnaSize
            }
            this.metaIndex.set(seqName, meta)


        }
        return this.metaIndex.get(seqName)
    }

    /**
     * Return blocks overlapping the genome region [start, end]
     *
     * TODO -- optimize this, currently it uses linear search
     * * *
     * @param start
     * @param end
     * @param blocks
     * @returns {Block[]}
     * @private
     */
    _getOverlappingBlocks(start: number, end: number, blocks: Block[]): Block[] {

        const overlappingBlocks: Block[] = []
        for (let block of blocks) {
            if (block.start > end) {
                break
            } else if (block.end < start) {
                continue
            } else {
                overlappingBlocks.push(block)
            }
        }
        return overlappingBlocks
    }

    async _loadBinaryBuffer(start: number, size: number): Promise<BinaryParser> {
        const arrayBuffer: ArrayBuffer = await igvxhr.loadArrayBuffer(this.url, {range: {start, size}})
        return new BinaryParser(new DataView(arrayBuffer), this.littleEndian)
    }
}

class Block {

    start: number
    size: number

    constructor(start: number, size: number) {
        this.start = start
        this.size = size
    }

    get end(): number {
        return this.start + this.size

    }
}


export default TwobitSequence
