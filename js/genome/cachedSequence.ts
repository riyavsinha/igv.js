/**
 * Wrapper for a sequence loader that provides caching
 */

import SequenceInterval from "./sequenceInterval"
import Chromosome from "./chromosome"
import type Browser from "../browser.js"
import type ReferenceFrame from "../referenceFrame.js"

interface SequenceReader {
    chromosomes?: Map<string, Chromosome>
    chromosomeNames?: string[]
    init(): Promise<unknown>
    readSequence(chr: string, start: number, end: number): Promise<string | null>
    getSequenceRecord?(chr: string): unknown
    getFirstChromosomeName?(): string
}

class CachedSequence {

    static #minQuerySize: number = 1e5
    #currentQuery: [SequenceInterval, Promise<SequenceInterval>] | undefined
    #cachedIntervals: SequenceInterval[] = []
    #maxIntervals: number = 10   // TODO - this should be >= the number of viewports for multi-locus view
    sequenceReader: SequenceReader
    browser: Browser | undefined

    constructor(sequenceReader: SequenceReader, browser?: Browser) {
        this.sequenceReader = sequenceReader
        this.browser = browser
    }

    get chromosomes(): Map<string, Chromosome> | undefined {
        return this.sequenceReader.chromosomes
    }

    async getSequenceRecord(chr: string): Promise<Chromosome | undefined> {
        return this.sequenceReader.getSequenceRecord ? this.sequenceReader.getSequenceRecord(chr) as Chromosome | undefined : undefined
    }

    async getSequence(chr: string, start: number, end: number): Promise<string | null | undefined> {

        let interval: SequenceInterval | undefined = this.#cachedIntervals.find(i => i.contains(chr, start, end))
        if (!interval) {
            interval = await this.#queryForSequence(chr, start, end)
            this.#trimCache(interval)
            this.#cachedIntervals.push(interval)
        }

        if (interval) {
            const offset: number = start - interval.start
            const n: number = end - start
            const seq: string | null = interval.features ? interval.features.substring(offset, offset + n) : null
            return seq
        } else {
            return undefined
        }
    }

    #trimCache(interval: SequenceInterval): void {
        // Filter out redundant (subsumed) cached intervals
        this.#cachedIntervals = this.#cachedIntervals.filter(i => !interval.containsRange(i))
        if (this.#cachedIntervals.length === this.#maxIntervals) {
            this.#cachedIntervals.shift()
        }

        // Filter out out-of-view cached intervals.  Don't try this if there are too many frames, inefficient
        if (this.browser && this.browser.referenceFrameList.length < 100) {
            this.#cachedIntervals = this.#cachedIntervals.filter(i => {
                const b: boolean = undefined !== this.browser!.referenceFrameList.find((frame: ReferenceFrame) => frame.overlaps(i))
                if(!b) {
                   // console.log("Filtering " + i.locusString)
                }
                return b;
            })
        }
    }

    /**
     * Return the first cached interval containing the specified region, or undefined if no interval is found.
     *
     * @param chr
     * @param start
     * @param end
     * @returns a SequenceInterval or undefined
     */
    getSequenceInterval(chr: string, start: number, end: number): SequenceInterval | undefined {
        return this.#cachedIntervals.find(i => i.contains(chr, start, end))
    }

    /**
     * Query for a sequence.  Returns a promise that is resolved when the asynchronous call to read sequence returns.
     *
     * @param chr
     * @param start
     * @param end
     * @returns {Promise<SequenceInterval>}
     */
    async #queryForSequence(chr: string, start: number, end: number): Promise<SequenceInterval> {
        // Expand query, to minimum of 100kb
        let qstart: number = start
        let qend: number = end
        if ((end - start) < CachedSequence.#minQuerySize) {
            const w: number = (end - start)
            const center: number = Math.round(start + w / 2)
            qstart = Math.max(0, center - CachedSequence.#minQuerySize/2)
            qend = qstart + CachedSequence.#minQuerySize
        }
        // Note: SequenceInterval.features will be populated asynchronously below
        const interval: SequenceInterval = new SequenceInterval(chr, qstart, qend, null)

        if (this.#currentQuery && this.#currentQuery[0].contains(chr, start, end)) {
            return this.#currentQuery[1]
        } else {
            const queryPromise: Promise<SequenceInterval> = new Promise(async (resolve, reject) => {
                interval.features = await this.sequenceReader.readSequence(chr, qstart, qend)
                resolve(interval)
            })
            this.#currentQuery = [interval, queryPromise]
            return queryPromise
        }
    }


    async init(): Promise<void> {
        await this.sequenceReader.init()
    }

    get chromosomeNames(): string[] | undefined {
        return this.sequenceReader.chromosomeNames
    }

    getFirstChromosomeName(): string | undefined {
        return typeof this.sequenceReader.getFirstChromosomeName === 'function' ? this.sequenceReader.getFirstChromosomeName() : undefined
    }

    #isIntervalInView(interval: SequenceInterval): void {
        this.browser!.referenceFrameList
    }
}


export default CachedSequence
