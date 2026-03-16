// Represents a BAM or Tabix index.

import BinaryParser from "../binary"
import {optimizeChunks, Chunk, VirtualOffset} from "./indexUtils"

const BAI_MAGIC = 21578050
const TABIX_MAGIC = 21578324

interface BinIndex {
    [binNumber: number]: [VirtualOffset, VirtualOffset][]
}

interface RefIndex {
    binIndex: BinIndex
    linearIndex: (VirtualOffset | null)[]
}

async function parseBamIndex(arrayBuffer: ArrayBuffer): Promise<BamIndex> {
    const index = new BamIndex()
    await index.parse(arrayBuffer, false)
    return index
}

async function parseTabixIndex(arrayBuffer: ArrayBuffer): Promise<BamIndex> {
    const index = new BamIndex()
    await index.parse(arrayBuffer, true)
    return index
}

class BamIndex {

    firstBlockPosition!: number
    lastBlockPosition!: number
    indices!: (RefIndex | undefined)[]
    sequenceIndexMap!: Record<string, number>
    tabix!: boolean

    constructor() {

    }

    async parse(arrayBuffer: ArrayBuffer, tabix: boolean): Promise<void> {

        const indices: (RefIndex | undefined)[] = []
        let blockMin = Number.MAX_SAFE_INTEGER
        let blockMax = 0
        const seqNames: string[] = []

        const parser = new BinaryParser(new DataView(arrayBuffer))
        const magic = parser.getInt()
        const sequenceIndexMap: Record<string, number> = {}
        if (magic === BAI_MAGIC || (tabix && magic === TABIX_MAGIC)) {

            const nref = parser.getInt()
            if (tabix) {
                // Tabix header parameters aren't used, but they must be read to advance the pointer
                const format = parser.getInt()
                const col_seq = parser.getInt()
                const col_beg = parser.getInt()
                const col_end = parser.getInt()
                const meta = parser.getInt()
                const skip = parser.getInt()
                const l_nm = parser.getInt()

                for (let i = 0; i < nref; i++) {
                    let seq_name = parser.getString()
                    sequenceIndexMap[seq_name] = i
                    seqNames[i] = seq_name
                }
            }

            // Loop through sequences
            for (let ref = 0; ref < nref; ref++) {

                const binIndex: BinIndex = {}
                const linearIndex: (VirtualOffset | null)[] = []
                const nbin = parser.getInt()

                for (let b = 0; b < nbin; b++) {
                    const binNumber = parser.getInt()
                    if (binNumber === 37450) {
                        // This is a psuedo bin, not used but we have to consume the bytes
                        const nchnk = parser.getInt() // # of chunks for this bin
                        const cs = parser.getVPointer()   // unmapped beg
                        const ce = parser.getVPointer()   // unmapped end
                        const n_maped = parser.getLong()
                        const nUnmapped = parser.getLong()

                    } else {

                        binIndex[binNumber] = []
                        const nchnk = parser.getInt() // # of chunks for this bin

                        for (let i = 0; i < nchnk; i++) {
                            const cs = parser.getVPointer()    //chunk_beg
                            const ce = parser.getVPointer()    //chunk_end
                            if (cs && ce) {
                                if (cs.block < blockMin) {
                                    blockMin = cs.block    // Block containing first alignment
                                }
                                if (ce.block > blockMax) {
                                    blockMax = ce.block
                                }
                                binIndex[binNumber].push([cs, ce])
                            }
                        }
                    }
                }

                const nintv = parser.getInt()
                for (let i = 0; i < nintv; i++) {
                    const cs = parser.getVPointer()
                    linearIndex.push(cs)   // Might be null
                }

                if (nbin > 0) {
                    indices[ref] = {
                        binIndex: binIndex,
                        linearIndex: linearIndex
                    }
                }
            }

            this.firstBlockPosition = blockMin
            this.lastBlockPosition = blockMax
            this.indices = indices
            this.sequenceIndexMap = sequenceIndexMap
            this.tabix = tabix

        } else {
            // BUG: 'indexURL' is referenced in the original code but never declared or passed as a parameter.
            throw new Error("Not a valid " + (tabix ? "tabix" : "bai") + " file")
        }


    }

    get sequenceNames(): string[] {
        return Object.keys(this.sequenceIndexMap)
    }

    /**
     * Fetch chunks for a particular genomic range.  This method is public so it can be unit-tested.
     *
     * @param refId  the sequence dictionary index of the chromosome
     * @param min  genomic start position
     * @param max  genomic end position
     * @returns an array of objects representing chunks (file spans)
     */
    chunksForRange(refId: number, min: number, max: number): Chunk[] {

        const ba = this.indices[refId]

        if (!ba) {
            return []
        } else {
            const overlappingBins = reg2bins(min, max)        // List of bin #s that overlap min, max

            const chunks: Chunk[] = []
            // Find chunks in overlapping bins.  Leaf bins (< 4681) are not pruned
            for (let binRange of overlappingBins) {
                for (let bin = binRange[0]; bin <= binRange[1]; bin++) {
                    if (ba.binIndex[bin]) {
                        const binChunks = ba.binIndex[bin]
                        for (let c of binChunks) {
                            const cs = c[0]
                            const ce = c[1]
                            chunks.push({minv: cs, maxv: ce})
                        }
                    }
                }
            }

            // Use the linear index to find minimum file position of chunks that could contain alignments in the region
            const nintv = ba.linearIndex.length

            let lowest: VirtualOffset | undefined
            const minLin = Math.min(min >> 14, nintv - 1)    // i.e. min / 16384
            const maxLin = Math.min(max >> 14, nintv - 1)
            for (let i = minLin; i <= maxLin; i++) {
                const vp = ba.linearIndex[i]
                if (vp) {
                    lowest = vp       // lowest file offset that contains alignments overlapping (min, max)
                    break
                }
            }

            return optimizeChunks(chunks, lowest)
        }
    }
}



/**
 * Calculate the list of bins that overlap with region [beg, end]
 *
 */
function reg2bins(beg: number, end: number): number[][] {
    // NOTE: variable 'i' is declared const but never used -- could be removed
    const i = 0
    let k: number
    const list: number[][] = []
    if (end >= 1 << 29) end = 1 << 29
    --end
    list.push([0, 0])
    list.push([1 + (beg >> 26), 1 + (end >> 26)])
    list.push([9 + (beg >> 23), 9 + (end >> 23)])
    list.push([73 + (beg >> 20), 73 + (end >> 20)])
    list.push([585 + (beg >> 17), 585 + (end >> 17)])
    list.push([4681 + (beg >> 14), 4681 + (end >> 14)])

    return list
}

export {parseTabixIndex, parseBamIndex}
