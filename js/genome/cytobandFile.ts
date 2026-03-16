import {buildOptions, isDataURL} from "../util/igvUtils"
import {BGZip, igvxhr, StringUtils} from "../../node_modules/igv-utils/src/index"
import {Cytoband} from "./cytoband"
import Chromosome from "./chromosome"
import type {GenomeConfig} from "../types/genome.js"

class CytobandFile {

    cytobands: Map<string, Cytoband[]> = new Map()
    url: string
    config: GenomeConfig

    constructor(url: string, config: GenomeConfig) {
        this.url = url;
        this.config = config;
    }

    async getCytobands(chr: string): Promise<Cytoband[] | undefined> {
        if(this.cytobands.size === 0) {
            await this.#loadCytobands()
        }
        return this.cytobands.get(chr)
    }


    /**
     * Load a UCSC bigbed cytoband file. Features are in bed+4 format.
     * {
     *   "chr": "chr1",
     *   "start": 0,
     *   "end": 1735965,
     *   "name": "p36.33",
     *   "gieStain": "gneg"
     * }
     * @returns {Promise<*[]>}
     */
    async #loadCytobands(): Promise<void> {

        let data: string
        if (isDataURL(this.url)) {
            const plain = BGZip.decodeDataURI(this.url)
            data = ""
            const len = plain.length
            for (let i = 0; i < len; i++) {
                data += String.fromCharCode(plain[i])
            }
        } else {
            data = await igvxhr.loadString(this.url, buildOptions(this.config))
        }

        let lastChr: string | undefined
        let bands: Cytoband[] = []
        const lines: string[] = StringUtils.splitLines(data)
        for (let line of lines) {

            const tokens = line.split("\t")
            const chrName = tokens[0]
            if (!lastChr) lastChr = chrName

            if (chrName !== lastChr) {
                this.cytobands.set(lastChr, bands)
                bands = []
                lastChr = chrName
            }

            if (tokens.length === 5) {
                //10	0	3000000	p15.3	gneg
                const start = parseInt(tokens[1])
                const end = parseInt(tokens[2])
                const name = tokens[3]
                const stain = tokens[4]
                bands.push(new Cytoband(start, end, name, stain))
            }
        }
        if(bands.length > 0) {
            this.cytobands.set(lastChr!, bands)
        }

    }

}

export default CytobandFile
