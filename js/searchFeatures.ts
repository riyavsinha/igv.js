// Lazy import to avoid circular dependency
import {igvxhr, StringUtils} from "../node_modules/igv-utils/src/index.js"
import type Browser from "./browser.js"
import type {Track} from "./types/ui.js"

const DEFAULT_SEARCH_CONFIG = {
    timeout: 5000,
    type: "plain",
    url: 'https://igv.org/genomes/locus.php?genome=$GENOME$&name=$FEATURE$',
    coords: 0
}

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

async function searchFeatures(browser: Browser, name: string): Promise<LocusResult | undefined> {

    const searchConfig = browser.searchConfig || DEFAULT_SEARCH_CONFIG
    let feature: LocusResult | undefined

    name = name.toUpperCase()

    // Search MANE transcripts first, if available
    feature = await browser.genome.getManeTranscript(name) as LocusResult | undefined
    if (feature) {
        return feature
    }

    const searchableTracks = browser.tracks.filter((t: Track) => t.searchable)
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

async function searchWebService(browser: Browser, locus: string, searchConfig: SearchConfig): Promise<LocusResult | undefined> {

    let path = searchConfig.url.replace("$FEATURE$", locus.toUpperCase())
    if (path.indexOf("$GENOME$") > -1) {
        path = path.replace("$GENOME$", (browser.genome.id ? browser.genome.id : "hg19"))
    }
    const options = searchConfig.timeout ? {timeout: searchConfig.timeout} : undefined
    const result = await igvxhr.loadString(path, options)

    return await processSearchResult(browser, result, searchConfig)
}

async function processSearchResult(browser: Browser, result: string, searchConfig: SearchConfig): Promise<LocusResult | undefined> {

    let results: Record<string, unknown> | Record<string, unknown>[]

    if ('plain' === searchConfig.type) {
        results = await parseSearchResults(browser, result)
    } else {
        results = JSON.parse(result)
    }

    if (searchConfig.resultsField) {
        results = (results as Record<string, unknown>)[searchConfig.resultsField] as Record<string, unknown> | Record<string, unknown>[]
    }

    if (!results || (Array.isArray(results) && 0 === results.length)) {
        return undefined

    } else {

        const chromosomeField = searchConfig.chromosomeField || "chromosome"
        const startField = searchConfig.startField || "start"
        const endField = searchConfig.endField || "end"
        const coords = searchConfig.coords || 1


        let resultRecord: Record<string, unknown>
        if (Array.isArray(results)) {
            // Ignoring all but first result for now
            // TODO -- present all and let user select if results.length > 1
            resultRecord = results[0]
        } else {
            // When processing search results from Ensembl REST API
            // Example: https://rest.ensembl.org/lookup/symbol/macaca_fascicularis/BRCA2?content-type=application/json
            resultRecord = results
        }

        if (!(resultRecord.hasOwnProperty(chromosomeField) && (resultRecord.hasOwnProperty(startField)))) {
            console.error("Search service results must include chromosome and start fields: " + resultRecord)
        }

        const chr = resultRecord[chromosomeField] as string
        let start = (resultRecord[startField] as number) - coords
        let end = resultRecord[endField] as number | undefined
        if (undefined === end) {
            end = start + 1
        }

        const locusObject: LocusResult = {chr, start, end}

        // Some GTEX hacks
        if (searchConfig.geneField && searchConfig.snpField) {
            const name = (resultRecord[searchConfig.geneField] || resultRecord[searchConfig.snpField]) as string | undefined  // Should never have both
            if (name) locusObject.name = name.toUpperCase()
        }

        return locusObject
    }
}

async function parseSearchResults(browser: Browser, data: string): Promise<Record<string, unknown>[]> {

    const results: Record<string, unknown>[] = []
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
            })
        }
    }

    return results

}

export {searchFeatures, searchWebService}
