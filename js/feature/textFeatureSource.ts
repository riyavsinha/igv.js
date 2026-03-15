import FeatureCache from "./featureCache"
import FeatureFileReader from "./featureFileReader.js"
import CustomServiceReader from "./customServiceReader.js"
import UCSCServiceReader from "./ucscServiceReader.js"
import GtexReader from "../qtl/gtexReader.js"
import GenomicInterval from "../genome/genomicInterval"
import HtsgetVariantReader from "../htsget/htsgetVariantReader.js"
import {computeWGFeatures, findFeatureAfterCenter, packFeatures} from "./featureUtils"
import ChromAliasManager from "./chromAliasManager"
import BaseFeatureSource from "./baseFeatureSource"
import {summarizeData} from "./wigSummary"

const DEFAULT_MAX_WG_COUNT: number = 10000

interface TextFeatureSourceConfig {
    sourceType?: string
    maxWGCount?: number
    indexURL?: string
    queryable?: boolean
    reader?: any
    type?: string
    format?: string
    source?: any
    disableCache?: boolean
    expandQuery?: boolean
    minQuerySize?: number
    maxRows?: number
    searchable?: boolean
    searchableFields?: string[]
    mappings?: Record<string, string>
    [key: string]: any
}

interface GetFeaturesParams {
    chr: string
    start: number
    end: number
    bpPerPixel?: number
    visibilityWindow?: number
    windowFunction?: string
}

class TextFeatureSource extends BaseFeatureSource {

    config: TextFeatureSourceConfig
    sourceType: string
    maxWGCount: number
    windowFunctions: string[]
    queryable: boolean | undefined
    reader: any
    searchable: boolean
    header: any
    featureCache: any
    wgFeatures: any[] | undefined
    chromAliasManager: any
    featureMap: Map<string, any> | undefined

    constructor(config: TextFeatureSourceConfig, genome: any) {

        super(genome)

        this.config = config || {}
        this.genome = genome
        this.sourceType = (config.sourceType === undefined ? "file" : config.sourceType)
        this.maxWGCount = config.maxWGCount || DEFAULT_MAX_WG_COUNT
        this.windowFunctions = ["mean", "min", "max", "none"]

        const queryableFormats = new Set(["bigwig", "bw", "bigbed", "bb", "biginteract", "biggenepred", "bignarrowpeak", "tdf"])

        this.queryable = !!(config.indexURL || config.queryable === true)   // False by default, unless explicitly set
        if (config.reader) {
            // Explicit reader implementation
            this.reader = config.reader
            this.queryable = config.queryable !== false
        } else if (config.sourceType === "ga4gh") {
            throw Error("Unsupported source type 'ga4gh'")
        } else if ((config.type === "eqtl" || config.type === "qtl") && config.sourceType === "gtex-ws") {
            this.reader = new GtexReader(config)
            this.queryable = true
        } else if ("htsget" === config.sourceType) {
            this.reader = new HtsgetVariantReader(config, genome)
            this.queryable = true
            this.supportsWholeGenome = () => false   // htsget sources do not support whole genome view
        } else if (config.sourceType === 'ucscservice') {
            this.reader = new UCSCServiceReader(config.source)
            this.queryable = true
        } else if (config.sourceType === 'custom') {
            this.reader = new CustomServiceReader(config.source)
            this.queryable = false !== config.source.queryable
        } else if ('service' === config.sourceType) {
            this.reader = new FeatureFileReader(config as any, genome)
            this.queryable = true
        } else {
            // File of some type (i.e. not a webservice)
            this.reader = new FeatureFileReader(config as any, genome)
            if (config.queryable !== undefined) {
                this.queryable = config.queryable
            } else if ((config.format && queryableFormats.has(config.format)) || this.reader.indexed) {
                this.queryable = true
            } else {
                // Leav undefined -- will defer until we know if reader has an index
            }
        }

        // Flag indicating if features loaded by this source can be searched for by name or attribute, true by default
        this.searchable = config.searchable !== false

    }

    async defaultVisibilityWindow(): Promise<number | undefined> {
        if (this.reader && typeof this.reader.defaultVisibilityWindow === 'function') {
            return this.reader.defaultVisibilityWindow()
        }
    }

    async trackType(): Promise<string | undefined> {
        const header = await this.getHeader()
        if (header) {
            return header.type
        } else {
            return undefined    // Convention for unknown or unspecified
        }
    }

    async getHeader(): Promise<any> {
        if (!this.header) {

            if (this.reader && typeof this.reader.readHeader === "function") {
                const header = await this.reader.readHeader()
                if (header) {
                    this.header = header
                    if (header.format) {
                        this.config.format = header.format
                    }
                } else {
                    this.header = {}
                }
            } else {
                this.header = {}
            }
        }
        return this.header
    }

    async getFeatures({chr, start, end, bpPerPixel, visibilityWindow, windowFunction}: GetFeaturesParams): Promise<any[]> {

        const isWholeGenome: boolean = ("all" === chr.toLowerCase())

        start = start || 0
        end = end || Number.MAX_SAFE_INTEGER

        // Various conditions that can require a feature load
        //   * view is "whole genome" but no features are loaded
        //   * cache is disabled
        //   * cache does not contain requested range
        // const containsRange = this.featureCache.containsRange(new GenomicInterval(queryChr, start, end))
        if ((isWholeGenome && !this.wgFeatures && this.supportsWholeGenome()) ||
            this.config.disableCache ||
            !this.featureCache ||
            !this.featureCache.containsRange(new GenomicInterval(chr, start, end, undefined))) {
            await this.loadFeatures(chr, start, end, visibilityWindow)
        }

        if (isWholeGenome) {
            if (!this.wgFeatures) {
                if (this.supportsWholeGenome()) {
                    if("wig" === this.config.type) {
                        const allWgFeatures = await computeWGFeatures(this.featureCache.getAllFeatures(), this.genome, this.chromAliasManager, 1000000)
                        this.wgFeatures = summarizeData(allWgFeatures as any, 0, bpPerPixel!, windowFunction) as any
                    } else {
                        this.wgFeatures = await computeWGFeatures(this.featureCache.getAllFeatures(), this.genome, this.chromAliasManager, this.maxWGCount)
                    }
                } else {
                    this.wgFeatures = []
                }
            }
            return this.wgFeatures!
        } else {
            const queryChr: string = this.chromAliasManager ?  await this.chromAliasManager.getAliasName(chr) : chr
            return this.featureCache.queryFeatures(queryChr, start, end)
        }
    }

    async findFeatures(fn: (feature: any) => boolean): Promise<any[]> {
        return this.featureCache ? this.featureCache.findFeatures(fn) : []
    }

    supportsWholeGenome(): boolean {
        return !this.queryable   // queryable (indexed, web services) sources don't support whole genome view
    }

    getAllFeatures(): any[] {
        if (this.queryable || !this.featureCache) {   // queryable sources don't support all features
            return []
        } else {
            return this.featureCache.getAllFeatures()
        }
    }


    async loadFeatures(chr: string, start: number, end: number, visibilityWindow?: number): Promise<void> {

        await this.getHeader()

        const reader = this.reader
        let intervalStart: number = start
        let intervalEnd: number = end

        // chr aliasing
        let queryChr: string = chr
        if (!this.chromAliasManager && this.reader && this.reader.sequenceNames && this.reader.sequenceNames.size > 0) {
            this.chromAliasManager = new ChromAliasManager(this.reader.sequenceNames, this.genome)
        }
        if (this.chromAliasManager) {
            queryChr = await this.chromAliasManager.getAliasName(chr)
        }

        // Use visibility window to potentially expand query interval.
        // This can save re-queries as we zoom out.  Visibility window <= 0 is a special case
        // indicating whole chromosome should be read at once.
        if ((!visibilityWindow || visibilityWindow <= 0) && this.config.expandQuery !== false) {
            // Whole chromosome
            const chromosome = this.genome ? this.genome.getChromosome(chr) : undefined
            intervalStart = 0
            intervalEnd = Math.max(chromosome ? chromosome.bpLength : Number.MAX_SAFE_INTEGER, end)
        } else if (visibilityWindow && visibilityWindow > (end - start) && this.config.expandQuery !== false) {
            let expansionWindow: number = Math.min(4.1 * (end - start), visibilityWindow)
            if(this.config.minQuerySize && expansionWindow < this.config.minQuerySize) {
                expansionWindow = this.config.minQuerySize
            }
            intervalStart = Math.max(0, (start + end - expansionWindow) / 2)
            intervalEnd = intervalStart + expansionWindow
        }

        let features: any[] = await reader.readFeatures(queryChr, intervalStart, intervalEnd)
        if (this.queryable === undefined) {
            this.queryable = reader.indexed
        }

        const genomicInterval = this.queryable ?
            new GenomicInterval(queryChr, intervalStart, intervalEnd, undefined) :
            undefined

        if (features) {

            // Assign overlapping features to rows
            if (this.config.format !== "wig" && this.config.type !== "junctions") {
                const maxRows: number = this.config.maxRows || Number.MAX_SAFE_INTEGER
                packFeatures(features, maxRows)
            }

            // Note - replacing previous cache with new one.  genomicInterval is optional (might be undefined => includes all features)
            this.featureCache = new FeatureCache(features, genomicInterval)

            // If track is marked "searchable"< cache features by name -- use this with caution, memory intensive
            if (this.searchable) {
                this.addFeaturesToDB(features, this.config)
            }
        } else {
            this.featureCache = new FeatureCache([], genomicInterval)     // Empty cache
        }
    }

    addFeaturesToDB(featureList: any[], config: TextFeatureSourceConfig): void {
        if (!this.featureMap) {
            this.featureMap = new Map()
        }
        const searchableFields: string[] = config.searchableFields || ["name", "transcript_id", "gene_id", "gene_name", "id"]
        for (let feature of featureList) {
            for (let field of searchableFields) {
                let key: string | undefined
                if(feature.hasOwnProperty(field)) {
                    key = feature[field];
                }
                else if (typeof feature.getAttributeValue === 'function') {
                    key = feature.getAttributeValue(field)
                }
                if (key) {
                    key = key.replace(/ /g, '+').toUpperCase()
                    // If feature is already present keep largest one
                    if (this.featureMap.has(key)) {
                        const f2 = this.featureMap.get(key)
                        if (feature.end - feature.start < f2.end - f2.start) {
                            continue
                        }
                    }
                    this.featureMap.set(key, feature)
                }
            }
        }
    }

    search(term: string): any | undefined {
        if (this.featureMap) {
            return this.featureMap.get(term.toUpperCase())
        }

    }
}


export default TextFeatureSource
