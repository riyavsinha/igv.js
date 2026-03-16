import {igvxhr, StringUtils} from "../../node_modules/igv-utils/src/index.js"
import type {GenomicFeature} from "../types/feature"

const isString = StringUtils.isString

interface CustomServiceConfig {
    url: string | ((params: {chr: string, start: number, end: number}) => string)
    body?: string | ((params: {chr: string, start: number, end: number}) => string)
    parser?: (data: unknown) => GenomicFeature[]
    mappings?: Record<string, string>
    [key: string]: unknown
}

class CustomServiceReader {
    config: CustomServiceConfig

    constructor(config: CustomServiceConfig) {
        this.config = config
    }

    async readFeatures(chr: string, start: number, end: number): Promise<GenomicFeature[]> {

        let url: string
        if (typeof this.config.url === 'function') {
            url = this.config.url({chr, start, end})
        } else {
            url = this.config.url
                .replace("$CHR", chr)
                .replace("$START", String(start))
                .replace("$END", String(end))
        }

        let config: Record<string, unknown> = Object.assign({}, this.config)
        if (this.config.body !== undefined) {
            if (typeof this.config.body === 'function') {
                config.body = this.config.body({chr, start, end})
            } else {
                config.body =
                    this.config.body
                        .replace("$CHR", chr)
                        .replace("$START", String(start))
                        .replace("$END", String(end))
            }
        }


        let features: GenomicFeature[] = []
        const data = await igvxhr.load(url, config)
        if (data) {
            if (typeof this.config.parser === "function") {
                features = this.config.parser(data)
            } else if (isString(data)) {
                features = JSON.parse(data)
            } else {
                features = data as GenomicFeature[]
            }
        }
        if (this.config.mappings) {
            let mappingKeys = Object.keys(this.config.mappings)
            for (let f of features) {
                for (let key of mappingKeys) {
                    (f as Record<string, unknown>)[key] = (f as Record<string, unknown>)[this.config.mappings[key]]
                }
            }
        }
        return features
    }
}

export default CustomServiceReader
