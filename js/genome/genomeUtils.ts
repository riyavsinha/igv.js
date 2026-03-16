import {igvxhr, StringUtils} from "../../node_modules/igv-utils/src/index.js"
import {convertToHubURL} from "../ucsc/ucscUtils.js"
import {loadHub} from "../ucsc/hub/hub.js"
import type {GenomeConfig} from "../types/genome.js"
import type {BrowserConfig} from "../types/config.js"

interface AlertLike {
    present(alert: Error | string, callback?: (() => void) | undefined): void
}

const DEFAULT_GENOMES_URL: string = "https://igv.org/genomes/genomes3.json"
const BACKUP_GENOMES_URL: string = "https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/genomes/web/genomes.json"

const GenomeUtils: {
    KNOWN_GENOMES: Record<string, GenomeConfig> | undefined
    initializeGenomes: (config: BrowserConfig) => Promise<void>
    isWholeGenomeView: (chr: string) => boolean
    expandReference: (alert: AlertLike, idOrConfig: string | Record<string, unknown>) => Promise<GenomeConfig | Record<string, unknown> | undefined>
} = {

    KNOWN_GENOMES: undefined,

    initializeGenomes: async function (config: BrowserConfig): Promise<void> {

        if (!GenomeUtils.KNOWN_GENOMES) {

            let table: Record<string, GenomeConfig> = {}

            const processJson = (jsonArray: GenomeConfig[], table: Record<string, GenomeConfig>): Record<string, GenomeConfig> => {
                jsonArray.forEach(function (json: GenomeConfig) {
                    table[json.id!] = json
                })
                return table
            }

            // Get default genomes
            if (config.loadDefaultGenomes !== false) {
                try {
                    const jsonArray: GenomeConfig[] = await igvxhr.loadJson(DEFAULT_GENOMES_URL, {timeout: 2000})
                    processJson(jsonArray, table)
                } catch (error) {
                    try {
                        console.error("Error initializing default genomes:", error)
                        const jsonArray: GenomeConfig[] = await igvxhr.loadJson(BACKUP_GENOMES_URL, {timeout: 10000})
                        processJson(jsonArray, table)
                    } catch (e) {
                        console.error("Error initializing backup genomes:", error)
                    }
                }
            }

            // Append user-defined genomes, which might override defaults
            const genomeList: GenomeConfig[] | string | undefined = (config.genomeList || config.genomes) as GenomeConfig[] | string | undefined
            if (genomeList) {
                if (typeof genomeList === 'string') {
                    const jsonArray: GenomeConfig[] = await igvxhr.loadJson(genomeList, {})
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
    expandReference: async function (alert: AlertLike, idOrConfig: string | Record<string, unknown>): Promise<GenomeConfig | Record<string, unknown> | undefined> {

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
            const knownGenomes = GenomeUtils.KNOWN_GENOMES
            let reference: GenomeConfig | Record<string, unknown> | undefined = knownGenomes ? knownGenomes[genomeID] : undefined
            if (!reference) {
                if ((genomeID.startsWith("GCA_") || genomeID.startsWith("GCF_")) && genomeID.length >= 13) {
                    try {
                        const hubURL = convertToHubURL(genomeID)!
                        const hub = await loadHub(hubURL)
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
            return idOrConfig as Record<string, unknown>
        }
    }
}

export default GenomeUtils
