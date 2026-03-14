import FeatureCache from "./featureCache"
import {computeWGFeatures, findFeatureAfterCenter, packFeatures} from "./featureUtils"
import BaseFeatureSource from "./baseFeatureSource"
import ChromAliasManager from "./chromAliasManager"

interface StaticFeatureSourceConfig {
    features: any[]
    searchable?: boolean
    searchableFields?: string[]
    mappings?: Record<string, string>
    [key: string]: any
}

class StaticFeatureSource extends BaseFeatureSource {

    config: StaticFeatureSourceConfig
    queryable: boolean
    searchable: boolean
    featureCache: any
    chromAliasManager: any
    maxWGCount: number | undefined
    featureMap: Map<string, any> | undefined

    constructor(config: StaticFeatureSourceConfig, genome: any) {

        super(genome)
        this.config = config
        this.genome = genome
        this.queryable = false
        this.searchable = config.searchable !== false  // searchable by default
        this.updateFeatures(config.features)
    }

    updateFeatures(features: any[]): void {
        features = fixFeatures(features, this.genome)
        packFeatures(features)
        if (this.config.mappings) {
            mapProperties(features, this.config.mappings)
        }

        this.chromAliasManager = this.genome ? new ChromAliasManager(features.map(f => f.chr), this.genome) : null

        this.featureCache = new FeatureCache(features)

        if (this.searchable || this.config.searchableFields) {
            this.addFeaturesToDB(features, this.config)
        }
    }

    async getFeatures({chr, start, end, bpPerPixel, visibilityWindow}: {chr: string, start: number, end: number, bpPerPixel?: number, visibilityWindow?: number}): Promise<any[]> {

        const queryChr: string = this.chromAliasManager ? await this.chromAliasManager.getAliasName(chr) : chr
        const isWholeGenome: boolean = ("all" === queryChr.toLowerCase())

        // Various conditions that can require a feature load
        //   * view is "whole genome" but no features are loaded
        //   * cache is disabled
        //   * cache does not contain requested range
        if (isWholeGenome) {
            return await computeWGFeatures(this.featureCache.getAllFeatures(), this.genome, this.chromAliasManager, this.maxWGCount)
        } else {
            return this.featureCache.queryFeatures(queryChr, start, end)
        }
    }

    //
    // supportsWholeGenome() {
    //    return true
    // }

    getAllFeatures(): any[] {
        return this.featureCache.getAllFeatures()
    }

    supportsWholeGenome(): boolean {
        return true
    }

    addFeaturesToDB(featureList: any[], config: StaticFeatureSourceConfig): void {
        if (!this.featureMap) {
            this.featureMap = new Map()
        }
        const searchableFields: string[] = config.searchableFields || ["name"]
        for (let feature of featureList) {
            for (let field of searchableFields) {
                let key: string | undefined

                if (typeof feature.getAttributeValue === 'function') {
                    key = feature.getAttributeValue(field)
                }
                if (!key) {
                    key = feature[field]
                }
                if (key) {
                    key = key.replace(/ /g, '+')
                    const current = this.featureMap.get(key.toUpperCase())
                    if (current && ((current.end - current.start) > (feature.end - feature.start))) continue
                    this.featureMap.set(key.toUpperCase(), feature)
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


function fixFeatures(features: any[], genome: any): any[] {

    if (genome) {
        for (let feature of features) {
            feature.chr = genome.getChromosomeName(feature.chr)
        }
    }

    return features
}


function mapProperties(features: any[], mappings: Record<string, string>): void {
    let mappingKeys: string[] = Object.keys(mappings)
    features.forEach(function (f: any) {
        mappingKeys.forEach(function (key: string) {
            f[key] = f[mappings[key]]
        })
    })
}

// function fixFeatures(features, genome) {
//
//     if (!features || features.length === 0) return []
//
//     const isBedPE = features[0].chr === undefined && features[0].chr1 !== undefined
//     if (isBedPE) {
//         const interChrFeatures = []
//         for (let feature of features) {
//
//             if (genome) {
//                 feature.chr1 = genome.getChromosomeName(feature.chr1)
//                 feature.chr2 = genome.getChromosomeName(feature.chr2)
//             }
//
//             // Set total extent of feature
//             if (feature.chr1 === feature.chr2) {
//                 feature.chr = feature.chr1
//                 feature.start = Math.min(feature.start1, feature.start2)
//                 feature.end = Math.max(feature.end1, feature.end2)
//             } else {
//                 interChrFeatures.push(feature)
//             }
//         }
//
//         // Make copies of inter-chr features, one for each chromosome
//         for (let f1 of interChrFeatures) {
//             const f2 = Object.assign({dup: true}, f1)
//             features.push(f2)
//
//             f1.chr = f1.chr1
//             f1.start = f1.start1
//             f1.end = f1.end1
//
//             f2.chr = f2.chr2
//             f2.start = f2.start2
//             f2.end = f2.end2
//         }
//     } else if (genome) {
//         for (let feature of features) {
//             feature.chr = genome.getChromosomeName(feature.chr)
//         }
//     }
//
//
//     return features
// }

export default StaticFeatureSource
