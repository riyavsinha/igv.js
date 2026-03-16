import {igvxhr} from "../../node_modules/igv-utils/src/index.js"
import type {LoadConfig} from "../types/config"

interface GtexEqtlJson {
    chromosome: string
    pos: number
    snpId: string
    geneSymbol: string
    pValue: number
    [key: string]: unknown
}

/**
 * EQTL reader for GTEX webservice
 */
class GtexReader {

    config: LoadConfig
    url: string
    tissueId: string
    datasetId: string

    gtexChrs = new Set(["chr1", "chr10", "chr11", "chr12", "chr13", "chr14", "chr15", "chr16", "chr17", "chr18",
        "chr19", "chr2", "chr20", "chr21", "chr22", "chr3", "chr4", "chr5", "chr6", "chr7", "chr8", "chr9", "chrM",
        "chrX", "chrY"])

    constructor(config: LoadConfig) {

        this.config = config
        this.url = config.url as string
        this.tissueId = config.tissueSiteDetailId as string
        this.datasetId = (config.datasetId as string) || "gtex_v8"
    }

    async readFeatures(chr: string, bpStart: number, bpEnd: number) {

        // GTEX uses UCSC chromosome naming conventions.
        const queryChr = chr.startsWith("chr") ? chr : chr === "MT" ? "chrM" : "chr" + chr

        if (!this.gtexChrs.has(queryChr)) {
            return []
        }

        const queryStart = Math.floor(bpStart)
        const queryEnd = Math.ceil(bpEnd)
        const datasetId = this.datasetId
        const queryURL = this.url + "?chromosome=" + queryChr + "&start=" + queryStart + "&end=" + queryEnd +
            "&tissueSiteDetailId=" + this.tissueId + "&datasetId=" + datasetId

        const json = await igvxhr.loadJson(queryURL, {
            withCredentials: this.config.withCredentials
        })

        if (json && json.singleTissueEqtl) {
            return json.singleTissueEqtl.map((json: GtexEqtlJson) => new EQTL(json))
        } else {
            return []
        }
    }
}

// Example GTEX eqtl
// {
//     "chromosome": "chr16",
//     "datasetId": "gtex_v8",
//     "gencodeId": "ENSG00000275445.1",
//     "geneSymbol": "CTD-2649C14.3",
//     "geneSymbolUpper": "CTD-2649C14.3",
//     "nes": 0.51295,
//     "pValue": 5.57674e-14,
//     "pos": 21999621,
//     "snpId": "rs35368623",
//     "tissueSiteDetailId": "Muscle_Skeletal",
//     "variantId": "chr16_21999621_G_GA_b38"
// }


class EQTL {

    chr: string
    start: number
    end: number
    snp: string
    phenotype: string
    pValue: number
    json: GtexEqtlJson
    px?: number
    py?: number
    radius?: number

    constructor(eqtl: GtexEqtlJson) {
        this.chr = eqtl.chromosome
        this.start = eqtl.pos - 1
        this.end = this.start + 1
        this.snp = eqtl.snpId
        this.phenotype = eqtl.geneSymbol
        this.pValue = eqtl.pValue
        this.json = eqtl
    }

    popupData() {
        return Object.keys(this.json).map(key => {
            return {name: key, value: this.json[key]}
        })
    }
}



export default GtexReader