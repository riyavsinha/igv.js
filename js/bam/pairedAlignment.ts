import orientationTypes from "./orientationTypes"
import type {Alignment} from "./alignmentContainer"
import type {PopupData} from "../types/feature"

class PairedAlignment {

    paired: boolean
    firstAlignment: Alignment
    secondAlignment: Alignment | undefined
    chr: string
    readName: string
    start: number
    end: number
    scStart: number
    scLengthOnRef: number
    lengthOnRef: number
    connectingStart: number
    connectingEnd: number

    constructor(firstAlignment: Alignment) {

        this.paired = true
        this.firstAlignment = firstAlignment
        this.chr = firstAlignment.chr
        this.readName = firstAlignment.readName

        const matePosition = firstAlignment.mate!.position
        if (firstAlignment.start < matePosition) {
            this.start = firstAlignment.start
            this.scStart = firstAlignment.scStart
            this.connectingStart = firstAlignment.start + firstAlignment.lengthOnRef
            this.connectingEnd = matePosition
        } else {
            this.start = matePosition
            this.scStart = this.start
            this.connectingStart = matePosition
            this.connectingEnd = firstAlignment.start
        }

        this.end = Math.max(matePosition, firstAlignment.start + firstAlignment.lengthOnRef)  // Approximate
        this.lengthOnRef = this.end - this.start

        let scEnd = Math.max(this.end, firstAlignment.scStart + firstAlignment.scLengthOnRef)
        this.scLengthOnRef = scEnd - this.scStart

    }

    setSecondAlignment(secondAlignment: Alignment): void {

        // TODO -- check the chrs are equal,  error otherwise
        this.secondAlignment = secondAlignment
        const firstAlignment = this.firstAlignment

        if (secondAlignment.start > firstAlignment.start) {
            this.connectingEnd = secondAlignment.start
        } else {
            this.connectingStart = secondAlignment.start + secondAlignment.lengthOnRef
        }

        this.start = Math.min(firstAlignment.start, secondAlignment.start)
        this.end = Math.max(firstAlignment.start + firstAlignment.lengthOnRef, secondAlignment.start + secondAlignment.lengthOnRef)
        this.lengthOnRef = this.end - this.start

        this.scStart = Math.min(firstAlignment.scStart, secondAlignment.scStart)
        const scEnd = Math.max(firstAlignment.scStart + firstAlignment.scLengthOnRef, secondAlignment.scStart + secondAlignment.scLengthOnRef)
        this.scLengthOnRef = scEnd - this.scStart

    }

    containsLocation(genomicLocation: number, showSoftClips?: boolean): boolean {
        const s = showSoftClips ? this.scStart : this.start
        const l = showSoftClips ? this.scLengthOnRef : this.lengthOnRef
        return (genomicLocation >= s && genomicLocation <= (s + l))
    }

    alignmentContaining(genomicLocation: number, showSoftClips?: boolean): Alignment | undefined {
        if (this.firstAlignment.containsLocation(genomicLocation, showSoftClips)) {
            return this.firstAlignment
        } else if (this.secondAlignment && this.secondAlignment.containsLocation(genomicLocation, showSoftClips)) {
            return this.secondAlignment
        } else {
            return undefined
        }
    }

    async popupData(genomicLocation: number, hiddenTags?: Set<string>, showTags?: Set<string>): Promise<PopupData[]> {

        let nameValues = await this.firstAlignment.popupData(genomicLocation, hiddenTags, showTags)

        if (this.secondAlignment) {
            nameValues.push("-------------------------------")
            nameValues = nameValues.concat(await this.secondAlignment.popupData(genomicLocation, hiddenTags, showTags))
        }
        return nameValues
    }

    isPaired(): boolean {
        return true // By definition
    }

    isMateMapped(): boolean {
        return true // By definition
    }

    isProperPair(): boolean {
        return this.firstAlignment.isProperPair()
    }

    isFirstOfPair(): boolean {
        return this.firstAlignment.isFirstOfPair()
    }

    isSecondOfPair(): boolean {
        return this.firstAlignment.isSecondOfPair()
    }

    isSecondary(): boolean {
        return false
    }

    isSupplementary(): boolean {
        return false
    }

    get strand(): boolean {
        return this.firstAlignment.strand
    }

    get mq(): number | undefined {
        return this.firstAlignment.mq
    }

    getBaseModificationSets(): null {
        return null
    }

    get fragmentLength(): number {
        return Math.abs(this.firstAlignment.fragmentLength)
    }

    get firstOfPairStrand(): boolean | string {
        // BUG: 'this.setSecondAlignment' is called as a property (this.setSecondAlignment.isFirstOfPair())
        // but setSecondAlignment is a method, not the secondAlignment object.
        // This should be 'this.secondAlignment.isFirstOfPair()' instead of 'this.setSecondAlignment.isFirstOfPair()'.
        return this.firstAlignment.isFirstOfPair() ? this.firstAlignment.strand :
            (this.secondAlignment && this.secondAlignment.isFirstOfPair()) ? this.secondAlignment.strand : ""
    }

    get pairOrientation(): string {
        return this.firstAlignment.pairOrientation
    }

    hasTag(str: string): boolean {
        return this.firstAlignment.hasTag(str) || !!(this.secondAlignment && this.secondAlignment.hasTag(str))
    }

    getTag(tagName: string): string | number | undefined {
        const firstTag = this.firstAlignment.getTag(tagName)
        const secondTag = this.secondAlignment ? this.secondAlignment.getTag(tagName) : undefined
        if (firstTag !== undefined && secondTag !== undefined && firstTag !== secondTag) {
            return `${firstTag} / ${secondTag}`
        }
        return firstTag !== undefined ? firstTag : secondTag
    }

    getAlignmentAtGenomicLocation(genomicLocation: number): Alignment | undefined {
        if (this.firstAlignment.containsLocation(genomicLocation)) {
            return this.firstAlignment
        } else if (this.secondAlignment && this.secondAlignment.containsLocation(genomicLocation)) {
            return this.secondAlignment
        } else {
            return undefined
        }
    }

    getGroupValue(groupBy: string, expectedPairOrientation?: string): string {

        let tag: string | undefined, chr: string | undefined, pos: number | undefined
        if (groupBy.startsWith("tag:")) {
            tag = groupBy.substring(4)
            groupBy = "tag"
        } else if (groupBy.startsWith("base:") || groupBy.startsWith("insertion:")) {
            const tokens = groupBy.split(":")
            if (tokens.length === 3) {
                groupBy = tokens[0]
                chr = tokens[1]
                pos = Number.parseInt(tokens[2].replace(/,/g, "")) - 1
            }
        }

        switch (groupBy) {

            case 'strand':
                return String(this.firstAlignment.strand) + (this.secondAlignment ? String(this.secondAlignment.strand) : '')
            case 'firstOfPairStrand':
                return String(this.firstOfPairStrand)
            case 'mateChr':
                return ''
            case 'pairOrientation':
                return orientationTypes[expectedPairOrientation!]?.[this.pairOrientation] || ""
            case 'chimeric':
                return this.hasTag('SA') ? "chimeric" : ""
            case 'supplementary':
                return this.firstAlignment.isSupplementary() ||
                (this.secondAlignment && this.secondAlignment.isSupplementary()) ? "supplementary" : ""
            case 'readOrder':
                    return ""
            case 'phase':
                return String(this.getTag('HP') ?? "")
            case 'tag':
                return String(this.getTag(tag!) ?? "")
            case 'base':
                if (chr && pos !== undefined) {
                    const alignment = this.getAlignmentAtGenomicLocation(pos)
                    if (alignment && alignment.readBaseAt) {
                        const baseAtPos = alignment.readBaseAt(pos)
                        if (baseAtPos) {
                            return baseAtPos
                        } else {
                            return "GAP"
                        }
                    }
                }
                return ""
            case 'insertion':
                if (chr && pos !== undefined) {
                    const alignment = this.getAlignmentAtGenomicLocation(pos)
                    if (alignment && alignment.insertionAtGenomicLocation && alignment.seq) {
                        const insertion = alignment.insertionAtGenomicLocation(pos)
                        return insertion ? alignment.seq.substring(insertion.seqOffset!, insertion.seqOffset! + insertion.len) : ""
                    }
                }
                return ""

            default:
                return ""
        }
    }

}

export default PairedAlignment
