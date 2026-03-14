import PairedAlignment from "./pairedAlignment.js"
import BaseModificationCounts from "./mods/baseModificationCounts.js"
import BamAlignmentRow from "./bamAlignmentRow.js"
import {isNumber} from "../util/igvUtils"

const alignmentSpace: number = 2

interface AlignmentContainerOptions {
    samplingWindowSize?: number
    samplingDepth?: number
    alleleFreqThreshold?: number
    colorBy?: string
}

interface PackOptions {
    viewAsPairs?: boolean
    showSoftClips?: boolean
    expectedPairOrientation?: string
    groupBy?: string
    displayMode?: string
}

interface SortOptions {
    position: number
    sortAsPairs?: boolean
    direction?: boolean
}

interface Alignment {
    start: number
    end: number
    scStart: number
    scLengthOnRef: number
    lengthOnRef: number
    readName: string
    chr: string
    strand: boolean
    seq?: string
    qual?: number[]
    blocks?: AlignmentBlock[]
    gaps?: Array<{ type: string; start: number; len: number }>
    insertions?: Array<{ start: number }>
    mate?: { chr: string }
    isPaired(): boolean
    isMateMapped(): boolean
    isFirstOfPair(): boolean
    isSecondOfPair(): boolean
    isSecondary(): boolean
    isSupplementary(): boolean
    getGroupValue(groupBy: string, expectedPairOrientation?: string): string
    getBaseModificationSets(): any[] | undefined
    [key: string]: any
}

interface AlignmentBlock {
    type: string
    start: number
    len: number
    seqOffset: number
}

interface PopupDataEntry {
    name: string
    value: string | number
}

interface GenomicRange {
    start: number
    end: number
}

/**
 * AlignmentContainer contains alignments for a genomic region and manages downsampling,  packing into rows,
 * as well as computation of coverage and base modification counts.   Coverage and base modification counts are
 * calculated prior to downsampling.  After initialization an AlignmentContainer exposes 3 properties used
 * by BamTrack
 *    - coverageMap
 *    - sequence
 *    - packedAlignments
 */
class AlignmentContainer {

    #unpacked: Alignment[] = []
    baseModificationKeys: Set<string> = new Set()

    alleleFreqThreshold: number
    samplingWindowSize: number
    samplingDepth: number
    chr: string
    start: number
    end: number
    length: number
    coverageMap: CoverageMap
    downsampledIntervals: DownsampledInterval[]
    baseModCounts?: any
    alignments: Alignment[]
    pairsCache: Map<string, any>
    downsampledReads: Set<string>
    currentBucket: DownsampleBucket
    hasPairs: boolean
    hasAlignments?: boolean
    packedGroups?: Map<string, Group>
    viewport?: { genomicRange(): GenomicRange }

    constructor(chr: string, start: number, end: number,
                {
                    samplingWindowSize,
                    samplingDepth,
                    alleleFreqThreshold,
                    colorBy
                }: AlignmentContainerOptions) {

        this.alleleFreqThreshold = alleleFreqThreshold === undefined ? 0.2 : alleleFreqThreshold
        this.samplingWindowSize = samplingWindowSize || 100
        this.samplingDepth = samplingDepth || 1000

        this.chr = chr
        this.start = Math.floor(start)
        this.end = Math.ceil(end)
        this.length = (end - start)
        this.coverageMap = new CoverageMap(chr, start, end, this.alleleFreqThreshold)
        this.downsampledIntervals = []


        // Enable basemods
        if (colorBy && colorBy.startsWith("basemod")) {
            this.baseModCounts = new BaseModificationCounts()
        }

        // Transient members -- used during downsampling and prior to packing
        this.alignments = []
        this.pairsCache = new Map()  // working cache of paired alignments by read name
        this.downsampledReads = new Set()
        this.currentBucket = new DownsampleBucket(this.start, this.start + this.samplingWindowSize, this)

        this.hasPairs = false // until proven otherwise
    }

    pack({viewAsPairs, showSoftClips, expectedPairOrientation, groupBy, displayMode}: PackOptions): void {

        let alignments: Alignment[] = this.allAlignments()
        if (viewAsPairs) {
            alignments = pairAlignments(alignments)
        } else {
            alignments = unpairAlignments(alignments)
        }
        this.packAlignmentRows(alignments, showSoftClips, expectedPairOrientation, groupBy, displayMode)
        if (this.alignments) {
            delete (this as any).alignments
        }
    }

    packAlignmentRows(alignments: Alignment[], showSoftClips: boolean | undefined, expectedPairOrientation: string | undefined, groupBy: string | undefined, displayMode: string | undefined): void {

        this.#unpacked = []

        /**
         * Pack alignments densely, filling each row before proceeding to the next.
         */
        const packDense = (alignments: Alignment[], groupName: string): Group => {

            alignments.sort(function (a: Alignment, b: Alignment) {
                return showSoftClips ? a.scStart - b.scStart : a.start - b.start
            })

            const group = new Group(groupName)
            let alignmentRow: any
            let nextStart = 0
            let nextIDX = 0
            const allocated: Set<Alignment> = new Set()
            const startNewRow = () => {
                alignmentRow = new BamAlignmentRow()
                group.push(alignmentRow)
                nextStart = 0
                nextIDX = 0
                allocated.clear()
            }
            startNewRow()

            while (alignments.length > 0) {
                if (nextIDX >= 0 && nextIDX < alignments.length) {
                    const alignment = alignments[nextIDX]
                    allocated.add(alignment)
                    alignmentRow.alignments.push(alignment)
                    nextStart = showSoftClips ?
                        alignment.scStart + alignment.scLengthOnRef + alignmentSpace :
                        alignment.start + alignment.lengthOnRef + alignmentSpace
                    nextIDX = binarySearch(alignments, (a: Alignment) => (showSoftClips ? a.scStart : a.start) > nextStart, nextIDX)
                } else {
                    // Remove allocated alignments and start new row
                    alignments = alignments.filter(a => !allocated.has(a))
                    startNewRow()
                }
            }
            return group
        }

        const packFull = (alignments: Alignment[], groupName: string): Group => {

            alignments.sort(function (a: Alignment, b: Alignment) {
                return a.start - b.start
            })
            const group = new Group(groupName)
            const {start, end} = this.viewport!.genomicRange()
            for (let a of alignments) {
                if (a.end < start || a.start > end) {
                    this.#unpacked.push(a)
                } else {
                    const alignmentRow = new BamAlignmentRow()
                    alignmentRow.alignments.push(a)
                    group.push(alignmentRow)
                }
            }
            return group
        }


        if (!alignments || alignments.length === 0) {
            return
        } else {

            // Separate alignments into groups
            const groupedAlignments: Map<string, Alignment[]> = new Map()
            if (groupBy) {
                for (let a of alignments) {
                    const group = a.getGroupValue(groupBy, expectedPairOrientation) || ""
                    if (!groupedAlignments.has(group)) {
                        groupedAlignments.set(group, [])
                    }
                    groupedAlignments.get(group)!.push(a)
                }
            } else {
                groupedAlignments.set("", alignments)
            }

            const packed: Map<string, Group> = new Map()
            const orderedGroupNames = Array.from(groupedAlignments.keys()).sort(getGroupComparator(groupBy, expectedPairOrientation))
            for (let groupName of orderedGroupNames) {
                const alignments = groupedAlignments.get(groupName)!
                const group = "FULL" === displayMode ?
                    packFull(alignments, groupName) :
                    packDense(alignments, groupName)
                packed.set(groupName, group)
            }

            this.packedGroups = packed
        }
    }


    push(alignment: Alignment): void {

        this.hasPairs = this.hasPairs || alignment.isPaired()

        this.coverageMap.incCounts(alignment)   // Count coverage before any downsampling

        const baseModificationSets = alignment.getBaseModificationSets()
        if (baseModificationSets) {
            for (let bms of baseModificationSets) {
                this.baseModificationKeys.add(bms.key)
            }
        }

        if (this.baseModCounts) {
            this.baseModCounts.incrementCounts(alignment)
        }

        if (this.downsampledReads.has(alignment.readName)) {
            this.currentBucket.downsampledCount++
            return   // Mate already downsampled
        }

        if (alignment.start >= this.currentBucket.end) {
            this.finishBucket()
            this.currentBucket = new DownsampleBucket(alignment.start, alignment.start + this.samplingWindowSize, this)
        }

        this.currentBucket.addAlignment(alignment)

    }

    finish(): void {

        if (this.currentBucket !== undefined) {
            this.finishBucket()
        }

        this.hasAlignments = this.alignments.length > 0

        this.alignments.sort(function (a: Alignment, b: Alignment) {
            return a.start - b.start
        })

        if (this.baseModCounts) {
            this.baseModCounts.computeSimplex()
        }

        delete (this as any).currentBucket
        delete (this as any).pairsCache
        delete (this as any).downsampledReads

    }

    contains(chr: string, start: number, end: number): boolean {
        return this.chr === chr &&
            this.start <= start &&
            this.end >= end
    }

    hasDownsampledIntervals(): boolean {
        return this.downsampledIntervals && this.downsampledIntervals.length > 0
    }

    finishBucket(): void {
        this.alignments = this.alignments.concat(this.currentBucket.alignments)
        if (this.currentBucket.downsampledCount > 0) {
            this.downsampledIntervals.push(new DownsampledInterval(
                this.currentBucket.start,
                this.currentBucket.end,
                this.currentBucket.downsampledCount))
        }
    }

    allAlignments(): Alignment[] {
        if (this.alignments) {
            return this.alignments
        } else if (this.packedGroups) {
            const all: Alignment[] = Array.from(this.packedGroups.values()).flatMap(group => group.rows.flatMap((row: any) => row.alignments))
            if (this.#unpacked && this.#unpacked.length > 0) {
                for (let a of this.#unpacked) {
                    all.push(a)
                }
            }
            return all
        } else {
            return []
        }
    }

    getMax(start: number, end: number): number {
        return this.coverageMap.getMax(start, end)
    }

    sortRows(options: SortOptions): void {
        if (this.packedGroups) {
            for (let group of this.packedGroups.values()) {
                group.sortRows(options, this)
            }
        }
    }
}


interface DownsampleBucketContext {
    samplingDepth: number
    downsampledReads: Set<string>
    pairsCache: Map<string, any>
}

class DownsampleBucket {

    start: number
    end: number
    alignments: any[]
    downsampledCount: number
    samplingDepth: number
    downsampledReads: Set<string>
    pairsCache: Map<string, any>
    hasPairs: boolean

    constructor(start: number, end: number, {samplingDepth, downsampledReads, pairsCache}: DownsampleBucketContext) {

        this.start = start
        this.end = end
        this.alignments = []
        this.downsampledCount = 0
        this.samplingDepth = samplingDepth
        this.downsampledReads = downsampledReads
        this.pairsCache = pairsCache
        this.hasPairs = false // until proven otherwise
    }

    addAlignment(alignment: Alignment): void {


        this.hasPairs = this.hasPairs || alignment.isPaired()

        const samplingDepth = this.hasPairs ? Math.ceil(this.samplingDepth / 2) : this.samplingDepth

        if (canBePaired(alignment)) {
            const pairedAlignment = this.pairsCache.get(alignment.readName)
            if (pairedAlignment) {
                // Not subject to downsampling, just update the existing paired alignment
                pairedAlignment.setSecondAlignment(alignment)
                this.pairsCache.delete(alignment.readName)
                return
            }
        }

        if (this.alignments.length < samplingDepth) {

            if (canBePaired(alignment)) {
                // First alignment of a pair
                const pairedAlignment = new PairedAlignment(alignment)
                this.pairsCache.set(alignment.readName, pairedAlignment)
                this.alignments.push(pairedAlignment)
            } else {
                this.alignments.push(alignment)
            }

        } else {
            // Alignment count has reached sampling depth, use reservoir sampling

            const idx = Math.floor(Math.random() * (samplingDepth + this.downsampledCount - 1))

            if (idx < samplingDepth) {

                // Select an alignment to replace
                const replacedAlignment = this.alignments[idx]
                if (this.pairsCache.has(replacedAlignment.readName)) {
                    this.pairsCache.delete(replacedAlignment.readName)
                }

                if (canBePaired(alignment)) {
                    const pairedAlignment = new PairedAlignment(alignment)
                    this.pairsCache.set(alignment.readName, pairedAlignment)
                    this.alignments[idx] = pairedAlignment
                } else {
                    this.alignments[idx] = alignment
                }
                this.downsampledReads.add(replacedAlignment.readName)

            } else {
                this.downsampledReads.add(alignment.readName)
            }
            this.downsampledCount++
        }
    }
}

class CoverageMap {

    chr: string
    bpStart: number
    length: number
    coverage: (Coverage | undefined)[]
    maximum: number
    threshold: number
    qualityWeight: boolean

    constructor(chr: string, start: number, end: number, alleleFreqThreshold: number) {

        this.chr = chr
        this.bpStart = start
        this.length = (end - start)

        this.coverage = new Array(this.length)
        this.maximum = 0

        this.threshold = alleleFreqThreshold
        this.qualityWeight = true
    }

    /**
     * Return the maximum coverage value between start and end.
     */
    getMax(start: number, end: number): number {
        let max = 0
        const len = this.coverage.length
        for (let i = 0; i < len; i++) {
            const pos = this.bpStart + i
            if (pos > end) break
            const cov = this.coverage[i]
            if (pos >= start && cov) {
                max = Math.max(max, cov.total)
            }
        }
        return max
    }

    incCounts(alignment: Alignment): void {

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this

        if (alignment.blocks === undefined) {
            incBlockCount(alignment as any)
        } else {
            alignment.blocks.forEach(function (block: AlignmentBlock) {
                incBlockCount(block)
            })
        }

        if (alignment.gaps) {
            for (let del of alignment.gaps) {
                if (del.type === 'D') {
                    const offset = del.start - self.bpStart
                    for (let i = offset; i < offset + del.len; i++) {
                        if (i < 0) continue
                        if (!this.coverage[i]) {
                            this.coverage[i] = new Coverage(self.threshold)
                        }
                        this.coverage[i]!.del++
                    }
                }
            }
        }

        if (alignment.insertions) {
            for (let del of alignment.insertions) {
                const i = del.start - this.bpStart
                if (i < 0) continue
                if (!this.coverage[i]) {
                    this.coverage[i] = new Coverage(self.threshold)
                }
                this.coverage[i]!.ins++
            }
        }

        function incBlockCount(block: AlignmentBlock): void {

            if ('S' === block.type) return

            const seq = alignment.seq
            const qual = alignment.qual
            const seqOffset = block.seqOffset

            for (let i = block.start - self.bpStart, j = 0; j < block.len; i++, j++) {

                if (!self.coverage[i]) {
                    self.coverage[i] = new Coverage(self.threshold)
                }

                const base = (seq == undefined) ? "N" : seq.charAt(seqOffset + j)
                const key = (alignment.strand) ? "pos" + base : "neg" + base
                const q = qual && seqOffset + j < qual.length ? qual[seqOffset + j] : 30

                ;(self.coverage[i] as any)[key] += 1
                ;(self.coverage[i] as any)["qual" + base] += q

                self.coverage[i]!.total += 1
                self.coverage[i]!.qual += q

                self.maximum = Math.max(self.coverage[i]!.total, self.maximum)

            }
        }
    }

    getPosCount(pos: number, base: string): number {

        const offset = pos - this.bpStart
        if (offset < 0 || offset >= this.coverage.length) return 0
        const c = this.coverage[offset]
        if (!c) return 0

        switch (base) {
            case 'A':
            case 'a':
                return c.posA
            case 'C':
            case 'c':
                return c.posC
            case 'T':
            case 't':
                return c.posT
            case 'G':
            case 'g':
                return c.posG
            case 'N':
            case 'n':
                return c.posN
            default:
                return 0
        }
    }

    getNegCount(pos: number, base: string): number {
        const offset = pos - this.bpStart
        if (offset < 0 || offset >= this.coverage.length) return 0
        const c = this.coverage[offset]
        if (!c) return 0

        switch (base) {
            case 'A':
            case 'a':
                return c.negA
            case 'C':
            case 'c':
                return c.negC
            case 'T':
            case 't':
                return c.negT
            case 'G':
            case 'g':
                return c.negG
            case 'N':
            case 'n':
                return c.negN
            default:
                return 0
        }

    }

    getCount(pos: number, base: string): number {
        return this.getPosCount(pos, base) + this.getNegCount(pos, base)
    }

    getTotalCount(pos: number): number {
        const offset = pos - this.bpStart
        return (offset >= 0 && offset < this.coverage.length && this.coverage[offset]) ? this.coverage[offset]!.total : 0
    }
}


class Coverage {

    qualityWeight: boolean

    posA: number = 0
    negA: number = 0

    posT: number = 0
    negT: number = 0

    posC: number = 0
    negC: number = 0
    posG: number = 0

    negG: number = 0

    posN: number = 0
    negN: number = 0

    pos: number = 0
    neg: number = 0

    qualA: number = 0
    qualT: number = 0
    qualC: number = 0
    qualG: number = 0
    qualN: number = 0

    qual: number = 0

    total: number = 0
    del: number = 0
    ins: number = 0

    threshold: number;

    [key: string]: any

    constructor(alleleThreshold: number) {

        this.qualityWeight = true
        this.threshold = alleleThreshold
    }

    hoverText(): string {
        const pos = this.posA + this.posT + this.posC + this.posG + this.posN
        const neg = this.negA + this.negT + this.negC + this.negG + this.negN
        return `${this.total} (${pos}+, ${neg}-)`
    }

    isMismatch(refBase: string): boolean {
        const threshold = this.threshold * ((this.qualityWeight && this.qual) ? this.qual : this.total)
        let mismatchQualitySum = 0
        for (let base of ["A", "T", "C", "G"]) {
            if (base !== refBase) {
                mismatchQualitySum += ((this.qualityWeight && this.qual) ? this["qual" + base] : (this["pos" + base] + this["neg" + base]))
            }
        }
        return mismatchQualitySum >= threshold
    }
}

class DownsampledInterval {

    start: number
    end: number
    counts: number

    constructor(start: number, end: number, counts: number) {
        this.start = start
        this.end = end
        this.counts = counts
    }

    popupData(genomicLocation: number): PopupDataEntry[] {
        return [
            {name: "start", value: Math.floor(this.start + 1)},
            {name: "end", value: this.end},
            {name: "# downsampled:", value: this.counts}]
    }
}

class Group {

    pixelTop: number = 0
    pixelBottom: number = 0
    rows: any[] = []
    name: string


    constructor(name: string) {
        this.name = name
    }

    push(row: any): void {
        this.rows.push(row)
    }

    get length(): number {
        return this.rows.length
    }

    sortRows(options: SortOptions, alignmentContainer: AlignmentContainer): void {

        const newRows: any[] = []
        const undefinedRow: any[] = []
        for (let row of this.rows) {
            const alignment = row.findAlignment(options.position, options.sortAsPairs)
            if (undefined !== alignment) {
                newRows.push(row)
            } else {
                undefinedRow.push(row)
            }
        }

        newRows.sort((rowA: any, rowB: any) => {
            const direction = options.direction
            const rowAValue = rowA.getSortValue(options, alignmentContainer)
            const rowBValue = rowB.getSortValue(options, alignmentContainer)

            // BUG: Original code has `rowBValue === undefined && rowBValue !== undefined` which is always false.
            // It should be `rowAValue === undefined && rowBValue !== undefined`
            if (rowAValue === undefined && rowBValue !== undefined) return 1
            else if (rowAValue !== undefined && rowBValue === undefined) return -1

            const i = rowAValue > rowBValue ? 1 : (rowAValue < rowBValue ? -1 : 0)
            return true === direction ? i : -i
        })

        for (let row of undefinedRow) {
            newRows.push(row)
        }

        this.rows = newRows

    }

}


function canBePaired(alignment: Alignment): boolean {
    return alignment.isPaired() &&
        alignment.mate != null &&
        alignment.isMateMapped() &&
        alignment.chr === alignment.mate.chr &&
        (alignment.isFirstOfPair() || alignment.isSecondOfPair()) && !(alignment.isSecondary() || alignment.isSupplementary())
}


function pairAlignments(alignments: Alignment[]): Alignment[] {

    const pairCache: Map<string, any> = new Map()
    const result = alignments.map((alignment: Alignment) => {
        if (canBePaired(alignment)) {
            let pairedAlignment = pairCache.get(alignment.readName)
            if (pairedAlignment) {
                pairedAlignment.setSecondAlignment(alignment)
                pairCache.delete(alignment.readName)
                return pairedAlignment
            } else {
                pairedAlignment = new PairedAlignment(alignment)
                pairCache.set(alignment.readName, pairedAlignment)
                return pairedAlignment
            }
        } else {
            return alignment
        }
    })
    return result
}

function unpairAlignments(alignments: Alignment[]): Alignment[] {
    return alignments.flatMap((alignment: any) => alignment instanceof PairedAlignment ?
        [alignment.firstAlignment, alignment.secondAlignment].filter(Boolean) :
        [alignment])
}

/**
 * Return 0 <= i <= array.length such that !pred(array[i - 1]) && pred(array[i]).
 */
function binarySearch(array: Alignment[], pred: (a: Alignment) => boolean, min: number): number {
    let lo = min - 1, hi = array.length
    while (1 + lo < hi) {
        const mi = lo + ((hi - lo) >> 1)
        if (pred(array[mi])) {
            hi = mi
        } else {
            lo = mi
        }
    }
    return hi
}


function getGroupComparator(groupName: string | undefined, expectedPairOrientation: string | undefined): (a: string, b: string) => number {
    switch (groupName) {
        case "pairOrientation":
            return pairOrientationComparator(expectedPairOrientation)
        case 'strand':
        case 'firstOfPairStrand':
            return groupStrandComparator
        default:
            return groupName && groupName.startsWith("base:") ?
                baseComparator :
                groupNameComparator
    }
}

const baseRank: Map<string, number> = new Map([["A", 1], ["T", 2], ["C", 3], ["G", 4], ["N", 5], ["GAP", 5], ["", 7]])

function baseComparator(o1: string, o2: string): number {
    if (baseRank.has(o1) && baseRank.has(o2)) {
        return baseRank.get(o1)! - baseRank.get(o2)!
    } else {
        return o1.localeCompare(o2, undefined, {sensitivity: 'base'})
    }
}

function groupStrandComparator(o1: string, o2: string): number {
    if (o1 === o2) {
        return 0
    } else if (o1 && o2) {
        return -o1.localeCompare(o2)
    } else {
        return o1 ? 1 : -1
    }
}

function groupNameComparator(o1: string, o2: string): number {
    if (!o1 && !o2) {
        return 0
    } else if (!o1) {
        return 1
    } else if (!o2) {
        return -1
    } else {
        // no nulls
        if (o1 === o2) {
            return 0
        } else {
            // BUG: Original code has `isNumber(o1) && typeof isNumber(o2)` - the `typeof` is extraneous
            // and always truthy (typeof returns a string). Should be `isNumber(o1) && isNumber(o2)`
            if (isNumber(o1) && isNumber(o2)) {
                return Number.parseFloat(o1) - Number.parseFloat(o2)
            } else {
                let s1 = o1.toString()
                let s2 = o2.toString()
                return s1.localeCompare(s2, undefined, {sensitivity: 'base'})
            }
        }
    }
}

function pairOrientationComparator(expectedPairOrientation: string | undefined): (o1: string, o2: string) => number {
    const orientationValues = ['LL', 'RR', 'RL', 'LR', '']
    return (o1: string, o2: string): number => orientationValues.indexOf(o1) - orientationValues.indexOf(o2)
}


export default AlignmentContainer
