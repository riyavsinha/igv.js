interface Feature {
    start: number
    end: number
    [key: string]: any
}

interface GetFeaturesParams {
    chr: string
    start: number
    end: number
    bpPerPixel?: number
    visibilityWindow?: number
}

export interface BaseFeatureSourceGenome {
    getChromosome(chr: string): { bpLength: number } | undefined
    chromosomeNames?: string[]
    getChromosomeName?(chr: string): string
    getGenomeCoordinate?(chr: string, pos: number): number | undefined
    wgChromosomeNames?: string[]
    getSequenceInterval?(chr: string, start: number, end: number): unknown
}

// Base class for feature sources.  Subclasses must implement getFeatures().
class BaseFeatureSource {
    genome: BaseFeatureSourceGenome

    constructor(genome: BaseFeatureSourceGenome) {
        this.genome = genome
    }


    // Return the next feature whose start is > position.
    async nextFeature(chr: string, position: number, direction: boolean, visibilityWindow?: number): Promise<Feature | undefined> {

        let chromosomeNames: string[] = this.genome.chromosomeNames || [chr]
        let idx = chromosomeNames.indexOf(chr)
        if (idx < 0) return // This shouldn't happen

        // Look ahead (or behind) in 10 kb intervals, but no further than visibilityWindow
        const window = Math.min(10000, visibilityWindow || 10000)
        let queryStart = direction ? position : Math.max(position - window, 0)
        while (idx < chromosomeNames.length && idx >= 0) {
            chr = chromosomeNames[idx]
            const chromosome = this.genome.getChromosome(chr)
            const chromosomeEnd = chromosome!.bpLength
            while (queryStart < chromosomeEnd && queryStart >= 0) {
                let queryEnd = direction ? queryStart + window : Math.min(position, queryStart + window)
                const featureList: Feature[] | undefined = await this.getFeatures({chr, start: queryStart, end: queryEnd, visibilityWindow})
                if (featureList) {

                    const compare = (o1: Feature, o2: Feature): number => o1.start - o2.start + o1.end - o2.end
                    const sortedList = Array.from(featureList)
                    sortedList.sort(compare)

                    // Search for next or previous feature relative to centers.  We use a linear search because the
                    // feature is likely to be near the first or end of the list
                    let searchIdx = direction ? 0 : sortedList.length - 1
                    while (searchIdx >= 0 && searchIdx < sortedList.length) {
                        const f = sortedList[searchIdx]
                        const center = (f.start + f.end) / 2
                        if (direction) {
                            if (center > position) return f
                            searchIdx++
                        } else {
                            if (center < position) return f
                            searchIdx--
                        }
                    }
                }
                queryStart = direction ? queryEnd : queryStart - window
            }
            if (direction) {
                idx++
                queryStart = 0
                position = 0
            } else {
                idx--
                if (idx < 0) break
                const prevChromosome = this.genome.getChromosome(chromosomeNames[idx])
                position = prevChromosome!.bpLength
                queryStart = position - window
            }
        }
    }

    // Subclasses must implement
    async getFeatures(_params: GetFeaturesParams): Promise<Feature[] | undefined> {
        throw new Error("getFeatures not implemented")
    }
}

export default BaseFeatureSource
