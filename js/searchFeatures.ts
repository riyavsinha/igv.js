// Lazy import to avoid circular dependency
import {igvxhr, StringUtils} from "../node_modules/igv-utils/src/index.js"

const DEFAULT_SEARCH_CONFIG = {
    timeout: 5000,
    type: "plain",
    url: 'https://igv.org/genomes/locus.php?genome=$GENOME$&name=$FEATURE$',
    coords: 0
}

// TODO: Replace with proper Browser type once browser.ts is migrated
interface SearchConfig {
    timeout?: number
    type?: string
    url: string
    coords?: number
    resultsField?: string
    chromosomeField?: string
    startField?: string
    endField?: string
    geneField?: string
    snpField?: string
}

interface LocusResult {
    chr: string
    start: number
    end: number
    name?: string
}

async function searchFeatures(browser: any, name: string): Promise<LocusResult | undefined> {

    const searchConfig = browser.searchConfig || DEFAULT_SEARCH_CONFIG
    let feature: LocusResult | undefined

    name = name.toUpperCase()

    // Search MANE transcripts first, if available
    feature = await browser.genome.getManeTranscript(name)
    if (feature) {
        return feature
    }

    const searchableTracks = browser.tracks.filter((t: any) => t.searchable)
    for (let track of searchableTracks) {
        const feature = await track.search(name)
        if (feature) {
            return feature
        }
    }

    // If still not found try webservice, if enabled
    if (browser.config && false !== browser.config.search) {
        try {
            feature = await searchWebService(browser, name, searchConfig)
            return feature    // Might be undefined
        } catch (error) {
            console.log("Search service not available " + error)
        }
    }

}

async function searchWebService(browser: any, locus: string, searchConfig: SearchConfig): Promise<LocusResult | undefined> {

    let path = searchConfig.url.replace("$FEATURE$", locus.toUpperCase())
    if (path.indexOf("$GENOME$") > -1) {
        path = path.replace("$GENOME$", (browser.genome.id ? browser.genome.id : "hg19"))
    }
    const options = searchConfig.timeout ? {timeout: searchConfig.timeout} : undefined
    const result = await igvxhr.loadString(path, options)

    return await processSearchResult(browser, result, searchConfig)
}

async function processSearchResult(browser: any, result: string, searchConfig: SearchConfig): Promise<LocusResult | undefined> {

    let results: any

    if ('plain' === searchConfig.type) {
        results = await parseSearchResults(browser, result)
    } else {
        results = JSON.parse(result)
    }

    if (searchConfig.resultsField) {
        results = results[searchConfig.resultsField]
    }

    if (!results || 0 === results.length) {
        return undefined

    } else {

        const chromosomeField = searchConfig.chromosomeField || "chromosome"
        const startField = searchConfig.startField || "start"
        const endField = searchConfig.endField || "end"
        const coords = searchConfig.coords || 1


        let result: any
        if (Array.isArray(results)) {
            // Ignoring all but first result for now
            // TODO -- present all and let user select if results.length > 1
            result = results[0]
        } else {
            // When processing search results from Ensembl REST API
            // Example: https://rest.ensembl.org/lookup/symbol/macaca_fascicularis/BRCA2?content-type=application/json
            result = results
        }

        if (!(result.hasOwnProperty(chromosomeField) && (result.hasOwnProperty(startField)))) {
            console.error("Search service results must include chromosome and start fields: " + result)
        }

        const chr = result[chromosomeField]
        let start = result[startField] - coords
        let end = result[endField]
        if (undefined === end) {
            end = start + 1
        }

        const locusObject: LocusResult = {chr, start, end}

        // Some GTEX hacks
        if (searchConfig.geneField && searchConfig.snpField) {
            const name = result[searchConfig.geneField] || result[searchConfig.snpField]  // Should never have both
            if (name) locusObject.name = name.toUpperCase()
        }

        return locusObject
    }
}

async function parseSearchResults(browser: any, data: string): Promise<LocusResult[]> {

    const results: LocusResult[] = []
    const lines = StringUtils.splitLines(data)

    for (let line of lines) {

        const tokens = line.split("\t")

        if (tokens.length >= 3) {
            const locusTokens = tokens[1].split(":")
            const rangeTokens = locusTokens[1].split("-")
            results.push({
                chromosome: browser.genome.getChromosomeName(locusTokens[0].trim()),
                start: parseInt(rangeTokens[0].replace(/,/g, '')),
                end: parseInt(rangeTokens[1].replace(/,/g, '')),
                name: tokens[0].toUpperCase()
            } as any)
        }
    }

    return results

}

export {searchFeatures, searchWebService}
