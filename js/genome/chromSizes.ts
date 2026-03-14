import {BGZip, igvxhr, StringUtils} from "../../node_modules/igv-utils/src/index"
import Chromosome from "./chromosome"
import {isDataURL} from "../util/igvUtils"

const splitLines = StringUtils.splitLines

/**
 * Represents a reference object created from a ChromSizes file.  This is unusual, primarily for testing.
 */
class ChromSizes {

    #chromosomeNames: string[] | undefined
    chromosomes: Map<string, Chromosome> = new Map()
    url: string

    constructor(url: string) {
        this.url = url
    }

    async init(): Promise<void> {
        return this.loadAll()
    }

    getSequenceRecord(chr: string): Chromosome | undefined {
        return this.chromosomes.get(chr)
    }

    get chromosomeNames(): string[] | undefined {
        if(!this.#chromosomeNames) {
            this.#chromosomeNames = Array.from(this.chromosomes.keys())
        }
        return this.#chromosomeNames
    }

    async getSequence(chr: string, start: number, end: number): Promise<null> {
        return null // TODO -- return array of "N"s?
    }

    async loadAll(): Promise<void> {

        let data: string
        if (isDataURL(this.url)) {
            let bytes = BGZip.decodeDataURI(this.url)
            data = ""
            for (let b of bytes) {
                data += String.fromCharCode(b)
            }
        } else {
            data = await igvxhr.load(this.url, {})
        }

        const lines = splitLines(data)
        let order = 0
        for (let nextLine of lines) {
            const tokens = nextLine.split('\t')
            if(tokens.length > 1) {
                const chrLength = Number.parseInt(tokens[1])
                const chromosome = new Chromosome(tokens[0], order++, chrLength)
                this.chromosomes.set(tokens[0], chromosome)
            }
        }
    }

}

async function loadChromSizes(url: string): Promise<Map<string, Chromosome>> {

    const chromosomeSizes = new Map<string, Chromosome>();

    let data: string
    if (isDataURL(url)) {
        let bytes = BGZip.decodeDataURI(url)
        data = ""
        for (let b of bytes) {
            data += String.fromCharCode(b)
        }
    } else {
        data = await igvxhr.load(url, {})
    }

    const lines = splitLines(data)
    let order = 0
    for (let nextLine of lines) {
        const tokens = nextLine.split('\t')
        if(tokens.length > 1) {
            const chrLength = Number.parseInt(tokens[1])
            chromosomeSizes.set(tokens[0], new Chromosome(tokens[0], order++, chrLength))
        }
    }
    return chromosomeSizes
}


export default ChromSizes
export {loadChromSizes}
