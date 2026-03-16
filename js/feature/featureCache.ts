import IntervalTree from "./intervalTree";

interface GenomicRange {
    chr: string
    start: number
    end: number
}

interface Feature {
    chr: string
    start: number
    end: number
    [key: string]: any
}

interface CacheRange {
    contains(chr: string, start: number, end: number): boolean
}

/**
 * Object for caching lists of features.  Supports efficient range queries (chr, start, end)
 *
 * @param featureList
 * @param The genomic range spanned by featureList (optional)
 * @constructor
 */

class FeatureCache {

    treeMap: { [chr: string]: IntervalTree }
    range: CacheRange | undefined
    count: number
    allFeatures!: { [chr: string]: Feature[] }

    constructor(featureList?: Feature[], range?: CacheRange) {

        featureList = featureList || [];
        this.treeMap = this.buildTreeMap(featureList);
        this.range = range;
        this.count = featureList.length;
    }

    containsRange(genomicRange: GenomicRange): boolean {
        // No range means cache contains all features
        return (this.range === undefined || this.range.contains(genomicRange.chr, genomicRange.start, genomicRange.end));
    }

    /**
     * Search loaded features
     * @param fn
     */
    findFeatures(fn: (f: Feature) => boolean): Feature[] {
        const found: Feature[] = []
        for (let featureList of Object.values(this.allFeatures)) {
            for (let f of featureList) {
                if (fn(f)) {
                    found.push(f)
                }
            }
        }
        return found
    }

    queryFeatures(chr: string, start: number, end: number): Feature[] {

        const tree = this.treeMap[chr];

        if (!tree) return [];

        const intervals = tree.findOverlapping(start, end);

        if (intervals.length === 0) {
            return [];
        } else {
            // Trim the list of features in the intervals to those
            // overlapping the requested range.
            // Assumption: features are sorted by start position

            const featureList: Feature[] = [];
            const all = this.allFeatures[chr];
            if (all) {
                for (let interval of intervals) {
                    const indexRange: IndexRange = interval.value as IndexRange;
                    for (let i = indexRange.start; i < indexRange.end; i++) {
                        let feature = all[i];
                        if (feature.start > end) break;
                        else if (feature.end >= start) {
                            featureList.push(feature);
                        }
                    }
                }
                featureList.sort(function (a: Feature, b: Feature) {
                    return a.start - b.start;
                });
            }
            return featureList;
        }
    }

    /**
     * Returns all features, unsorted.
     *
     * @returns {object}
     */
    getAllFeatures(): { [chr: string]: Feature[] } {
        return this.allFeatures;
    }

    buildTreeMap(featureList: Feature[]): { [chr: string]: IntervalTree } {

        const treeMap: { [chr: string]: IntervalTree } = {};
        const chromosomes: string[] = [];
        this.allFeatures = {};

        if (featureList) {
            for (let feature of featureList) {

                const chr: string = feature.chr;
                let geneList = this.allFeatures[chr];
                if (!geneList) {
                    chromosomes.push(chr);
                    geneList = [];
                    this.allFeatures[chr] = geneList;
                }
                geneList.push(feature);
            }


            // Now build interval tree for each chromosome
            for (let chr of chromosomes) {
                const chrFeatures = this.allFeatures[chr];
                chrFeatures.sort(function (f1: Feature, f2: Feature) {
                    return (f1.start === f2.start ? 0 : (f1.start > f2.start ? 1 : -1));
                });
                treeMap[chr] = buildIntervalTree(chrFeatures);
            }
        }

        return treeMap;
    }
}

/**
 * Build an interval tree from the feature list for fast interval based queries.   We lump features in groups
 * of 10, or total size / 100,   to reduce size of the tree.
 *
 * @param featureList
 */
function buildIntervalTree(featureList: Feature[]): IntervalTree {

    const tree = new IntervalTree();
    const len: number = featureList.length;
    const chunkSize: number = Math.max(10, Math.round(len / 10));

    for (let i = 0; i < len; i += chunkSize) {
        const e: number = Math.min(len, i + chunkSize);
        const subArray = new IndexRange(i, e);
        const iStart: number = featureList[i].start;
        //
        let iEnd: number = iStart;
        for (let j = i; j < e; j++) {
            iEnd = Math.max(iEnd, featureList[j].end);
        }
        tree.insert(iStart, iEnd, subArray);
    }

    return tree;
}


class IndexRange {
    start: number
    end: number

    constructor(start: number, end: number) {
        this.start = start;
        this.end = end;
    }
}

export default FeatureCache;
