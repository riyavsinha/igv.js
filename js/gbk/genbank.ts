import SequenceInterval from "../genome/sequenceInterval"
import Chromosome from "../genome/chromosome"

interface GenbankConfig {
    chr: string
    locus: string
    accession: string
    aliases: string[] | undefined
    features: GenbankFeature[]
    sequence: string
}

interface GenbankFeature {
    chr: string
    type: string
    attributes: Record<string, string>
    getAttributeValue: (key: string) => string
    start?: number
    end?: number
    strand?: string
    exons?: Array<{ chr: string; start: number; end: number; strand: string }>
}

interface ChromosomeInfo {
    name: string
    bpLength: number
}

/**
 * Represents a Genbank file, which combines both annotations (features) and sequence.   The format combines both
 * sequence and annotations.
 *
 * Implements the Genome interface
 */
class Genbank {

    chr: string
    locus: string
    accession: string
    aliases: string[] | undefined
    features: GenbankFeature[]
    sequence: string
    bpLength: number
    url: string | undefined

    constructor({chr, locus, accession, aliases, features, sequence}: GenbankConfig) {
        this.chr = chr
        this.locus = locus
        this.accession = accession
        this.aliases = aliases
        this.features = features
        this.sequence = sequence
        this.bpLength = sequence.length
    }


    toJSON(): { gbkURL: string | undefined } {
        return {
            gbkURL: this.url
        }
    }


    // Genome interface follows

    getSequenceRecord(chr: string): { chr: string; bpLength: number } {
        //chr, 0, sequenceRecord.bpLength
        return {chr: this.chr, bpLength: this.bpLength}
    }

    get chromosomeNames(): string[] {
        return [this.chr]
    }

    getFirstChromosomeName(): string {
        return this.chr
    }

    get id(): string {
        return this.accession
    }
    get name(): string {
        return this.locus
    }

    get initialLocus(): string {
        return this.chr
    }

    // Genome interface follows
    get description(): string {
        return this.locus
    }

    get infoURL(): string | undefined {
        return this.url
    }

    showWholeGenomeView(): boolean {
        return false
    }

    getHomeChromosomeName(): string {
        return this.chr
    }

    getChromosomeName(chr: string): string {
        return chr
    }

    getChromosomeDisplayName(str: string): string {
        return this.chr
    }

    getChromosome(chr: string): ChromosomeInfo | undefined {
        if (chr === this.chr) {
            return {
                name: this.chr,
                bpLength: this.bpLength
            }
        }
    }

    async loadChromosome(chr: string): Promise<ChromosomeInfo | undefined> {
        return this.getChromosome(chr)
    }

    async getAliasRecord(chr: string): Promise<undefined> {
        return undefined
    }

    getCytobands(chr: string): never[] {
        return []
    }

    getChromosomes(): (ChromosomeInfo | undefined)[] {
        return [this.getChromosome(this.chr)]
    }

    get wgChromosomeNames(): undefined {
        return undefined
    }

    /**
     * Return the genome coordinate in kb for the give chromosome and position.
     * NOTE: This might return undefined if the chr is filtered from whole genome view.
     */
    getGenomeCoordinate(chr: string, bp: number): number | undefined {
        if (chr === this.chr)
            return bp
    }

    /**
     * Return the chromosome and coordinate in bp for the given genome coordinate
     */
    getChromosomeCoordinate(genomeCoordinate: number): { chr: string; position: number } {
        return {chr: this.chr, position: genomeCoordinate}
    }


    /**
     * Return the offset in genome coordinates (kb) of the start of the given chromosome
     * NOTE:  This might return undefined if the chromosome is filtered from whole genome view.
     */
    getCumulativeOffset(chr: string): number {
        return 0
    }

    /**
     * Return the nominal genome length, this is the length of the main chromosomes (no scaffolds, etc).
     */
    getGenomeLength(): number {
        return this.bpLength
    }


    async getSequence(chr: string, start: number, end: number): Promise<string | undefined> {
        if (chr === this.chr) {
            return this.sequence.substring(start, end)
        } else {
            return undefined
        }
    }

    /**
     * Return the first cached interval containing the specified region, or undefined if no interval is found.
     *
     * @param chr
     * @param start
     * @param end
     * @returns a SequenceInterval or undefined
     */
    getSequenceInterval(chr: string, start: number, end: number): SequenceInterval | undefined {
        if (chr === this.chr) {
            return new SequenceInterval(this.chr, 0, this.sequence.length, this.sequence)
        } else {
            return undefined
        }
    }
}

export default Genbank
