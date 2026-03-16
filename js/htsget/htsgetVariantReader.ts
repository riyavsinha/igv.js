import HtsgetReader from "./htsgetReader"
import getDataWrapper from "../feature/dataWrapper"
import VcfParser from "../variant/vcfParser.js"
import {isgzipped, ungzip} from "../../node_modules/igv-utils/src/bgzf.js"
import ChromAliasManager from "../feature/chromAliasManager"
import type {BaseFeatureSourceGenome} from "../feature/baseFeatureSource.js"
import type {Variant} from "../variant/variant.js"
import type {SVComplement} from "../variant/variant.js"

interface VcfHeader {
    sequenceNames?: string[]
    [key: string]: unknown
}

class HtsgetVariantReader extends HtsgetReader {

    parser: VcfParser
    header: VcfHeader | undefined
    chromAliasManager: ChromAliasManager | undefined

    constructor(config: Record<string, unknown>, genome: BaseFeatureSourceGenome) {
        super(config as ConstructorParameters<typeof HtsgetReader>[0], genome)
        this.parser = new VcfParser()
    }

    async readHeader(): Promise<VcfHeader> {
        if (!this.header) {
            const rawData = await this.readHeaderData()
            let data: Uint8Array | string = rawData
            if (isgzipped(rawData.buffer as ArrayBuffer)) {
                data = new Uint8Array(ungzip(rawData.buffer as ArrayBuffer))
            }

            const dataWrapper = getDataWrapper(data)
            this.header = await this.parser.parseHeader(dataWrapper, this.genome)
            if (this.header.sequenceNames && this.header.sequenceNames.length > 0) {
                this.chromAliasManager = new ChromAliasManager(this.header.sequenceNames, this.genome)
            }
        }
        return this.header!
    }

    async readFeatures(chr: string, start: number, end: number): Promise<(Variant | SVComplement)[]> {

        if('all' === chr) {
            return []    // This should never happen, but just in case
        }

        if (this.config.format && (this.config.format as string).toUpperCase() !== "VCF") {
            throw Error(`htsget format ${this.config.format} is not supported`)
        }

        if (!this.header) {
            await this.readHeader()
        }


        let queryChr: string = this.chromAliasManager ? await this.chromAliasManager.getAliasName(chr) : chr

        const rawData = await this.readData(queryChr, start, end)
        let data: Uint8Array | string = rawData
        if (isgzipped(rawData.buffer as ArrayBuffer)) {
            data = new Uint8Array(ungzip(rawData.buffer as ArrayBuffer))
        }

        const dataWrapper = getDataWrapper(data)

        return this.parser.parseFeatures(dataWrapper)

    }
}


export default HtsgetVariantReader
