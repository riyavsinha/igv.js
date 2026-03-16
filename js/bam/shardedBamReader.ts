import BamReader from "./bamReader.js"
import AlignmentContainer, {type AlignmentContainerOptions} from "./alignmentContainer"
import BamUtils, {type BamFilterLike} from "./bamUtils"
import type {BaseFeatureSourceGenome} from "../feature/baseFeatureSource.js"

interface ShardedBamConfig {
    url?: string
    indexURL?: string
    sources: {
        sequences: string[]
        url: string
        indexURL?: string
    }
    [key: string]: unknown
}

class ShardedBamReader {

    config: ShardedBamConfig
    genome: BaseFeatureSourceGenome
    bamReaders: Record<string, BamReader>
    filter: BamFilterLike | undefined

    constructor(config: ShardedBamConfig, genome: BaseFeatureSourceGenome) {

        this.config = config
        this.genome = genome

        const bamReaders: Record<string, BamReader> = {}
        const chrAliasTable: Record<string, string> = {}

        config.sources.sequences.forEach(function (chr: string) {
            const queryChr: string = genome?.getChromosomeName?.(chr) ?? chr
            bamReaders[queryChr] = getReader(config, genome, chr)
        })

        this.bamReaders = bamReaders

        BamUtils.setReaderDefaults(this, config)
    }

    async readAlignments(chr: string, start: number, end: number): Promise<AlignmentContainer> {

        if (!this.bamReaders.hasOwnProperty(chr)) {
            return new AlignmentContainer(chr, start, end, this.config as AlignmentContainerOptions)
        } else {

            let reader: BamReader = this.bamReaders[chr]
            const a: AlignmentContainer = await reader.readAlignments(chr, start, end)
            return a
        }
    }
}

function getReader(config: ShardedBamConfig, genome: BaseFeatureSourceGenome, chr: string): BamReader {
    const tmp: { url: string; indexURL?: string } = {
        url: config.sources.url.replace("$CHR", chr)
    }
    if (config.sources.indexURL) {
        tmp.indexURL = config.sources.indexURL.replace("$CHR", chr)
    }
    const bamConfig = Object.assign({}, config, tmp)

    // TODO -- support non-indexed, htsget, etc
    return new BamReader(bamConfig, genome)
}

export default ShardedBamReader
