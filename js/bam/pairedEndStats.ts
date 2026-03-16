interface PairedEndStatsOptions {
    minTLENPercentile?: number
    maxTLENPercentile?: number
}

interface PairedAlignment {
    isProperPair(): boolean
    fragmentLength: number
    pairOrientation: string
}

class PairedEndStats {
    totalCount: number
    frCount: number
    rfCount: number
    ffCount: number
    sumF: number
    sumF2: number
    lp: number
    up: number
    isizes: number[]
    orienation?: string  // NOTE: typo preserved from original ("orienation" not "orientation")
    minTLEN?: number
    maxTLEN?: number

    constructor(alignments: PairedAlignment[], {minTLENPercentile, maxTLENPercentile}: PairedEndStatsOptions) {
        this.totalCount = 0
        this.frCount = 0
        this.rfCount = 0
        this.ffCount = 0
        this.sumF = 0
        this.sumF2 = 0
        this.lp = minTLENPercentile === undefined ? 0.1 : minTLENPercentile
        this.up = maxTLENPercentile === undefined ? 99.5 : maxTLENPercentile
        this.isizes = []
        this.compute(alignments)
    }

    compute(alignments: PairedAlignment[]): void {

        for (let alignment of alignments) {
            if (alignment.isProperPair()) {
                const tlen = Math.abs(alignment.fragmentLength)
                this.sumF += tlen
                this.sumF2 += tlen * tlen
                this.isizes.push(tlen)

                const po = alignment.pairOrientation

                if (typeof po === "string" && po.length === 4) {
                    const tmp = '' + po.charAt(0) + po.charAt(2)
                    switch (tmp) {
                        case 'FF':
                        case 'RR':
                            this.ffCount++
                            break
                        case "FR":
                            this.frCount++
                            break
                        case "RF":
                            this.rfCount++
                    }
                }
                this.totalCount++
            }
        }

        if (this.ffCount / this.totalCount > 0.9) this.orienation = "ff"
        else if (this.frCount / this.totalCount > 0.9) this.orienation = "fr"
        else if (this.rfCount / this.totalCount > 0.9) this.orienation = "rf"

        this.minTLEN = this.lp === 0 ? 0 : percentile(this.isizes, this.lp)
        this.maxTLEN = percentile(this.isizes, this.up)
    }
}

function percentile(array: number[], p: number): number | undefined {

    if (array.length === 0) return undefined
    const k = Math.floor(array.length * (p / 100))
    array.sort(function (a: number, b: number): number {
        return a - b
    })
    return array[k]

}

export default PairedEndStats
