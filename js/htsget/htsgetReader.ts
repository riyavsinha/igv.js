import {FileUtils, igvxhr} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions} from "../util/igvUtils"

interface HtsgetConfig {
    format?: string
    url?: string
    endpoint?: string
    id?: string
    name?: string
    sourceType?: string
    [key: string]: any
}

interface HtsgetUrlData {
    url: string
    headers?: Record<string, string>
}

interface HtsgetTicket {
    htsget: {
        urls: HtsgetUrlData[]
        format?: string
    }
}

class HtsgetReader {

    config: HtsgetConfig
    genome: any
    format: string

    constructor(config: HtsgetConfig, genome: any) {
        this.config = config
        this.genome = genome
        if (config.format) {
            this.format = config.format.toUpperCase()
        } else {
            throw Error('Format is required, and must be either "bam" or "cram"')
        }
        if (!(this.format === "BAM" || this.format === "VCF")) {
            throw Error(`htsget format ${config.format} is not supported`)
        }
    }

    async readHeaderData(): Promise<Uint8Array> {
        const url = `${getUrl(this.config)}?class=header&format=${this.format}`
        const ticket: HtsgetTicket = await igvxhr.loadJson(url, buildOptions(this.config))
        return await this.loadUrls(ticket.htsget.urls)
    }

    async readData(chr: string, start: number, end: number): Promise<Uint8Array> {
        const url = `${getUrl(this.config)}?format=${this.format}&referenceName=${chr}&start=${Math.floor(start)}&end=${Math.ceil(end)}`
        const ticket: HtsgetTicket = await igvxhr.loadJson(url, buildOptions(this.config))
        return this.loadUrls(ticket.htsget.urls)
    }

    async loadUrls(urls: HtsgetUrlData[]): Promise<Uint8Array> {

        const promiseArray: Promise<ArrayBuffer>[] = []
        for (let urlData of urls) {

            if (urlData.url.startsWith('data:')) {
                // this is a data-uri
                promiseArray.push(Promise.resolve(dataUriToBytes(urlData.url)))

            } else {
                const options = {headers: urlData.headers || {}}
                promiseArray.push(igvxhr.loadArrayBuffer(urlData.url, options))
            }
        }
        const arrayBuffers: ArrayBuffer[] = await Promise.all(promiseArray)
        return concatArrays(arrayBuffers)
    }


    static async inferFormat(config: HtsgetConfig): Promise<void> {
        try {
            const url = getUrl(config)
            const headerURL = `${url}${url.includes("?") ? "&" : "?"}class=header`
            const ticket: HtsgetTicket = await igvxhr.loadJson(headerURL, buildOptions(config))
            if (ticket.htsget) {
                const format = ticket.htsget.format
                if (!(format === "BAM" || format === "VCF")) {
                    throw Error(`htsget format ${format} is not supported`)
                }
                config.format = format!.toLowerCase()
                config.sourceType = "htsget"
                if (!config.name) {
                    config.name = FileUtils.getFilename(config.url)
                }
            }
        } catch (e) {
            // Errors => this is not an htsget source, not an application error.  Ignore
        }
    }
}

/**
 * Extract the full url from the config.  Striving for backward compatibility, "endpoint" and "id" are deprecated.
 */
function getUrl(config: HtsgetConfig): string {
    if (config.url && config.endpoint && config.id) {
        return config.url + config.endpoint + config.id    // Deprecated
    } else if (config.endpoint && config.id) {
        return config.endpoint + config.id                // Deprecated
    } else if (config.url) {
        if (config.url.startsWith("htsget://")) {
            return config.url.replace("htsget://", "https://")    // htsget -> http not supported
        } else {
            return config.url
        }
    } else {
        throw Error("Must specify either 'url', or 'endpoint' and 'id")
    }


}

/**
 * Concatenate a list of array buffers, returning an UInt8Array
 */
function concatArrays(arrayBuffers: ArrayBuffer[]): Uint8Array {

    let len = 0
    for (let a of arrayBuffers) {
        len += a.byteLength
    }

    let offset = 0
    const newArray = new Uint8Array(len)
    for (let buf of arrayBuffers) {
        const a = new Uint8Array(buf)
        newArray.set(a, offset)
        offset += a.length
    }

    return newArray
}

function dataUriToBytes(dataUri: string): ArrayBuffer {

    const split = dataUri.split(',')
    const info = split[0].split(':')[1]
    let dataString = split[1]

    if (info.indexOf('base64') >= 0) {
        dataString = atob(dataString)
    } else {
        dataString = decodeURI(dataString)
    }

    const bytes = new Uint8Array(dataString.length)
    for (let i = 0; i < dataString.length; i++) {
        bytes[i] = dataString.charCodeAt(i)
    }

    return bytes.buffer
}


export default HtsgetReader
