import pack from "./featurePacker"
import IntervalTree from "./intervalTree"
import type {Exon} from "../types/feature"

const DEFAULT_MAX_WG_COUNT: number = 10000

interface Feature {
    chr: string
    start: number
    end: number
    chr1?: string
    chr2?: string
    start1?: number
    end2?: number
    dup?: boolean
    row?: number | undefined
    exons?: Exon[]
    [key: string]: any
}

interface Genome {
    wgChromosomeNames: string[]
    getGenomeCoordinate(chr: string, pos: number): number | undefined
    getChromosomeName(chr: string): string
}

interface ChromAliasManager {
    getAliasName(chr: string): Promise<string>
}

/**
 * Return a collection of "whole genome" features wrapping the supplied features, possibly downsampled.  The purpose
 * is to support painting features in "whole genome view".
 *
 * @param allFeatures - dictionary (object), keys are chromosome names, values are lists of features
 * @param genome
 * @param maxWGCount - optional, maximum # of whole genome features to computer
 * @returns {*[]}
 */
async function computeWGFeatures(
    allFeatures: { [chr: string]: Feature[] } | Feature[],
    genome: Genome,
    chromAliasManager: ChromAliasManager | undefined,
    maxWGCount?: number
): Promise<Feature[]> {


    const aliasTable: Map<string, string> = new Map()
    const chrTable: Map<string, string> = new Map()

    const makeWGFeature = (f: Feature): Feature => {
        const wg: Feature = Object.assign({}, f)
        wg.chr = "all"


        if (f.chr2 && f.end2) {
            const c1: string = aliasTable.get(f.chr1!) || f.chr1!
            const c2: string = aliasTable.get(f.chr2) || f.chr2
            wg.start = genome.getGenomeCoordinate(c1, f.start1!) ?? 0
            wg.end = genome.getGenomeCoordinate(c2, f.end2) ?? 0
        } else {
            const c: string = aliasTable.get(f.chr) || f.chr
            wg.start = genome.getGenomeCoordinate(c, f.start) ?? 0
            wg.end = genome.getGenomeCoordinate(c, f.end) ?? 0
        }
        wg._f = f
        // Don't draw exons in whole genome view
        if (wg["exons"]) delete wg["exons"]
        return wg
    }

    const wgChromosomeNames: Set<string> = new Set(genome.wgChromosomeNames)

    if (chromAliasManager) {
        for (let c of genome.wgChromosomeNames) {
            const alias: string = await chromAliasManager.getAliasName(c)
            aliasTable.set(c, alias)
            chrTable.set(alias, c)  // Reverse lookup
        }
    }

    const wgFeatures: Feature[] = []
    let count: number = 0
    for (let c of genome.wgChromosomeNames) {

        if (Array.isArray(allFeatures)) {
            const featureDict: { [chr: string]: Feature[] } = {}
            for (let f of allFeatures) {
                const chr: string = genome.getChromosomeName(f.chr)
                if (!featureDict.hasOwnProperty(chr)) {
                    featureDict[chr] = []
                }
                featureDict[chr].push(f)
            }
            allFeatures = featureDict
        }

        // Look up the chromosome name in the alias table.  This maps names in genome => names in dataset.
        const queryChr: string = aliasTable.get(c) || c
        const features = (allFeatures as { [chr: string]: Feature[] })[queryChr]

        if (features) {
            const max: number = maxWGCount || DEFAULT_MAX_WG_COUNT
            for (let f of features) {
                if (f.dup) continue  // Skip duplicates, these are pseudo features for inter-chromosomal features

                // Reverse lookup for chromosome names, names in dataset => names in genome
                const chr: string = chrTable.get(f.chr) || f.chr
                const chr2: string = f.chr2 ? (chrTable.get(f.chr2) || f.chr2) : chr
                if (wgChromosomeNames.has(chr) && wgChromosomeNames.has(chr2)) {
                    if (wgFeatures.length < max) {
                        wgFeatures.push(makeWGFeature(f))
                    } else {
                        //Reservoir sampling
                        const samplingProb: number = max / (count + 1)
                        if (Math.random() < samplingProb) {
                            const idx: number = Math.floor(Math.random() * (max - 1))
                            wgFeatures[idx] = makeWGFeature(f)
                        }
                    }
                }
                count++
            }
        }
    }

    wgFeatures.sort(function (a: Feature, b: Feature) {
        return a.start - b.start
    })

    return wgFeatures
}

/**
 * Assigns a row to each feature such that features do not overlap.
 *
 * @param features
 * @param maxRows
 * @param filter Function that takes a feature and returns a boolean indicating visibility
 */
function packFeatures(features: Feature[], maxRows?: number, filter?: (feature: Feature) => boolean): void {

    maxRows = maxRows || 1000
    if (features == null || features.length === 0) {
        return
    }
    // Segregate by chromosome
    const chrFeatureMap: { [chr: string]: Feature[] } = {}
    const chrs: string[] = []
    for (let feature of features) {
        if (filter && !filter(feature)) {
            feature.row = undefined
        } else {
            const chr: string = feature.chr
            let flist = chrFeatureMap[chr]
            if (!flist) {
                flist = []
                chrFeatureMap[chr] = flist
                chrs.push(chr)
            }
            flist.push(feature)
        }
    }

    // Loop through chromosomes and pack features;
    for (let chr of chrs) {
        pack(chrFeatureMap[chr], maxRows)
    }
}


/**
 * Return the index at which a new feature should be inserted in the sorted featureList.  It is assumed
 * that featureList is sorted by the compare function.  If featureList has 1 or more features with compare === 0
 * the new feature should be inserted at the end.
 *
 * @param featureList
 * @param center
 * @param direction -- forward === true, reverse === false
 * @returns {feature}
 */

function findFeatureAfterCenter(featureList: Feature[], center: number, direction: boolean = true): Feature | undefined {

    const featureCenter = (feature: Feature): number => (feature.start + feature.end) / 2

    const compare = direction ?
        (o1: Feature, o2: Feature) => o1.start - o2.start + o1.end - o2.end :
        (o2: Feature, o1: Feature) => o1.start - o2.start + o1.end - o2.end
    const sortedList: Feature[] = Array.from(featureList)
    sortedList.sort(compare)

    let low: number = 0
    let high: number = sortedList.length
    while (low < high) {
        let mid: number = Math.floor((low + high) / 2)
        if (direction) {
            if (featureCenter(sortedList[mid]) <= center) {
                low = mid + 1
            } else {
                high = mid
            }
        } else {
            if (featureCenter(sortedList[mid]) >= center) {
                low = mid + 1
            } else {
                high = mid
            }

        }
    }
    return sortedList[low]
}

/**
 * Find features overlapping the given interval.  It is assumed that all features share the same chromosome.
 *
 * @param featureList
 * @param start
 * @param end
 */
function findOverlapping(featureList: Feature[], start: number, end: number): Feature[] {

    if (!featureList || featureList.length === 0) {
        return []
    } else {
        const tree = buildIntervalTree(featureList)
        const intervals = tree.findOverlapping(start, end)

        if (intervals.length === 0) {
            return []
        } else {

            // Trim the list of features in the intervals to those
            // overlapping the requested range.
            // Assumption: features are sorted by start position

            const overlaps: Feature[] = []

            intervals.forEach(function (interval) {
                const intervalFeatures: Feature[] = interval.value as Feature[]
                const len: number = intervalFeatures.length
                for (let i = 0; i < len; i++) {
                    const feature: Feature = intervalFeatures[i]
                    if (feature.start > end) break
                    else if (feature.end > start) {
                        overlaps.push(feature)
                    }
                }
            })

            overlaps.sort(function (a: Feature, b: Feature) {
                return a.start - b.start
            })

            return overlaps
        }
    }
}

/**
 * Build an interval tree from the feature list for fast interval based queries.   We lump features in groups
 * of 10, or total size / 100,   to reduce size of the tree.
 *
 * @param featureList
 */
function buildIntervalTree(featureList: Feature[]): IntervalTree {

    const tree = new IntervalTree()
    const len: number = featureList.length
    const chunkSize: number = Math.max(10, Math.round(len / 100))

    featureList.sort(function (f1: Feature, f2: Feature) {
        return (f1.start === f2.start ? 0 : (f1.start > f2.start ? 1 : -1))
    })

    for (let i = 0; i < len; i += chunkSize) {
        const e: number = Math.min(len, i + chunkSize)
        const subArray: Feature[] = featureList.slice(i, e)
        const iStart: number = subArray[0].start
        let iEnd: number = iStart
        subArray.forEach(function (feature: Feature) {
            iEnd = Math.max(iEnd, feature.end)
        })
        tree.insert(iStart, iEnd, subArray)
    }

    return tree
}

export {computeWGFeatures, packFeatures, findFeatureAfterCenter}
