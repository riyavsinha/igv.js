// This is a port of trix-js from the GMOD repository:  https://github.com/GMOD/trix-js,
// developed by Colin Diesh, Robert Buels, and Matt Morgan.   The purpose of the port is to (1) remove dependencies
// on Node classes and objects, such as "Buffer",  and (2) re-write in javascript to run in the browser without
// any further transformations.   Modifications by myself, James Robinson
//
// A copy of the license for the GMOD trix-js distribution on which this is based may be downloaded
// from:  https://raw.githubusercontent.com/GMOD/trix-js/ma

import {igvxhr} from "../../node_modules/igv-utils/src/index.js"


// this is the number of hex characters to use for the address in ixixx, see
// https://github.com/GMOD/ixixx-js/blob/master/src/index.ts#L182
const ADDRESS_SIZE: number = 10

type IndexEntry = [string, number]

export default class Trix {

    ixFile: string  // URL to the ix file
    ixxFile: string  // URL to the ixx file
    bufferCache: Map<number, string> = new Map()
    index: IndexEntry[] | undefined

    constructor(ixxFile: string, ixFile: string) {
        this.ixFile = ixFile
        this.ixxFile = ixxFile
    }

    /**
     * @param searchString
     * @param opts
     * @returns {Promise<Map<string, string[]>|undefined>}
     */
    async search(searchString: string, opts?: Record<string, unknown>): Promise<Map<string, string[]> | undefined> {

        const searchWords: string[] = searchString.split(' ')

        // we only support a single search term
        const searchWord: string = searchWords[0].toLowerCase()
        const str: string | undefined = await this._getBuffer(searchWord, opts)
        if (!str) {
            return undefined
        }

        const lines: string[] = str
            .slice(0, str.lastIndexOf('\n'))
            .split('\n')
            .filter((f: string) => !!f)

        const matches: string[] = []
        for (let line of lines) {
            const word: string = line.split(' ')[0]
            const match: boolean = word.startsWith(searchWord)
            if (match) {
                matches.push(line)
            }
            // we are done scanning if we are lexicographically greater than the search string
            if (word.slice(0, searchWord.length) > searchWord) {
                break
            }
        }

        if (matches.length === 0) {
            return undefined
        } else {
            const results: Map<string, string[]> = new Map()
            for (let m of matches) {
                const [term, ...parts] = m.split(' ')
                results.set(term, parts.map((p: string) => p.split(',')[0]))
            }
            return results
        }
    }

    async getIndex(opts?: Record<string, unknown>): Promise<IndexEntry[]> {
        if (!this.index) {
            this.index = await this._readIndex()
        }
        return this.index
    }

    async _readIndex(): Promise<IndexEntry[]> {

        const file: string = await igvxhr.loadString(this.ixxFile)

        return file
            .split('\n')
            .filter((f: string) => !!f)
            .map((line: string): IndexEntry => {
                const p: number = line.length - ADDRESS_SIZE
                const prefix: string = line.slice(0, p)
                const posStr: string = line.slice(p)
                const pos: number = Number.parseInt(posStr, 16)
                return [prefix, pos]
            })
    }

    async _getBuffer(searchWord: string, opts?: Record<string, unknown>): Promise<string | undefined> {

        let start: number = 0
        let end: number = 65536
        const indexes: IndexEntry[] = await this.getIndex(opts)
        for (let i = 0; i < indexes.length; i++) {
            const [key, value]: IndexEntry = indexes[i]
            const trimmedEnd: number = Math.min(key.length, searchWord.length)
            const trimmedKey: string = key.slice(0, trimmedEnd)
            if (trimmedKey < searchWord) {
                start = value
                end = value + 65536
            }
        }

        // Return the buffer and its end position in the file.
        const len: number = end - start
        if (len < 0) {
            return undefined
        }

        if (this.bufferCache.has(start)) {
            return this.bufferCache.get(start)
        } else {
            const buffer: string = await igvxhr.loadString(this.ixFile, {range: {start, size: len}})
            this.bufferCache.set(start, buffer)
            return buffer
        }

    }
}
