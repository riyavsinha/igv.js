class GenomicInterval {
    chr: string
    start: number
    end: number
    features: unknown

    constructor(chr: string, start: number, end: number, features: unknown) {
        this.chr = chr
        this.start = start
        this.end = end
        this.features = features
    }

    contains(chr: string, start: number, end: number): boolean {
        return this.chr === chr &&
            this.start <= start &&
            this.end >= end
    }

    containsRange(range: {chr: string, start: number, end: number}): boolean {
        return this.chr === range.chr &&
            this.start <= range.start &&
            this.end >= range.end
    }

    get locusString(): string {
        return `${this.chr}:${this.start + 1}-${this.end}`
    }
}

export default GenomicInterval