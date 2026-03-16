import {loadIndex} from "./indexFactory"
import AlignmentContainer, {type AlignmentContainerOptions} from "./alignmentContainer"
import BamUtils, {type BamHeader, type BamFilterLike} from "./bamUtils"
import {BGZip, igvxhr} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions} from "../util/igvUtils.js"
import BGZBlockLoader from "./bgzBlockLoader"
import type {LoadConfig} from "../types/config.js"
import type {BaseFeatureSourceGenome} from "../feature/baseFeatureSource.js"

interface BamIndex {
    firstBlockPosition: number
    chunksForRange(chrId: number, bpStart: number, bpEnd: number): Chunk[]
}

interface Chunk {
    minv: { block: number; offset: number }
    maxv: { block: number; offset: number }
}

/**
 * Class for reading a bam file
 *
 * @param config
 * @constructor
 */
class BamReader {

    chrAliasTable: Map<string, string | undefined> = new Map()
    config: LoadConfig
    genome: BaseFeatureSourceGenome
    bamPath: string
    baiPath: string
    filter: BamFilterLike | undefined
    header: BamHeader | undefined
    index: BamIndex | undefined
    chrToIndex: Record<string, number> | undefined
    indexToChr: string[] | undefined
    chrNames: Set<string> | undefined
    _blockLoader: BGZBlockLoader

    constructor(config: LoadConfig, genome: BaseFeatureSourceGenome) {
        this.config = config
        this.genome = genome
        this.bamPath = config.url as string
        this.baiPath = config.indexURL as string
        BamUtils.setReaderDefaults(this, config)

        this._blockLoader = new BGZBlockLoader(config)
    }

    async postInit(): Promise<void> {
        await this.getHeader()   // Called for side effects, and to ensure file is loadable
    }

    async readAlignments(chr: string, bpStart: number, bpEnd: number): Promise<AlignmentContainer> {

        const chrId: number | undefined = await this.#getRefId(chr)
        const alignmentContainer: AlignmentContainer = new AlignmentContainer(chr, bpStart, bpEnd, this.config as AlignmentContainerOptions)

        if (chrId === undefined) {
            return alignmentContainer

        } else {

            const bamIndex: BamIndex = await this.getIndex()
            const chunks: Chunk[] = bamIndex.chunksForRange(chrId, bpStart, bpEnd)

            if (!chunks || chunks.length === 0) {
                return alignmentContainer
            }

            for (let c of chunks) {
                const ba: Uint8Array = await this._blockLoader.getData(c.minv, c.maxv)
                const done: boolean = BamUtils.decodeBamRecords(ba, c.minv.offset, alignmentContainer, this.header!.chrNames, chrId!, bpStart, bpEnd, this.filter) ?? false
                if (done) {
                    break
                }
            }
            alignmentContainer.finish()
            return alignmentContainer
        }
    }

    async #getRefId(chr: string): Promise<number | undefined> {

        await this.getHeader()

        if (this.chrAliasTable.has(chr)) {
            chr = this.chrAliasTable.get(chr) as string
            if (chr === undefined) {
                return undefined
            }
        }

        let refId: number | undefined = this.header!.chrToIndex[chr]

        // Try alias
        if (refId === undefined) {
            const aliasRecord: Record<string, string> | undefined = await this.genome.getAliasRecord?.(chr)
            let alias: string | undefined
            if (aliasRecord) {
                const aliases: string[] = Object.keys(aliasRecord)
                    .filter(k => k !== "start" && k !== "end")
                    .map(k => aliasRecord[k])
                    .filter(a => undefined !== this.header!.chrToIndex[a])
                if (aliases.length > 0) {
                    alias = aliases[0]
                    refId = this.header!.chrToIndex[aliases[0]]
                }
            }
            this.chrAliasTable.set(chr, alias)  // alias may be undefined => no alias exists. Setting prevents repeated attempts
        }
        return refId
    }

    /**
     *
     * @returns {Promise<{magicNumer: number, size: number, chrNames: Array, chrToIndex: ({}|*), chrAliasTable: ({}|*)}>}
     */
    async getHeader(): Promise<BamHeader> {
        if (!this.header) {
            const index: BamIndex = await this.getIndex()
            let len: number
            if (index.firstBlockPosition) {
                const bsizeOptions = buildOptions(this.config, {range: {start: index.firstBlockPosition, size: 26}})
                const abuffer: ArrayBuffer = await igvxhr.loadArrayBuffer(this.bamPath, bsizeOptions)
                const bsize: number = BGZip.bgzBlockSize(abuffer)
                len = index.firstBlockPosition + bsize   // Insure we get the complete compressed block containing the header
            } else {
                len = 64000
            }

            const options = buildOptions(this.config, {range: {start: 0, size: len}})
            this.header = await BamUtils.readHeader(this.bamPath, options, this.genome)
        }
        return this.header!
    }

    async getIndex(): Promise<BamIndex> {
        if (!this.index) {
            this.index = await loadIndex(this.baiPath, this.config) as BamIndex
        }
        return this.index!
    }

    async getChrIndex(): Promise<Record<string, number>> {
        if (this.chrToIndex) {
            return this.chrToIndex
        } else {
            const header: BamHeader = await this.getHeader()
            this.chrToIndex = header.chrToIndex
            this.indexToChr = header.chrNames
            this.chrNames = new Set(header.chrNames)
            return this.chrToIndex

        }
    }
}

export default BamReader
