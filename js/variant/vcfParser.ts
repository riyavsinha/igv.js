import {Variant, Call, SVComplement} from "./variant"
import {StringUtils} from "../../node_modules/igv-utils/src/index.js"

/**
 * Parser for VCF files.
 */

interface VcfHeader {
    sequenceNames: string[];
    version?: string;
    sampleNameMap?: Map<string, number>;
    [key: string]: any;
}

interface FormatFields {
    genotypeIndex: number;
    fields: string[];
}

interface DataWrapper {
    nextLine(): Promise<string | undefined>;
}

class VcfParser {

    header: VcfHeader;

    construtor() {
    }

    async parseHeader(dataWrapper: DataWrapper, genome: any): Promise<VcfHeader> {

        const header: VcfHeader = {} as VcfHeader

        header.sequenceNames = []

        // First line must be file format
        let line: string | undefined = await dataWrapper.nextLine()
        if (line!.startsWith("##fileformat")) {
            header.version = line!.substr(13)
        } else {
            throw new Error("Invalid VCF file: missing fileformat line")
        }

        while ((line = await dataWrapper.nextLine()) !== undefined) {

            if (line.startsWith("#")) {

                let id: string | undefined
                const values: Record<string, string> = {}

                if (line.startsWith("##")) {

                    if (line.startsWith("##INFO") || line.startsWith("##FILTER") || line.startsWith("##FORMAT")) {

                        const ltIdx: number = line.indexOf("<")
                        const gtIdx: number = line.lastIndexOf(">")

                        if (!(ltIdx > 2 && gtIdx > 0)) {
                            console.log("Malformed VCF header line: " + line)
                            continue
                        }

                        const type: string = line.substring(2, ltIdx - 1)
                        if (!header[type]) header[type] = {}

                        //##INFO=<ID=AF,Number=A,Type=Float,Description="Allele frequency based on Flow Evaluator observation counts">
                        // ##FILTER=<ID=NOCALL,Description="Generic filter. Filtering details stored in FR info tag.">
                        // ##FORMAT=<ID=AF,Number=A,Type=Float,Description="Allele frequency based on Flow Evaluator observation counts">

                        const tokens: string[] = StringUtils.splitStringRespectingQuotes(line.substring(ltIdx + 1, gtIdx - 1), ",")

                        for (let token of tokens) {
                            var kv = token.split("=")
                            if (kv.length > 1) {
                                if (kv[0] === "ID") {
                                    id = kv[1]
                                } else {
                                    values[kv[0]] = kv[1]
                                }
                            }
                        }

                        if (id) {
                            header[type][id] = values
                        }
                    } else if (line.startsWith("##contig") && genome) {
                        const idx1: number = line.indexOf("<ID=")
                        let idx2: number = line.indexOf(",", idx1)
                        if (idx2 == -1) {
                            idx2 = line.indexOf(">", idx1)
                        }
                        const chr: string = line.substring(idx1 + 4, idx2)
                        header.sequenceNames.push(chr)
                    } else {
                        // ignoring other directives
                    }
                } else if (line.startsWith("#CHROM")) {
                    const tokens: string[] = line.split("\t")
                    if (tokens.length > 8) {
                        // Map of sample name -> index
                        header.sampleNameMap = new Map<string, number>()
                        for (let j = 9; j < tokens.length; j++) {
                            header.sampleNameMap.set(tokens[j], j - 9)
                        }
                    }
                }

            } else {
                break
            }
        }

        this.header = header  // Will need to intrepret genotypes and info field

        return header
    }


    /**
     * Parse data as a collection of Variant objects.
     *
     * @param data
     * @returns {Array}
     */
    async parseFeatures(dataWrapper: DataWrapper): Promise<any[]> {

        const allFeatures: any[] = []
        const sampleNames: string[] | undefined = this.header.sampleNameMap ? Array.from(this.header.sampleNameMap.keys()) : undefined
        const nExpectedColumns: number = 8 + (sampleNames ? sampleNames.length + 1 : 0)
        let line: string | undefined
        while ((line = await dataWrapper.nextLine()) !== undefined) {
            if (line && !line.startsWith("#")) {

                const tokens: string[] = line.trim().split("\t")
                if (tokens.length === nExpectedColumns) {
                    const variant = new Variant(tokens);
                    (variant as any).header = this.header       // Keep a pointer to the header to interpret fields for popup text
                    //variant.line = line              // Uncomment for debugging
                    allFeatures.push(variant)

                    if (tokens.length > 9) {
                        //example...	GT	0|0	0|0	0|0	0|0	0|0	0|0	0|0	0|0	0|0	0|0	0|0
                        //example...    GT:DR:DV	./.:.:11

                        const formatFields: FormatFields = extractFormatFields(tokens[8].split(":"))

                        variant.calls = []
                        for (let index = 9; index < tokens.length; index++) {
                            const sample: string = sampleNames![index-9]
                            const token: string = tokens[index]
                            const call = new Call({formatFields, sample, token})
                            variant.calls.push(call)

                        }

                        // If this is a structural variant create a complement of this variant for the other end
                        // The test for "SV" is not comprehensive, there is not yet a standard for this
                        if (variant.info && variant.info.CHR2 && variant.info.END) {
                            allFeatures.push(svComplement(variant))
                        }
                    }
                }
            }
        }
        return allFeatures

    }
}

function extractFormatFields(tokens: string[]): FormatFields {

    const callFields: FormatFields = {
        genotypeIndex: -1,
        fields: tokens
    }
    for (let i = 0; i < tokens.length; i++) {
        if ("GT" === tokens[i]) {
            callFields.genotypeIndex = i
        }
    }
    return callFields
}

function svComplement(v: any): any {

    return new SVComplement(v)

}

export default VcfParser
