import {StringUtils} from "../../node_modules/igv-utils/src/index.js"
import Chromosome from "./chromosome"
import {loadSequence} from "./loadSequence"
import ChromAliasBB from "./chromAliasBB"
import ChromAliasFile from "./chromAliasFile"
import CytobandFileBB from "./cytobandFileBB"
import CytobandFile from "./cytobandFile"

import {loadChromSizes} from "./chromSizes"
import ChromAliasDefaults from "./chromAliasDefaults"
import {updateReference} from "./updateReference"
import BWSource from "../bigwig/bwSource"
import {Cytoband} from "./cytoband"

const ucsdIDMap: Map<string, string> = new Map([
    ["1kg_ref", "hg18"],
    ["1kg_v37", "hg19"],
    ["b37", "hg19"]
])

/**
 * Common interface for chromosome alias sources (ChromAliasBB, ChromAliasFile, ChromAliasDefaults).
 */
interface ChromAliasSource {
    getChromosomeName(alias: string, keys?: IterableIterator<string>): string
    getChromosomeAlias(chr: string, nameSet: string): string
    search(alias: string): Record<string, string> | undefined | Promise<Record<string, string> | undefined>
    preload(chrNames?: string[]): Promise<void> | void
}

/**
 * Common interface for cytoband sources (CytobandFile, CytobandFileBB).
 */
interface CytobandSource {
    getCytobands(chr: string): Promise<Cytoband[] | undefined>
}

/**
 * The Genome class represents an assembly and consists of the following elements
 *   sequence - Object representing the DNA sequence
 *   chromosomes - Objects with chromosome meta data including name, length, and alternate names (aliases)
 *   aliases - table of chromosome name aliases (optional)
 *   cytobands - cytoband data for drawing an ideogram (optional)
 */

class Genome {

    #wgChromosomeNames: string[] | undefined
    #aliasRecordCache: Map<string, Record<string, string> | undefined> = new Map()

    config: any
    browser: any
    id: string
    ucscID: string
    blatDB: string
    name: string | undefined
    nameSet: string | undefined
    sequence: any
    cytobandSource: CytobandSource | undefined
    chromosomes!: Map<string, Chromosome>
    chromosomeNames: string[] | undefined
    chromAlias: ChromAliasSource | undefined
    wholeGenomeView: boolean | undefined
    cumulativeOffsets: Record<string, number> | undefined
    bpLength: number | undefined
    maneFeatureSource: BWSource | undefined
    rsDBFeatureSource: BWSource | undefined

    static async createGenome(options: any, browser: any): Promise<Genome> {

        updateReference(options)
        const genome = new Genome(options, browser)
        await genome.init()
        return genome
    }

    constructor(config: any, browser: any) {
        this.config = config
        this.browser = browser
        this.id = config.id || generateGenomeID(config)
        this.ucscID = config.ucscID || ucsdIDMap.get(this.id) || this.id
        this.blatDB = config.blatDB || this.ucscID
        this.name = config.name
        this.nameSet = config.nameSet
    }


    async init(): Promise<void> {

        const config = this.config

        // Load sequence
        this.sequence = await loadSequence(config, this.browser)

        // Load cytobands.  This is optional but required to support the ideogram.  Only needed for whole genome view
        if (false !== config.showIdeogram && false !== config.wholeGenomeView) {
            if (config.cytobandURL) {
                this.cytobandSource = new CytobandFile(config.cytobandURL, Object.assign({}, config))
            } else if (config.cytobandBbURL) {
                this.cytobandSource = new CytobandFileBB(config.cytobandBbURL, Object.assign({}, config), this)
            }
        }

        // Search for chromosomes, that is an array of chromosome objects containing name and length.  This is
        // optional but required to support whole genome view.
        if (this.sequence.chromosomes) {
            this.chromosomes = this.sequence.chromosomes
        } else if (config.chromSizesURL) {
            this.chromosomes = await loadChromSizes(config.chromSizesURL)
        } else {
            this.chromosomes = new Map()   // Cache, chromosome are added as they are loaded
        }

        // Search for chromosome names.  This is optional but required to support the chromosome pulldown
        if (this.sequence.chromosomeNames) {
            this.chromosomeNames = this.sequence.chromosomeNames    // Twobit files can supply chromosome names unless they use an external index
        } else if (this.chromosomes.size > 0) {
            this.chromosomeNames = Array.from(this.chromosomes.keys())
        }

        // Chromosome alias
        if (config.chromAliasBbURL) {
            this.chromAlias = new ChromAliasBB(config.chromAliasBbURL, Object.assign({}, config), this)
        } else if (config.aliasURL) {
            this.chromAlias = new ChromAliasFile(config.aliasURL, Object.assign({}, config), this)
        } else if (this.chromosomeNames) {
            this.chromAlias = new ChromAliasDefaults(this.id, this.chromosomeNames)
        }

        if (false !== config.wholeGenomeView && this.chromosomes.size > 0) {
            // Set chromosome order for WG view and chromosome pulldown.  If chromosome order is not specified sort
            if (config.chromosomeOrder) {
                if (Array.isArray(config.chromosomeOrder)) {
                    this.#wgChromosomeNames = config.chromosomeOrder
                } else {
                    this.#wgChromosomeNames = config.chromosomeOrder.split(',').map((nm: string) => nm.trim())
                }
                // Trim to remove non-existent chromosomes
                await this.chromAlias!.preload(this.#wgChromosomeNames!)
                this.#wgChromosomeNames =
                    this.#wgChromosomeNames!.map((c: string) => this.getChromosomeName(c)).filter((c: string) => this.chromosomes.has(c))
            } else {
                this.#wgChromosomeNames = trimSmallChromosomes(this.chromosomes)
                await this.chromAlias!.preload(this.#wgChromosomeNames)
            }
        }

        // Optionally create the psuedo chromosome "all" to support whole genome view
        this.wholeGenomeView = config.wholeGenomeView !== false && !!this.#wgChromosomeNames && this.chromosomes.size > 1
        if (this.wholeGenomeView) {
            const l = this.#wgChromosomeNames!.reduce((accumulator: number, currentValue: string) => accumulator += this.chromosomes.get(currentValue)!.bpLength, 0)
            this.chromosomes.set("all", new Chromosome("all", 0, l))
        }
    }

    get description(): string {
        return this.config.description || `${this.id}\n${this.name}`
    }

    get infoURL(): string | undefined {
        return this.config.infoURL
    }

    showWholeGenomeView(): boolean | undefined {
        return this.wholeGenomeView
    }

    /**
     * Return a json like object representing the current state.  The tracks collection is nullified
     * as tracks are transferred to the browser object on loading.
     *
     * @returns {any}
     */
    toJSON(): any {
        return Object.assign({}, this.config, {tracks: undefined})
    }

    get initialLocus(): string | undefined {
        return this.config.locus ? this.config.locus : this.getHomeChromosomeName()
    }

    getHomeChromosomeName(): string | undefined {
        if (this.showWholeGenomeView() && this.chromosomes.has("all")) {
            return "all"
        } else if (this.chromosomeNames) {
            return this.chromosomeNames[0]
        } else {
            return undefined
        }
    }

    getChromosomeName(chr: string): string {
        return this.chromAlias ? this.chromAlias.getChromosomeName(chr, this.chromosomes.keys()) : chr
    }

    getChromosomeDisplayName(str: string): string {
        if (this.nameSet && this.chromAlias) {
            return this.chromAlias.getChromosomeAlias(str, this.nameSet) || str
        } else {
            return str
        }
    }

    getChromosome(chr: string): Chromosome | undefined {
        if (this.chromAlias) {
            chr = this.chromAlias.getChromosomeName(chr)
        }
        return this.chromosomes.get(chr)
    }

    async loadChromosome(chr: string): Promise<Chromosome | undefined> {

        const chromAliasRecord = await this.getAliasRecord(chr)
        if (chromAliasRecord) {
            chr = chromAliasRecord.chr
        }

        if (!this.chromosomes.has(chr)) {
            let chromosome: Chromosome | undefined
            const sequenceRecord = await this.sequence.getSequenceRecord(chr)
            if (sequenceRecord) {
                chromosome = new Chromosome(chr, 0, sequenceRecord.bpLength)
            }

            this.chromosomes.set(chr, chromosome!)  // <= chromosome might be undefined, setting it prevents future attempts
        }

        return this.chromosomes.get(chr)
    }

    async getAliasRecord(chr: string): Promise<Record<string, string> | undefined> {
        if (this.#aliasRecordCache.has(chr)) {
            return this.#aliasRecordCache.get(chr)
        }
        if (this.chromAlias) {
            let aliasRecord = await this.chromAlias.search(chr)
            if (!aliasRecord && chr !== chr.toLowerCase()) {
                aliasRecord = await this.chromAlias.search(chr.toLowerCase())
            }
            if (aliasRecord) {
                // Add some aliases for case insensitivy
                const upper = aliasRecord.chr.toUpperCase()
                const lower = aliasRecord.chr.toLowerCase()
                const cap = aliasRecord.chr.charAt(0).toUpperCase() + aliasRecord.chr.slice(1)
                if (aliasRecord.chr !== upper) {
                    aliasRecord["_uppercase"] = upper
                }
                if (aliasRecord.chr !== lower) {
                    aliasRecord["_lowercase"] = lower
                }
                if (aliasRecord.chr !== cap) {
                    aliasRecord["_cap"] = cap
                }
            }
            this.#aliasRecordCache.set(chr, aliasRecord)  // Set even if undefined to prevent recurrent searches
            return aliasRecord
        }
    }

    async getCytobands(chr: string): Promise<Cytoband[] | undefined> {
        if (this.cytobandSource) {
            const chrName = this.getChromosomeName(chr)
            const cytos = await this.cytobandSource.getCytobands(chrName)
            return cytos
        }
    }

    getChromosomes(): Map<string, Chromosome> {
        return this.chromosomes
    }

    get wgChromosomeNames(): string[] | undefined {
        return this.#wgChromosomeNames ? this.#wgChromosomeNames.slice() : undefined
    }

    get showChromosomeWidget(): boolean | undefined {
        return this.config.showChromosomeWidget
    }

    /**
     * Return the genome coordinate in kb for the give chromosome and position.
     * NOTE: This might return undefined if the chr is filtered from whole genome view.
     */
    getGenomeCoordinate(chr: string, bp: number): number | undefined {

        const offset = this.getCumulativeOffset(chr)
        if (offset === undefined) return undefined

        return offset + bp
    }

    /**
     * Return the chromosome and coordinate in bp for the given genome coordinate
     */
    getChromosomeCoordinate(genomeCoordinate: number): {chr: string | undefined, position: number} {

        if (this.cumulativeOffsets === undefined) {
            this.cumulativeOffsets = this.#computeCumulativeOffsets()
        }

        let lastChr: string | undefined = undefined
        let lastCoord = 0
        for (let name of this.#wgChromosomeNames!) {

            const cumulativeOffset = this.cumulativeOffsets[name]
            if (cumulativeOffset > genomeCoordinate) {
                const position = genomeCoordinate - lastCoord
                return {chr: lastChr, position: position}
            }
            lastChr = name
            lastCoord = cumulativeOffset
        }

        // If we get here off the end
        return {chr: this.#wgChromosomeNames![this.#wgChromosomeNames!.length - 1], position: 0}

    }


    /**
     * Return the offset in genome coordinates (kb) of the start of the given chromosome
     * NOTE:  This might return undefined if the chromosome is filtered from whole genome view.
     */
    getCumulativeOffset(chr: string): number | undefined {

        if (this.cumulativeOffsets === undefined) {
            this.cumulativeOffsets = this.#computeCumulativeOffsets()
        }

        const queryChr = this.getChromosomeName(chr)
        return this.cumulativeOffsets[queryChr]
    }

    /**
     * Compute cumulative offsets for each chromosome in the whole genome view.
     */
    #computeCumulativeOffsets(): Record<string, number> {

        const acc: Record<string, number> = {}
        let offset = 0
        for (let name of this.#wgChromosomeNames!) {
            acc[name] = Math.floor(offset)
            const chromosome = this.getChromosome(name)
            offset += chromosome!.bpLength
        }

        return acc
    }

    /**
     * Return the nominal genome length, this is the length of the main chromosomes (no scaffolds, etc).
     */
    getGenomeLength(): number {

        if (!this.bpLength) {
            let bpLength = 0
            for (let cname of this.#wgChromosomeNames!) {
                let c = this.chromosomes.get(cname)
                bpLength += c!.bpLength
            }
            this.bpLength = bpLength
        }
        return this.bpLength
    }

    async getSequence(chr: string, start: number, end: number): Promise<string | undefined> {
        chr = this.getChromosomeName(chr)
        return this.sequence.getSequence(chr, start, end)
    }

    /**
     * Return loaded sequence (i.e. cached or otherwise loaded) spanning the given region.  If no sequence has been
     * loaded returns undefined.
     *
     * @param chr
     * @param start
     * @param end
     */
    getSequenceInterval(chr: string, start: number, end: number): any {
        if (typeof this.sequence.getSequenceInterval === 'function') {
            return this.sequence.getSequenceInterval(chr, start, end)
        } else {
            return undefined
        }
    }

    getHubURLs(): string[] | undefined {
        return this.config.hubs
    }

    /**
     * Return the Mane transcript with the given name, or null if not found. We also check the refseq historical
     * db if available for backward compatibility. This is only available for hg38.
     * @param {string} name - The name of the Mane transcript to search for.
     * @return {Promise<Object|null>} A Promise resolving to the Mane transcript object if found, or null otherwise.
     */
    async getManeTranscript(name: string): Promise<any | null> {

        if (!this.maneFeatureSource && this.config.maneBbURL) {
            this.loadManeFeatureSource()
        }
        if (this.maneFeatureSource) {
            const feature = await this.maneFeatureSource.search(name)
            if (feature) {
                return feature
            }
        }
        if (!this.rsDBFeatureSource && this.config.rsdbURL) {
            this.rsDBFeatureSource = new BWSource({url: this.config.rsdbURL}, this)
        }
        if (this.rsDBFeatureSource) {
            const feature = await this.rsDBFeatureSource.search(name)
            if (feature) {
                return feature
            }
        }
        return null
    }

    /**
     * Return the Mane transcript overlapping the given position, or null if none found.
     *
     * @param chr      Chromosome name (e.g., "chr1", "chrX") in which to search for the transcript.
     * @param position Genomic position (0-based coordinate) to check for overlap with a Mane transcript.
     * @return {Promise<*|null>} The feature representing the Mane transcript overlapping the specified position, or null if none is found.
     */
    async getManeTranscriptAt(chr: string, position: number): Promise<any | null> {
        if (!this.maneFeatureSource && this.config.maneBbURL) {
            this.loadManeFeatureSource()
        }
        if (this.maneFeatureSource) {
            try {
                const start = position
                const end = position + 1
                const features = await this.maneFeatureSource.getFeatures({chr, start, end} as any)
                if (features) {
                    for (const feature of features) {
                        if (feature.start <= position && feature.end >= position) {
                            return feature
                        }
                    }
                }
            } catch (e) {
                console.error("Error fetching MANE transcript", e)
            }
        }
        return null
    }

    loadManeFeatureSource(): void {
        if (this.config.maneBbURL != null) {
            const bbConfig: any = {url: this.config.maneBbURL}
            if (this.config.maneTrixURL) {
                bbConfig.trixURL = this.config.maneTrixURL
            }
            this.maneFeatureSource = new BWSource(bbConfig, this)
        }
    }
}

/**
 * Trim small sequences (chromosomes) and return the list of trimmed chromosome names.
 * The results are used to construct the whole genome view and optionally chromosome pulldown
 *
 * @param chromosomes - Map of chromosome name to Chromosome object
 * @returns trimmed list of chromosome names
 */
function trimSmallChromosomes(chromosomes: Map<string, Chromosome>): string[] {

    const wgChromosomeNames: string[] = []
    let runningAverage: number | undefined
    let i = 1
    for (let c of chromosomes.values()) {
        if (!runningAverage) {
            runningAverage = c.bpLength
            wgChromosomeNames.push(c.name)
        } else {
            if (c.bpLength < runningAverage / 100) {
                continue
            }
            runningAverage = ((i - 1) * runningAverage + c.bpLength) / i
            wgChromosomeNames.push(c.name)
        }
        i++
    }
    return wgChromosomeNames
}

function isDigit(val: string): boolean {
    return /^\d+$/.test(val)
}

function generateGenomeID(config: any): string {
    if (config.id !== undefined) {
        return config.id
    } else if (config.fastaURL && StringUtils.isString(config.fastaURL) && !config.fastaURL.startsWith("data:")) {
        return config.fastaURL
    } else if (config.fastaURL && config.fastaURL.name) {
        return config.fastaURL.name
    } else {
        return ""
    }
}

export default Genome
