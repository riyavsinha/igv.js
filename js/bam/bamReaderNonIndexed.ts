import AlignmentContainer, {type AlignmentContainerOptions} from "./alignmentContainer"
import BamUtils, {type BamFilterLike} from "./bamUtils"
import BamAlignment from "./bamAlignment"
import {BGZip, igvxhr} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions, isDataURL} from "../util/igvUtils.js"
import ChromAliasManager from "../feature/chromAliasManager"
import FeatureCache from "../feature/featureCache"
import type {LoadConfig} from "../types/config.js"
import type {BaseFeatureSourceGenome} from "../feature/baseFeatureSource.js"
import type {BamHeader} from "./bamUtils"

/**
 * Class for reading a bam file
 *
 * @param config
 * @constructor
 */
class BamReaderNonIndexed {

    chrAliasTable: Map<string, string | undefined> = new Map()
    config: LoadConfig
    genome: BaseFeatureSourceGenome
    bamPath: string
    isDataUri: boolean
    filter: BamFilterLike | undefined
    header: BamHeader | undefined
    chromAliasManager: ChromAliasManager | null | undefined
    alignmentCache: FeatureCache | undefined

    constructor(config: LoadConfig, genome: BaseFeatureSourceGenome) {
        this.config = config
        this.genome = genome
        this.bamPath = config.url as string
        this.isDataUri = isDataURL(config.url as string)
        BamUtils.setReaderDefaults(this, config)
    }

    async postInit(): Promise<void> {
        await this.#loadAll()
    }

    /**
     *
     * @param chr
     * @param bpStart
     * @param bpEnd
     * @returns {Promise<AlignmentContainer>}
     */
    async readAlignments(chr: string, bpStart: number, bpEnd: number): Promise<AlignmentContainer> {

        if (!this.alignmentCache) {
            // For a non-indexed BAM file all alignments are read at once and cached.
            await this.#loadAll()
        }

        const queryChr: string = this.chromAliasManager ? await this.chromAliasManager.getAliasName(chr) : chr
        const qAlignments = this.alignmentCache!.queryFeatures(queryChr, bpStart, bpEnd) as unknown as BamAlignment[]
        const alignmentContainer: AlignmentContainer = new AlignmentContainer(chr, bpStart, bpEnd, this.config as AlignmentContainerOptions)
        for (let a of qAlignments) {
            alignmentContainer.push(a)
        }
        alignmentContainer.finish()
        return alignmentContainer
    }

    async #loadAll(): Promise<void> {
        let unc: Uint8Array
        if (this.isDataUri) {
            const data: Uint8Array = decodeDataURI(this.bamPath)
            unc = BGZip.unbgzf(data.buffer)
        } else {
            const arrayBuffer: ArrayBuffer = await igvxhr.loadArrayBuffer(this.bamPath, buildOptions(this.config))
            unc = BGZip.unbgzf(arrayBuffer)
        }
        const alignments: BamAlignment[] = this.#parseAlignments(unc)
        this.alignmentCache = new FeatureCache(alignments)
    }

    #parseAlignments(data: Uint8Array): BamAlignment[] {
        const alignments: BamAlignment[] = []
        this.header = BamUtils.decodeBamHeader(data)
        this.chromAliasManager = this.genome ? new ChromAliasManager(this.header.chrNames, this.genome) : null
        BamUtils.decodeBamRecords(data, this.header.size, alignments, this.header.chrNames, undefined, 0, Number.MAX_SAFE_INTEGER, this.filter)
        return alignments
    }

    async #getQueryChr(chr: string): Promise<string | undefined> {

        const ownNames: Set<string> = new Set(this.header!.chrNames)
        if (ownNames.has(chr)) {
            return chr
        }

        if (this.chrAliasTable.has(chr)) {
            return this.chrAliasTable.get(chr)
        }

        // Try alias

        if (this.genome) {
            const aliasRecord: Record<string, string> | undefined = await this.genome.getAliasRecord?.(chr)
            let alias: string | undefined
            if (aliasRecord) {
                const aliases: string[] = Object.keys(aliasRecord)
                    .filter(k => k !== "start" && k !== "end")
                    .map(k => aliasRecord[k])
                    .filter(a => ownNames.has(a))
                if (aliases.length > 0) {
                    alias = aliases[0]
                }
            }
            this.chrAliasTable.set(chr, alias)  // alias may be undefined => no alias exists. Setting prevents repeated attempts
            return alias
        }

        return chr
    }

}

function decodeDataURI(dataURI: string): Uint8Array {

    const split: string[] = dataURI.split(',')
    const info: string = split[0].split(':')[1]
    let dataString: string = split[1]

    if (info.indexOf('base64') >= 0) {
        dataString = atob(dataString)
    } else {
        dataString = decodeURI(dataString)
    }

    const bytes: Uint8Array = new Uint8Array(dataString.length)
    for (var i = 0; i < dataString.length; i++) {
        bytes[i] = dataString.charCodeAt(i)
    }
    return bytes
}


export default BamReaderNonIndexed
