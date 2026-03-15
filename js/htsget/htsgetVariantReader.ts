import HtsgetReader from "./htsgetReader"
import getDataWrapper from "../feature/dataWrapper"
import VcfParser from "../variant/vcfParser.js"
import {isgzipped, ungzip} from "../../node_modules/igv-utils/src/bgzf.js"
import ChromAliasManager from "../feature/chromAliasManager"

interface VcfHeader {
    sequenceNames?: string[];
    [key: string]: any;
}

class HtsgetVariantReader extends HtsgetReader {

    parser: VcfParser;
    header: VcfHeader | undefined;
    chromAliasManager: ChromAliasManager | undefined;
    config: any;

    constructor(config: any, genome: any) {
        super(config, genome)
        this.parser = new VcfParser()
    }

    async readHeader(): Promise<VcfHeader> {
        if (!this.header) {
            let data: any = await this.readHeaderData()
            if (isgzipped(data)) {
                data = ungzip(data)
            }

            const dataWrapper: any = getDataWrapper(data)
            this.header = await this.parser.parseHeader(dataWrapper, this.genome)
            if (this.header.sequenceNames && this.header.sequenceNames.length > 0) {
                this.chromAliasManager = new ChromAliasManager(this.header.sequenceNames, this.genome)
            }
        }
        return this.header!
    }

    async readFeatures(chr: string, start: number, end: number): Promise<any[]> {

        if('all' === chr) {
            return []    // This should never happen, but just in case
        }

        if (this.config.format && this.config.format.toUpperCase() !== "VCF") {
            throw Error(`htsget format ${this.config.format} is not supported`)
        }

        if (!this.header) {
            await this.readHeader()
        }


        let queryChr: string = this.chromAliasManager ? await this.chromAliasManager.getAliasName(chr) : chr

        let data: any = await this.readData(queryChr, start, end)
        if (isgzipped(data)) {
            data = ungzip(data)
        }

        const dataWrapper: any = getDataWrapper(data)

        return this.parser.parseFeatures(dataWrapper)

        //  return dataWrapper;

    }
}


export default HtsgetVariantReader
