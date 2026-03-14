import {igvxhr, FileUtils} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions} from "../util/igvUtils"

interface CramConfig {
    cacheFetches?: boolean
    fetchSize?: number
    [key: string]: any
}

interface LoadRange {
    start: number
    size: number
}

export default class FileHandler {

    position: number
    url: string | File
    config: CramConfig
    useCache: boolean
    cache: Cache | undefined

    constructor(source: string | File, config: CramConfig) {
        this.position = 0
        this.url = source
        this.config = config
        if (FileUtils.isFile(source) || config.cacheFetches === false) {
            this.useCache = false
        } else {
            this.useCache = true
            this.cache = new Cache({
                fetch: (start: number, length: number) => this._fetch(start, length),
                fetchSize: config.fetchSize || 10000
            })
        }
    }

    async _fetch(position: number, length: number): Promise<ArrayBuffer> {
        const loadRange: LoadRange = {start: position, size: length}
        const arrayBuffer = await igvxhr.loadArrayBuffer(this.url, buildOptions(this.config, {range: loadRange}))
        return arrayBuffer
    }

    async read(length: number, position: number = 0): Promise<Uint8Array> {

        let buf: ArrayBuffer
        if (this.useCache) {
            buf = await this.cache!.get(position, length)
        } else {
            buf = await this._fetch(position, length)
        }
        return new Uint8Array(buf)
    }

    async readFile(): Promise<Uint8Array> {
        const arrayBuffer = await igvxhr.loadArrayBuffer(this.url, buildOptions(this.config))
        return new Uint8Array(arrayBuffer)
    }

}

/**
 * A crude cache designed for observed access patterns of the cram-js library for cram files
 */

class Cache {

    maxChunkCount: number = 5
    chunks: Chunk[] = []
    fetch: (start: number, length: number) => Promise<ArrayBuffer>
    fetchSize: number

    constructor({fetch, fetchSize = 30000}: { fetch: (start: number, length: number) => Promise<ArrayBuffer>; fetchSize?: number }) {
        this.fetch = fetch
        this.fetchSize = fetchSize
    }

    async get(start: number, length: number): Promise<ArrayBuffer> {

        const end = start + length
        for (let c of this.chunks) {
           // console.log("Cache hit")
            if (c.contains(start, end)) {
                const offset = start - c.start
                return c.buffer.slice(offset, offset + length)
            }
        }

        //console.log("Cache miss")
        const l = Math.max(length, this.fetchSize)
        const s = Math.max(0, start - 1000)
        const e = start + l + 1000
        const buffer = await this.fetch(s, e - s)
        const c = new Chunk(s, e, buffer)
        if (this.chunks.length > this.maxChunkCount) this.chunks.shift()
        this.chunks.push(c)

        const bufferStart = start - c.start
        const bufferEnd = bufferStart + length
        return buffer.slice(bufferStart, bufferEnd)

    }
}

class Chunk {

    start: number
    end: number
    buffer: ArrayBuffer

    constructor(start: number, end: number, buffer: ArrayBuffer) {
        this.start = start
        this.end = end
        this.buffer = buffer
    }

    contains(start: number, end: number): boolean {
        return start >= this.start && end <= this.end
    }
}
