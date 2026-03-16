import {Cytoband} from "./cytoband"
import BWSource from "../bigwig/bwSource"
import type Genome from "./genome.js"
import type {GenomeConfig} from "../types/genome.js"
import type {GenomicFeature} from "../types/feature.js"

class CytobandFileBB {

    cytobandMap: Map<string, Cytoband[]> = new Map()
    source: BWSource

    constructor(url: string, config: GenomeConfig, genome: Genome) {
        config = config || {}
        config.url = url
        this.source = new BWSource(config, genome)
    }

    async getCytobands(chr: string): Promise<Cytoband[]> {

        if (this.cytobandMap.has(chr)) {
            return this.cytobandMap.get(chr)!
        } else {
            let cytobands = await this.#readCytobands(chr)
            if (!cytobands) cytobands = []  // Prevent loading again
            this.cytobandMap.set(chr, cytobands)
            return cytobands
        }
    }

    async #readCytobands(chr: string): Promise<Cytoband[]> {
        const features = await this.source.getFeatures({chr, start: 0, end: Number.MAX_SAFE_INTEGER, bpPerPixel: 1})
        return features.map((f: GenomicFeature) => new Cytoband(f.start, f.end, f.name!, f.gieStain))
    }
}

export default CytobandFileBB
