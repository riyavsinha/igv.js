import AlignmentContainer from "./alignmentContainer"
import BamUtils from "./bamUtils"
import {igvxhr} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions} from "../util/igvUtils.js"

interface BamWebserviceConfig {
    url: string
    referenceFile: string
    alignmentFile: string
    [key: string]: any
}

interface WebserviceHeader {
    chrAliasTable: Record<string, string>
    chrToIndex: Record<string, number>
    chrNames: string[]
}

/**
 * Class for reading bam records from an igv.js-flask server backed by pysam.  Deprecated.
 *
 * @param config
 * @constructor
 */
const BamWebserviceReader = function (this: any, config: BamWebserviceConfig, genome: any): void {

    this.config = config
    this.genome = genome
    BamUtils.setReaderDefaults(this, config)

} as any

// Example http://localhost:5000/alignments/?reference=/Users/jrobinso/hg19mini.fa&file=/Users/jrobinso/cram_with_crai_index.cram&region=1:100-2000

BamWebserviceReader.prototype.readAlignments = function (chr: string, bpStart: number, bpEnd: number): Promise<any> {

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    var self = this

    return getHeader.call(self)

        .then(function (header: WebserviceHeader) {

            var queryChr: string, url: string

            queryChr = header.chrAliasTable.hasOwnProperty(chr) ? header.chrAliasTable[chr] : chr

            url = self.config.url +
                "?reference=" + self.config.referenceFile +
                "&file=" + self.config.alignmentFile + "" +
                "&region=" + queryChr + ":" + bpStart + "-" + bpEnd


            return igvxhr.loadString(url, buildOptions(self.config))

                .then(function (sam: string) {

                    var alignmentContainer: AlignmentContainer, chrId: number, ba: any

                    chrId = header.chrToIndex[queryChr]

                    alignmentContainer = new AlignmentContainer(chr, bpStart, bpEnd, self.config)

                    BamUtils.decodeSamRecords(sam, alignmentContainer as any, queryChr, bpStart, bpEnd, self.filter)

                    return alignmentContainer

                })

        })
}


// Example  http://localhost:5000/alignments/?reference=/Users/jrobinso/hg19mini.fa&file=/Users/jrobinso/cram_with_crai_index.cram&options=-b%20-H
function getHeader(this: any): Promise<WebserviceHeader> {

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    const genome: any = this.genome

    if (this.header) {

        return Promise.resolve(this.header)

    } else {

        const url: string = this.config.url + "?file=" + this.config.alignmentFile + "&options=-b,-H"
        const options: any = buildOptions(this.config)

        return BamUtils.readHeader(url, options, genome)

            .then(function (header: any) {

                self.header = header
                return header

            })
    }

}


function readInt(ba: Uint8Array, offset: number): number {
    return (ba[offset + 3] << 24) | (ba[offset + 2] << 16) | (ba[offset + 1] << 8) | (ba[offset])
}

export default BamWebserviceReader


