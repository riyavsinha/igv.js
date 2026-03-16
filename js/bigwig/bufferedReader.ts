
import {igvxhr} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions} from "../util/igvUtils"
import type {LoadConfig} from "../types/config.js"

interface ByteRange {
    start: number
    size: number
}

class BufferedReader {

    path: string
    config: LoadConfig
    bufferSize: number
    range: ByteRange
    data: ArrayBuffer | undefined
    contentLength: number | undefined

    constructor(config: LoadConfig, bufferSize: number = 512000) {
        this.path = config.url as string
        this.bufferSize = bufferSize
        this.range = {start: -1, size: -1}
        this.config = config
    }

    /**
     *
     * @param requestedRange - byte rangeas {start, size}
     * @param asUint8 - optional flag to return result as an UInt8Array
     * @param retries - number of retries attempted
     */
    async dataViewForRange(requestedRange: ByteRange, asUint8?: boolean, retries: number = 0): Promise<DataView | Uint8Array | undefined> {
        try {

            const hasData: boolean = (!!this.data && (this.range.start <= requestedRange.start) &&
                ((this.range.start + this.range.size) >= (requestedRange.start + requestedRange.size)))

            if (!hasData) {
                let bufferSize: number
                // If requested range size is specified, potentially expand buffer size
                if (requestedRange.size) {
                    bufferSize = Math.max(this.bufferSize, requestedRange.size)
                } else {
                    bufferSize = this.bufferSize
                }
                if (this.contentLength) {
                    bufferSize = Math.min(bufferSize, this.contentLength - requestedRange.start)
                }
                const loadRange: ByteRange = {start: requestedRange.start, size: bufferSize}
                const arrayBuffer: ArrayBuffer = await igvxhr.loadArrayBuffer(this.path, buildOptions(this.config, {range: loadRange}))
                this.data = arrayBuffer
                this.range = loadRange
            }

            const len: number = this.data!.byteLength
            const bufferStart: number = requestedRange.start - this.range.start
            return asUint8 ?
                new Uint8Array(this.data!, bufferStart, len - bufferStart) :
                new DataView(this.data!, bufferStart, len - bufferStart)
        } catch (e: unknown) {
            if (retries === 0 && e instanceof Error && e.message && e.message.startsWith("416")) {
                try {
                    this.contentLength = await igvxhr.getContentLength(this.path, buildOptions(this.config))
                    return this.dataViewForRange(requestedRange, asUint8, ++retries)
                } catch (e1) {
                    console.error(e1)
                }
                throw e
            }
        }
    }
}

export default BufferedReader
