import FeatureParser from "./featureParser.js"
import SegParser from "./segParser.js"
import VcfParser from "../variant/vcfParser.js"
import {BGZip, FileUtils, igvxhr, URIUtils} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions, isDataURL} from "../util/igvUtils.js"
import GWASParser from "../gwas/gwasParser.js"
import AEDParser from "../aed/AEDParser"
import {loadIndex} from "../bam/indexFactory"
import getDataWrapper, {type DataWrapper} from "./dataWrapper"
import BGZLineReader from "../util/bgzLineReader.js"
import BGZBlockLoader from "../bam/bgzBlockLoader"
import QTLParser from "../qtl/qtlParser.js"
import type {GenomicFeature} from "../types/feature"

// Conservative estimate of the maximum allowed string length
const MAX_STRING_LENGTH: number = 500000000

interface FeatureFileReaderConfig {
    url: string | File | ((params: { chr: string; start: number; end: number }) => string)
    indexURL?: string
    indexed?: boolean
    format?: string
    sourceType?: string
    filename?: string
    _filecontents?: Uint8Array
    seqnamesURL?: string
    headerURL?: string
    [key: string]: any
}

interface FeatureFileReaderGenome {
    getChromosome(chr: string): { bpLength: number } | undefined
}

interface FeatureIndex {
    tabix: boolean
    sequenceNames: string[]
    sequenceIndexMap: Record<string, number>
    lastBlockPosition?: number
    chrIndex: Record<string, { blocks: { max: number }[] }>
    chunksForRange(refId: string | number, start: number, end: number): IndexChunk[]
}

interface IndexChunk {
    minv: { block: number; offset: number }
    maxv: { block: number; offset: number }
}

interface FeatureFileReaderParser {
    parseHeader(dataWrapper: DataWrapper): Promise<unknown>
    parseFeatures(dataWrapper: DataWrapper): Promise<unknown[]>
}

class FeatureFileReader {

    sequenceNames: Set<string> | undefined
    config: FeatureFileReaderConfig
    genome: FeatureFileReaderGenome
    indexURL: string | undefined
    indexed: boolean
    queryable: boolean
    filename: string | undefined
    dataURI: string | undefined
    parser: FeatureFileReaderParser
    header: Record<string, any> | undefined
    features: GenomicFeature[] | undefined
    index: FeatureIndex | undefined
    format: string | undefined
    _blockLoader: BGZBlockLoader | undefined

    constructor(config: FeatureFileReaderConfig, genome: FeatureFileReaderGenome) {

        this.config = config || {} as FeatureFileReaderConfig
        this.genome = genome
        this.indexURL = config.indexURL
        this.indexed = config.indexed || this.indexURL !== undefined
        this.queryable = this.indexed

        if (FileUtils.isFile(this.config.url)) {
            this.filename = (this.config.url as File).name
        } else if (isDataURL(this.config.url)) {
            this.indexed = false  // by definition
            this.dataURI = config.url as string
        } else {
            const uriParts = URIUtils.parseUri(this.config.url as string)
            this.filename = config.filename || uriParts.file
        }

        this.parser = this.getParser(this.config)

        if (this.config.format === "vcf" && !this.config.indexURL) {
            console.warn("Warning: index file not specified.  The entire vcf file will be loaded.")
        }

    }

    async defaultVisibilityWindow(): Promise<number | undefined> {
        if (this.config.indexURL) {
            const index = await this.getIndex()
            if (index && index.lastBlockPosition) {
                let gl: number = 0
                const s: number = 10000
                for (let c of index.sequenceNames) {
                    const chromosome = this.genome.getChromosome(c)
                    if (chromosome) {
                        gl += chromosome.bpLength
                    }
                }
                return Math.round((gl / index.lastBlockPosition) * s)
            }
        }
    }

    async readFeatures(chr: string, start: number, end: number): Promise<GenomicFeature[]> {

        // insure that header has been loaded
        if (!this.dataURI && !this.header) {
            await this.readHeader()
        }

        let allFeatures: GenomicFeature[]
        const index = await this.getIndex()
        if (index) {
            this.indexed = true
            allFeatures = await this.loadFeaturesWithIndex(chr, start, end)
        } else if (this.dataURI) {
            this.indexed = false
            allFeatures = await this.loadFeaturesFromDataURI()
        } else if ("service" === this.config.sourceType) {
            allFeatures = await this.loadFeaturesFromService(chr, start, end)
        } else {
            this.indexed = false
            allFeatures = await this.loadFeaturesNoIndex()
        }

        allFeatures.sort(function (a: GenomicFeature, b: GenomicFeature) {
            if (a.chr === b.chr) {
                return a.start - b.start
            } else {
                return a.chr.localeCompare(b.chr)
            }
        })

        return allFeatures
    }

    async readHeader(): Promise<Record<string, any> | undefined> {

        if (this.dataURI) {
            await this.loadFeaturesFromDataURI()
            return this.header
        } else if (this.config.indexURL) {
            const index = await this.getIndex()
            if (!index) {
                // Note - it should be impossible to get here
                throw new Error("Unable to load index: " + this.config.indexURL)
            }
            this.sequenceNames = new Set(index.sequenceNames)

            let dataWrapper: DataWrapper
            if (index.tabix) {
                this._blockLoader = new BGZBlockLoader(this.config)
                dataWrapper = new BGZLineReader(this.config)
            } else {
                // Tribble
                const maxSize: number = Object.values(index.chrIndex)
                    .flatMap(chr => chr.blocks)
                    .map(block => block.max)
                    .reduce((previous: number, current: number) =>
                        Math.min(previous, current), Number.MAX_SAFE_INTEGER)

                const options = buildOptions(this.config, {bgz: index.tabix, range: {start: 0, size: maxSize}})
                const data: string = await igvxhr.loadString(this.config.url as string, options)
                dataWrapper = getDataWrapper(data)
            }

            this.header = await this.parser.parseHeader(dataWrapper) as Record<string, any> | undefined

            return this.header

        } else if ("service" === this.config.sourceType) {
            if (this.config.seqnamesURL) {
                // Side effect, a bit ugly
                const options = buildOptions(this.config, {})
                const seqnameString: string = await igvxhr.loadString(this.config.seqnamesURL, options)
                if (seqnameString) {
                    this.sequenceNames = new Set(seqnameString.split(",").map(sn => sn.trim()).filter(sn => sn))
                }
            }
            if (this.config.headerURL) {
                const options = buildOptions(this.config, {})
                const data: string = await igvxhr.loadString(this.config.headerURL, options)
                const dataWrapper = getDataWrapper(data)
                this.header = await this.parser.parseHeader(dataWrapper) as Record<string, any> | undefined  // Cache header, might be needed to parse features
                return this.header
            }

        } else {

            // Non-indexed file, or indexed file without an index
            this.indexed = false

            let data: Uint8Array | string

            if (this.config._filecontents) {
                // In rare instances the entire file must be read and decoded to determine the file format.
                // When this occurs the file contents are temporarily stashed to prevent needing to read the file twice
                data = this.config._filecontents
                delete this.config._filecontents
            } else {
                // If this is a non-indexed file we will load all features in advance
                const options = buildOptions(this.config)
                data = await igvxhr.loadByteArray(this.config.url as string, options)
            }

            // If the data size is < max string length decode entire string with TextDecoder.  This is much faster
            // than decoding by line
            if (data.length < MAX_STRING_LENGTH) {
                data = new TextDecoder().decode(data)
            }


            let dataWrapper = getDataWrapper(data)
            this.header = await this.parser.parseHeader(dataWrapper) as Record<string, any> | undefined

            // Reset data wrapper and parse features
            dataWrapper = getDataWrapper(data)
            this.features = await this.parser.parseFeatures(dataWrapper) as GenomicFeature[]   // cache features

            // Extract chromosome names from features
            this.sequenceNames = new Set(this.features!.map(f => f.chr))

            return this.header
        }

    }


    getParser(config: FeatureFileReaderConfig): FeatureFileReaderParser {

        switch (config.format) {
            case "vcf":
            case "vcftabix":
                return new (VcfParser as any)(config)
            case "seg" :
                return new SegParser("seg")
            case "mut":
                return new SegParser("mut")
            case "maf":
                return new SegParser("maf")
            case "gwas" :
                return new GWASParser(config)
            case "qtl":
                return new QTLParser(config)
            case "aed" :
                return new AEDParser(config as any)
            default:
                return new FeatureParser(config)
        }
    }

    async loadFeaturesNoIndex(): Promise<GenomicFeature[]> {

        if (this.features) {
            // An optimization hack for non-indexed files, features are temporarily cached when header is read.
            const tmp = this.features
            delete this.features
            return tmp
        } else {
            const options = buildOptions(this.config)    // Add oauth token, if any
            const data = await igvxhr.loadByteArray(this.config.url as string, options)
            if (!this.header) {
                const dataWrapper = getDataWrapper(data)
                this.header = await this.parser.parseHeader(dataWrapper) as Record<string, any> | undefined
            }
            const dataWrapper = getDataWrapper(data)
            const features: GenomicFeature[] = []
            await this._parse(features, dataWrapper)   // <= PARSING DONE HERE
            return features
        }
    }

    async loadFeaturesWithIndex(chr: string, start: number, end: number): Promise<GenomicFeature[]> {

        //console.log("Using index"
        const config = this.config
        const parser = this.parser
        const tabix: boolean = this.index!.tabix

        const refId = tabix ? this.index!.sequenceIndexMap[chr] : chr
        if (refId === undefined) {
            return []
        }

        const chunks = this.index!.chunksForRange(refId, start, end)
        if (!chunks || chunks.length === 0) {
            return []
        } else {
            const allFeatures: GenomicFeature[] = []
            for (let chunk of chunks) {

                let inflated: string | Uint8Array
                if (tabix) {
                    inflated = await this._blockLoader!.getData(chunk.minv, chunk.maxv)
                } else {
                    const options = buildOptions(config, {
                        range: {
                            start: chunk.minv.block,
                            size: chunk.maxv.block - chunk.minv.block + 1
                        }
                    })
                    inflated = await igvxhr.loadString(config.url as string, options)
                }

                const slicedData: string | Uint8Array = chunk.minv.offset ? inflated.slice(chunk.minv.offset) : inflated
                const dataWrapper = getDataWrapper(slicedData)
                await this._parse(allFeatures, dataWrapper, chr, end, start)

            }

            return allFeatures
        }
    }

    async loadFeaturesFromService(chr: string, start: number, end: number): Promise<GenomicFeature[]> {

        let url: string
        if (typeof this.config.url === 'function') {
            url = this.config.url({chr, start, end})
        } else {
            url = (this.config.url as string)
                .replace("$CHR", chr)
                .replace("$START", String(start))
                .replace("$END", String(end))
        }
        const options = buildOptions(this.config)    // Adds oauth token, if any
        const data: string = await igvxhr.loadString(url, options)
        const dataWrapper = getDataWrapper(data)
        const features: GenomicFeature[] = []
        await this._parse(features, dataWrapper)   // <= PARSING DONE HERE
        return features

    }

    async _parse(allFeatures: GenomicFeature[], dataWrapper: DataWrapper, chr?: string, end?: number, start?: number): Promise<void> {

        let features = await this.parser.parseFeatures(dataWrapper) as GenomicFeature[]

        features.sort(function (a: GenomicFeature, b: GenomicFeature) {
            if (a.chr === b.chr) {
                return a.start - b.start
            } else {
                return a.chr.localeCompare(b.chr)
            }
        })

        // Filter features not in requested range.
        if (undefined === chr) {
            for (let f of features) allFeatures.push(f)   // Don't use spread operator !!!  slicedFeatures might be very large
        } else {
            let inInterval: boolean = false
            for (let i = 0; i < features.length; i++) {
                const f = features[i]
                if (f.chr === chr) {
                    if (f.start > end!) {
                        allFeatures.push(f)  // First feature beyond interval
                        break
                    }
                    if (f.end >= start! && f.start <= end!) {
                        // All this to grab first feature before start of interval.  Needed for some track renderers, like line plot
                        if (!inInterval) {
                            inInterval = true
                            if (i > 0) {
                                allFeatures.push(features[i - 1])
                            }
                        }
                        allFeatures.push(f)
                    }
                }
            }
        }
    }

    async getIndex(): Promise<FeatureIndex | undefined> {
        if (this.index) {
            return this.index
        } else if (this.config.indexURL) {
            this.index = await this.loadIndex()
            return this.index
        }
    }

    async loadIndex(): Promise<FeatureIndex> {
        const indexURL: string = this.config.indexURL!
        return loadIndex(indexURL, this.config) as Promise<FeatureIndex>
    }

    async loadFeaturesFromDataURI(): Promise<GenomicFeature[]> {

        if (this.features) {
            // An optimization hack for non-indexed files, features are temporarily cached when header is read.
            const tmp = this.features
            delete this.features
            return tmp
        } else {
            const plain: string = BGZip.decodeDataURI(this.dataURI)
            let dataWrapper = getDataWrapper(plain)
            this.header = await this.parser.parseHeader(dataWrapper) as Record<string, any> | undefined
            if (this.header instanceof String && this.header.startsWith("##gff-version 3")) {
                this.format = 'gff3'
            }

            dataWrapper = getDataWrapper(plain)
            const features: GenomicFeature[] = []
            await this._parse(features, dataWrapper)
            return features
        }
    }

}

export default FeatureFileReader
