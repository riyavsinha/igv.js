/**
 * Created by jrobinso on 4/5/18.
 */

interface AlignmentBlockInit {
    start?: number
    seqOffset?: number
    len?: number
    type?: string
    [key: string]: any
}

/**
 * Expected properties
 *   start: genomic position
 *   seqOffset: index offset to read sequence for this block's sequence
 *   len: length of block
 *   type: from CIGAR string (S, I, M, ...)
 */

class AlignmentBlock {
    start!: number
    seqOffset!: number
    len!: number
    type!: string;
    [key: string]: any

    constructor(b?: AlignmentBlockInit) {
        if (b) {
            Object.assign(this, b)
        }
    }

    seqIndexAt(genomicLocation: number): number {
        return Math.floor(genomicLocation) - this.start + this.seqOffset
    }
}

export default AlignmentBlock
