import NonIndexedFasta from "./nonIndexedFasta"
import FastaSequence from "./indexedFasta"
import {isDataURL} from "../util/igvUtils"
import ChromSizes from "./chromSizes"
import Twobit from "./twobit"
import CachedSequence from "./cachedSequence"
import type Browser from "../browser.js"
import type {GenomeConfig} from "../types/genome.js"

/**
 * Create a sequence object.  The referenced object can include multiple sequence references, in particular
 * fasta and 2bit URLs.  This is for backward compatibility, the 2bit URL has preference.
 *
 * @param reference
 * @param browser
 * @returns {Promise<CachedSequence|ChromSizes|NonIndexedFasta>}
 */
async function loadSequence(reference: GenomeConfig, browser?: Browser): Promise<CachedSequence | ChromSizes | NonIndexedFasta | undefined> {

    let fasta: CachedSequence | ChromSizes | NonIndexedFasta | undefined
    const format = reference.format as string | undefined
    if ("chromsizes" === format) {
        fasta = new ChromSizes((reference.fastaURL || reference.url) as string)
    } else if ("2bit" === format || reference.twoBitURL) {
        fasta = new CachedSequence(new Twobit(reference), browser)
    } else if (isDataURL(reference.fastaURL) || !reference.indexURL) {
        fasta = new NonIndexedFasta(reference)
    } else if("gbk" === format || reference.gbkURL) {
        // Genbank files do not crete a fasta object
    }

    else {
        fasta = new CachedSequence(new FastaSequence(reference), browser)
    }
    if (fasta) {
        await fasta.init()
    }
    return fasta
}

export {loadSequence}
