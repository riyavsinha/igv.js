import GenomicInterval from "./genomicInterval"

class SequenceInterval extends GenomicInterval {
    features: string | null

    constructor(chr: string, start: number, end: number, features: string | null) {
        super(chr, start, end, features)
        this.features = features
    }

    getSequence(start: number, end: number): string | null {
        if (start < this.start || end > this.end) {
            return null
        }
        const offset = start - this.start
        const n = end - start
        const seq = this.features ? this.features.substring(offset, offset + n) : null
        return seq
    }

    hasSequence(start: number, end: number): boolean {
        return start >= this.start && end <= this.end
    }

}

export default SequenceInterval