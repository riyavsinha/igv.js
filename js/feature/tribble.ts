import BinaryParser from "../binary"

const SEQUENCE_DICTIONARY_FLAG: number = 0x8000  // if we have a sequence dictionary in our header

interface Block {
    min: number
    max: number
}

interface ChrIndex {
    chr: string
    blocks: Block[]
    longestFeature: number
    binWidth: number
}

interface MergedBlock {
    minv: { block: number; offset: number }
    maxv: { block: number; offset: number }
}

async function parseTribbleIndex(arrayBuffer: ArrayBuffer): Promise<TribbleIndex> {

    const index = new TribbleIndex()
    index.parse(arrayBuffer)
    return index
}

class TribbleIndex {

    tribble: boolean
    chrIndex: Record<string, ChrIndex>
    lastBlockPosition: number

    constructor() {
        this.tribble = true
        this.chrIndex = {}
        this.lastBlockPosition = 0
    }

    async parse(arrayBuffer: ArrayBuffer): Promise<void> {

        let blockMax: number = 0
        this.chrIndex = {}
        this.lastBlockPosition = 0
        const parser = new BinaryParser(new DataView(arrayBuffer))
        readHeader(parser)

        let nChrs: number = parser.getInt()
        while (nChrs-- > 0) {

            // todo -- support interval tree index, we're assuming its a linear index

            let chr: string = parser.getString()
            const binWidth: number = parser.getInt()
            const nBins: number = parser.getInt()
            const longestFeature: number = parser.getInt()
            const OLD_V3_INDEX: boolean = parser.getInt() > 0
            const nFeatures: number = parser.getInt()

            // note the code below accounts for > 60% of the total time to read an index
            let pos: number = parser.getLong()
            const blocks: Block[] = []
            for (let binNumber = 0; binNumber < nBins; binNumber++) {
                const nextPos: number = parser.getLong()
                const size: number = nextPos - pos
                blocks.push({min: pos, max: nextPos}) //        {position: pos, size: size});
                pos = nextPos
                if (nextPos > blockMax) {
                    blockMax = nextPos
                }
            }
            this.chrIndex[chr] = {chr: chr, blocks: blocks, longestFeature: longestFeature, binWidth: binWidth}
        }

        this.lastBlockPosition = blockMax


        /**
         * Read the header .   Data here is not used in igv.js but we need to read it to advance the pointer.
         * @param parser
         */
        function readHeader(parser: BinaryParser): void {

            const magicNumber: number = parser.getInt()     //   view._getInt32(offset += 32, true);
            const type: number = parser.getInt()
            const version: number = parser.getInt()
            const indexedFile: string = parser.getString()
            const indexedFileSize: number = parser.getLong()
            const indexedFileTS: number = parser.getLong()
            const indexedFileMD5: string = parser.getString()
            const flags: number = parser.getInt()
            if (version < 3 && (flags & SEQUENCE_DICTIONARY_FLAG) === SEQUENCE_DICTIONARY_FLAG) {
                // readSequenceDictionary(dis);
            }
            if (version >= 3) {
                let nProperties: number = parser.getInt()
                while (nProperties-- > 0) {
                    const key: string = parser.getString()
                    const value: string = parser.getString()
                }
            }
        }
    }

    get sequenceNames(): string[] {
        return Object.keys(this.chrIndex)
    }


    /**
     * Fetch blocks for a particular genomic range.
     *
     * @param queryChr
     * @param min  genomic start position
     * @param max  genomic end position
     */
    chunksForRange(queryChr: string, min: number, max: number): MergedBlock[] | undefined { //function (refId, min, max) {

        const chrIdx = this.chrIndex[queryChr]

        if (chrIdx) {
            const blocks = chrIdx.blocks
            const longestFeature = chrIdx.longestFeature
            const binWidth = chrIdx.binWidth
            const adjustedPosition: number = Math.max(min - longestFeature, 0)
            const startBinNumber: number = Math.floor(adjustedPosition / binWidth)

            if (startBinNumber >= blocks.length) // are we off the end of the bin list, so return nothing
                return []
            else {
                const endBinNumber: number = Math.min(Math.floor((max - 1) / binWidth), blocks.length - 1)

                // By definition blocks are adjacent in the file for the liner index.  Combine them into one merged block
                const startPos: number = blocks[startBinNumber].min
                const endPos: number = blocks[endBinNumber].max
                const size: number = endPos - startPos
                if (size === 0) {
                    return []
                } else {
                    const mergedBlock: MergedBlock = {minv: {block: startPos, offset: 0}, maxv: {block: endPos, offset: 0}}
                    return [mergedBlock]
                }
            }
        } else {
            return undefined
        }
    }
}

export {parseTribbleIndex}
