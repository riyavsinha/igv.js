import BWReader from "../bigwig/bwReader"
import ChromAliasDefaults from "./chromAliasDefaults"

/**
 * Chromosome alias source backed by a UCSC bigbed file
 *
 *
 * @param aliasURL
 * @param config
 * @returns {Promise<*[]>}
 */

class ChromAliasBB {

    aliasRecordCache: Map<string, Record<string, string>> = new Map()
    reader: any

    constructor(url: string, config: any, genome: any) {
        config = config || {}
        config.url = url
        this.reader = new BWReader(config, genome)
    }

    async preload(chrNames: string[]): Promise<void> {
       await this.reader.preload()
        for(let nm of chrNames) {
            await this.search(nm)
        }
    }

    /**
     * Return the cached canonical chromosome name for the alias.  If none found return the alias.
     *
     * Note this will only work if a "search" for ths chromosome has been performed previously.
     *
     * @param alias
     * @returns {*}
     */
    getChromosomeName(alias: string): string {
        return this.aliasRecordCache.has(alias) ? this.aliasRecordCache.get(alias)!.chr : alias
    }

    /**
     * Return an alternate chromosome name (alias).  If not exists, return chr
     *
     * Note this will only work if a "search" for ths chromosome has been performed previously.
     *
     * @param chr
     * @param nameSet -- The name set, e.g. "ucsc"
     * @returns {*|undefined}
     */
    getChromosomeAlias(chr: string, nameSet: string): string
    {
        const aliasRecord =  this.aliasRecordCache.get(chr)
        return aliasRecord ? aliasRecord[nameSet] || chr : chr
    }

    /**
     * Search for chromosome alias bed record.  If found, cache results in the alias -> chr map
     * @param alias
     * @returns {Promise<any>}
     */
    async search(alias: string): Promise<Record<string, string> | undefined> {
        if (!this.aliasRecordCache.has(alias)) {
            const aliasRecord = await this.reader.search(alias)
            if (aliasRecord) {
                ChromAliasDefaults.addCaseAliases(aliasRecord)
                for (let key of Object.keys(aliasRecord)) {
                    if ("start" !== key && "end" !== key) {
                        this.aliasRecordCache.set(aliasRecord[key], aliasRecord)
                    }
                }
            }
        }
        return this.aliasRecordCache.get(alias)
    }
}

export default ChromAliasBB
