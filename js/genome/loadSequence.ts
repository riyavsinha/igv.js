import NonIndexedFasta from "./nonIndexedFasta"
import FastaSequence from "./indexedFasta"
import {isDataURL} from "../util/igvUtils"
import ChromSizes from "./chromSizes"
import Twobit from "./twobit"
import CachedSequence from "./cachedSequence"

/**
 * Create a sequence object.  The referenced object can include multiple sequence references, in particular
 * fasta and 2bit URLs.  This is for backward compatibility, the 2bit URL has preference.
 *
 * @param reference
 * @param browser
 * @returns {Promise<CachedSequence|ChromSizes|NonIndexedFasta>}
 */
async function loadSequence(reference: any, browser?: any): Promise<any> {

    let fasta: any
    if ("chromsizes" === reference.format) {
        fasta = new ChromSizes(reference.fastaURL || reference.url)
    } else if ("2bit" === reference.format || reference.twoBitURL) {
        fasta = new CachedSequence(new Twobit(reference), browser)
    } else if (isDataURL(reference.fastaURL) || !reference.indexURL) {
        fasta = new NonIndexedFasta(reference)
    } else if("gbk" === reference.format || reference.gbkURL) {
        // Genbank files do not crete a fasta object
    }

    else {
        fasta = new CachedSequence(new FastaSequence(reference), browser)
    }
    await fasta.init()
    return fasta
}

export {loadSequence}
