import {Cytoband} from "./cytoband"
import BWSource from "../bigwig/bwSource"

class CytobandFileBB {

    cytobandMap: Map<string, Cytoband[]> = new Map()
    source: any

    constructor(url: string, config: any, genome: any) {
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
        const features = await this.source.getFeatures({chr})
        return features.map((f: any) => new Cytoband(f.start, f.end, f.name, f.gieStain))
    }
}

export default CytobandFileBB
