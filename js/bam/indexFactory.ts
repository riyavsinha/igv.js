import {BGZip, igvxhr} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions} from "../util/igvUtils"
import type {LoadConfig} from "../types/config.js"
import {parseCsiIndex} from "./csiIndex"
import {parseBamIndex, parseTabixIndex} from "./bamIndex"
import {parseTribbleIndex} from "../feature/tribble"

const CSI1_MAGIC = 21582659 // CSI\1
const CSI2_MAGIC = 38359875 // CSI\2
const BAI_MAGIC = 21578050
const TABIX_MAGIC = 21578324
const TRIBBLE_MAGIC = 1480870228   //  byte[]{'T', 'I', 'D', 'X'};

/**
 * @param indexURL
 * @param config
 *
 */
async function loadIndex(indexURL: string, config: LoadConfig): Promise<unknown> {

    let arrayBuffer: ArrayBuffer = await igvxhr.loadArrayBuffer(indexURL, buildOptions(config))
    let dv = new DataView(arrayBuffer)

    // Some indexs are bgzipped, specifically tabix, and csi.  Bam (bai) are not.  Tribble is usually not.
    // Check first 2 bytes of file for gzip magic number, and inflate if neccessary
    if (dv.getUint8(0) === 0x1f && dv.getUint8(1) === 0x8b) {    // gzipped
        const inflate = BGZip.unbgzf(arrayBuffer)
        arrayBuffer = inflate.buffer
        dv = new DataView(arrayBuffer)
    }

    const magic = dv.getInt32(0, true)
    switch (magic) {
        case BAI_MAGIC:
            return parseBamIndex(arrayBuffer)
        case TABIX_MAGIC:
            return parseTabixIndex(arrayBuffer)
        case CSI1_MAGIC:
            return parseCsiIndex(arrayBuffer)
        case TRIBBLE_MAGIC:
            return parseTribbleIndex(arrayBuffer)
        case CSI2_MAGIC:
            throw Error("CSI version 2 is not supported.")
        default:
            throw Error(`Unrecognized index type: ${indexURL}`)
    }
}

export {loadIndex}
