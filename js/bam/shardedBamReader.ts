import BamReader from "./bamReader.js"
import AlignmentContainer from "./alignmentContainer"
import BamUtils from "./bamUtils"

interface ShardedBamConfig {
    url?: string
    indexURL?: string
    sources: {
        sequences: string[]
        url: string
        indexURL?: string
    }
    [key: string]: any
}

class ShardedBamReader {

    config: ShardedBamConfig
    genome: any
    bamReaders: Record<string, BamReader>
    filter: any

    constructor(config: ShardedBamConfig, genome: any) {

        this.config = config
        this.genome = genome

        const bamReaders: Record<string, BamReader> = {}
        const chrAliasTable: Record<string, string> = {}

        config.sources.sequences.forEach(function (chr: string) {
            const queryChr: string = genome ? genome.getChromosomeName(chr) : chr
            bamReaders[queryChr] = getReader(config, genome, chr)
        })

        this.bamReaders = bamReaders

        BamUtils.setReaderDefaults(this, config)
    }

    async readAlignments(chr: string, start: number, end: number): Promise<AlignmentContainer> {

        if (!this.bamReaders.hasOwnProperty(chr)) {
            return new AlignmentContainer(chr, start, end, this.config as any)
        } else {

            let reader: BamReader = this.bamReaders[chr]
            const a: AlignmentContainer = await reader.readAlignments(chr, start, end)
            return a
        }
    }
}

function getReader(config: ShardedBamConfig, genome: any, chr: string): BamReader {
    const tmp: { url: string; indexURL?: string } = {
        url: config.sources.url.replace("$CHR", chr)
    }
    if (config.sources.indexURL) {
        tmp.indexURL = config.sources.indexURL.replace("$CHR", chr)
    }
    const bamConfig: any = Object.assign(config, tmp)

    // TODO -- support non-indexed, htsget, etc
    return new BamReader(bamConfig, genome)
}

export default ShardedBamReader
