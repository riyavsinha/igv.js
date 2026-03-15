import {igvxhr, StringUtils} from "../../node_modules/igv-utils/src/index.js"
import {convertToHubURL} from "../ucsc/ucscUtils.js"
import {loadHub} from "../ucsc/hub/hub.js"

const DEFAULT_GENOMES_URL: string = "https://igv.org/genomes/genomes3.json"
const BACKUP_GENOMES_URL: string = "https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/genomes/web/genomes.json"

const GenomeUtils: {
    KNOWN_GENOMES: Record<string, any> | undefined
    initializeGenomes: (config: any) => Promise<void>
    isWholeGenomeView: (chr: string) => boolean
    expandReference: (alert: any, idOrConfig: string | Record<string, unknown>) => Promise<any>
} = {

    KNOWN_GENOMES: undefined,

    initializeGenomes: async function (config: any): Promise<void> {

        if (!GenomeUtils.KNOWN_GENOMES) {

            let table: Record<string, any> = {}

            const processJson = (jsonArray: any[], table: Record<string, any>): Record<string, any> => {
                jsonArray.forEach(function (json: any) {
                    table[json.id] = json
                })
                return table
            }

            // Get default genomes
            if (config.loadDefaultGenomes !== false) {
                try {
                    const jsonArray: any[] = await igvxhr.loadJson(DEFAULT_GENOMES_URL, {timeout: 2000})
                    processJson(jsonArray, table)
                } catch (error) {
                    try {
                        console.error("Error initializing default genomes:", error)
                        const jsonArray: any[] = await igvxhr.loadJson(BACKUP_GENOMES_URL, {timeout: 10000})
                        processJson(jsonArray, table)
                    } catch (e) {
                        console.error("Error initializing backup genomes:", error)
                    }
                }
            }

            // Append user-defined genomes, which might override defaults
            const genomeList: any = config.genomeList || config.genomes
            if (genomeList) {
                if (typeof genomeList === 'string') {
                    const jsonArray: any[] = await igvxhr.loadJson(genomeList, {})
                     processJson(jsonArray, table)
                } else {
                     processJson(genomeList, table)
                }
            }
            GenomeUtils.KNOWN_GENOMES = table
        }
    },

    isWholeGenomeView: function (chr: string): boolean {
        return 'all' === chr.toLowerCase()
    },

    // Expand a genome id to a reference object, if needed
    expandReference: async function (alert: any, idOrConfig: string | Record<string, unknown>): Promise<any> {

        // idOrConfig might be a json string?  I'm actually not sure how this arises.
        if (StringUtils.isString(idOrConfig) && (idOrConfig as string).startsWith("{")) {
            try {
                idOrConfig = JSON.parse(idOrConfig as string)
            } catch (e) {
                // Apparently its not json,  could be an ID starting with "{".  Unusual but legal.
            }
        }

        let genomeID: string | undefined
        if (StringUtils.isString(idOrConfig)) {
            genomeID = idOrConfig as string
        } else if ((idOrConfig as Record<string, unknown>).genome) {
            genomeID = (idOrConfig as Record<string, unknown>).genome as string
        } else if ((idOrConfig as Record<string, unknown>).id !== undefined && !((idOrConfig as Record<string, unknown>).fastaURL || (idOrConfig as Record<string, unknown>).twobitURL)) {
            // Backward compatibility
            genomeID = (idOrConfig as Record<string, unknown>).id as string
        }

        if (genomeID) {
            const knownGenomes: Record<string, any> | undefined = GenomeUtils.KNOWN_GENOMES
            let reference: any = knownGenomes ? knownGenomes[genomeID] : undefined
            if (!reference) {
                if ((genomeID.startsWith("GCA_") || genomeID.startsWith("GCF_")) && genomeID.length >= 13) {
                    try {
                        const hubURL = convertToHubURL(genomeID)!
                        const hub: any = await loadHub(hubURL)
                        reference = hub.getGenomeConfig(genomeID)
                    } catch (e) {
                        console.error(e)
                    }
                }

                if (!reference) {
                    alert.present(new Error(`Unknown genome id: ${genomeID}`), undefined)
                }
            }
            return reference
        } else {
            return idOrConfig
        }
    }
}

export default GenomeUtils
