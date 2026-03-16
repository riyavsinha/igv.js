import {StringUtils} from "../../node_modules/igv-utils/src/index.js"
import {createSupplementaryAlignments} from "./supplementaryAlignment"
import {byteToUnsignedInt, getBaseModificationSets} from "./mods/baseModificationUtils"
import orientationTypes from "./orientationTypes"
import {HGVS} from "../genome/hgvs"
import {ClinVar} from "../genome/clinVar"
import AlignmentBlock from "./alignmentBlock"
import type {TagValue} from "./bamUtils"
import type BaseModificationSet from "./mods/baseModificationSet"
import type {PopupData} from "../types/feature.js"
import type Genome from "../genome/genome.js"

const READ_PAIRED_FLAG = 0x1
const PROPER_PAIR_FLAG = 0x2
const READ_UNMAPPED_FLAG = 0x4
const MATE_UNMAPPED_FLAG = 0x8
const READ_STRAND_FLAG = 0x10
const MATE_STRAND_FLAG = 0x20
const FIRST_OF_PAIR_FLAG = 0x40
const SECOND_OF_PAIR_FLAG = 0x80
const SECONDARY_ALIGNMNET_FLAG = 0x100
const READ_FAILS_VENDOR_QUALITY_CHECK_FLAG = 0x200
const DUPLICATE_READ_FLAG = 0x400
const SUPPLEMENTARY_ALIGNMENT_FLAG = 0x800
const ELEMENT_SIZE: Record<string, number> = {
    c: 1,
    C: 1,
    s: 2,
    S: 2,
    i: 4,
    I: 4,
    f: 4
}

const MAX_CIGAR = 50

interface Mate {
    chr: string
    position: number
    strand: boolean
}

interface Gap {
    start: number
    len: number
    type?: string
}

/**
 * readName
 * chr
 * cigar
 * lengthOnRef
 * start
 * seq
 * qual
 * mq
 * strand
 * blocks
 */

class BamAlignment {

    hidden: boolean
    flags!: number
    readName!: string
    chr!: string
    start!: number
    end!: number
    cigar!: string
    lengthOnRef!: number
    fragmentLength!: number
    mq!: number
    strand!: boolean
    seq!: string
    qual!: number[] | string
    mate!: Mate
    tagDict!: Record<string, TagValue>
    blocks!: AlignmentBlock[]
    insertions?: AlignmentBlock[]
    gaps?: Gap[]
    pairOrientation!: string
    scStart!: number
    scLengthOnRef!: number
    paired?: boolean

    private baseModificationSets: BaseModificationSet[] | Set<never> | undefined

    constructor() {
        this.hidden = false
    }

    isMapped(): boolean {
        return (this.flags & READ_UNMAPPED_FLAG) === 0
    }

    isPaired(): boolean {
        return (this.flags & READ_PAIRED_FLAG) !== 0
    }

    isProperPair(): boolean {
        return (this.flags & PROPER_PAIR_FLAG) !== 0
    }

    isFirstOfPair(): boolean {
        return (this.flags & FIRST_OF_PAIR_FLAG) !== 0
    }

    isSecondOfPair(): boolean {
        return (this.flags & SECOND_OF_PAIR_FLAG) !== 0
    }

    isSecondary(): boolean {
        return (this.flags & SECONDARY_ALIGNMNET_FLAG) !== 0
    }

    isSupplementary(): boolean {
        return (this.flags & SUPPLEMENTARY_ALIGNMENT_FLAG) !== 0
    }

    isFailsVendorQualityCheck(): boolean {
        return (this.flags & READ_FAILS_VENDOR_QUALITY_CHECK_FLAG) !== 0
    }

    isDuplicate(): boolean {
        return (this.flags & DUPLICATE_READ_FLAG) !== 0
    }

    isMateMapped(): boolean {
        return (this.flags & MATE_UNMAPPED_FLAG) === 0
    }

    isNegativeStrand(): boolean {
        return (this.flags & READ_STRAND_FLAG) !== 0
    }

    isMateNegativeStrand(): boolean {
        return (this.flags & MATE_STRAND_FLAG) !== 0
    }

    hasTag(tag: string): boolean {
        return this.tagDict.hasOwnProperty(tag)
    }

    getTag(key: string): TagValue | undefined {
        return this.tagDict[key]
    }


    /**
     * @returns a boolean indicating strand of first in pair, true for forward, false for reverse, and undefined
     * if this is not paired or is not first and mate is not mapped.
     */
    get firstOfPairStrand(): boolean | undefined {
        if (this.isPaired()) {
            if (this.isFirstOfPair()) {
                return this.strand
            } else if (this.isMateMapped()) {
                return this.mate.strand
            }
        }
        return undefined
    }


    /**
     * Does alignment (or alignment extended by soft clips) contain the genomic location?
     *
     * @param genomicLocation
     * @param showSoftClips
     * @returns {boolean}
     */
    containsLocation(genomicLocation: number, showSoftClips?: boolean): boolean {
        const s = showSoftClips ? this.scStart : this.start
        const l = showSoftClips ? this.scLengthOnRef : this.lengthOnRef
        return (genomicLocation >= s && genomicLocation <= (s + l))
    }

    /**
     * Return data to show in the popup.  Elements are either strings (for raw HTML) or
     * objects with name, value, borderTop properties.
     *
     * @param genomicLocation - 0-based genomic location
     * @param hiddenTags - Set of bam tags to hide
     * @param showTags - Set of bam tags to show (overrides hide/show rules)
     * @param refBase - reference base at the location
     * @param genome - genome object
     * @returns {Promise<PopupData[]>}
     */
    async popupData(genomicLocation: number, hiddenTags?: Set<string>, showTags?: Set<string>, refBase?: string, genome?: Genome): Promise<PopupData[]> {

        // if the user clicks on a base next to an insertion, show just the
        // inserted bases in a popup (like in desktop IGV).
        const nameValues: PopupData[] = []

        // Convert genomic location to int
        genomicLocation = Math.floor(genomicLocation)

        if (this.insertions) {

            const seq = this.seq

            for (let insertion of this.insertions) {
                var ins_start = insertion.start
                if (genomicLocation === ins_start || genomicLocation === ins_start - 1) {
                    nameValues.push({name: 'Insertion', value: seq.substr(insertion.seqOffset, insertion.len)})
                    nameValues.push({name: 'Location', value: ins_start})
                    return nameValues
                }
            }
        }

        nameValues.push({name: 'Read Name', value: this.readName})


        // HGVS annotations for variants, and ClinVar links if available
        const readBase = this.readBaseAt(genomicLocation)
        if (refBase) {
            if (readBase && readBase !== refBase && readBase !== '*') {
                const hgvsNotation = await HGVS.createHGVSAnnotation(genome!, this.chr, genomicLocation, refBase, readBase)
                if (hgvsNotation) {
                    const clinVarURL = await ClinVar.getClinVarURL(hgvsNotation)
                    if (clinVarURL) {
                        nameValues.push({
                            name: 'ClinVar',
                            value: `<a href='${clinVarURL}' target='_blank'>${hgvsNotation}</a>`
                        })
                    } else {
                        nameValues.push({name: 'HGVS', value: hgvsNotation})
                    }
                }
            }
        }

        // Sample
        // Read group
        nameValues.push('<hr/>')

        // Add 1 to genomic location to map from 0-based computer units to user-based units
        nameValues.push({name: 'Alignment Start', value: StringUtils.numberFormatter(1 + this.start), borderTop: true})
        nameValues.push({name: 'Read Strand', value: (true === this.strand ? '(+)' : '(-)'), borderTop: true})

        // Abbreviate long cigar strings, keeping the beginning and end to show cliping
        let cigar = this.cigar
        if (cigar && cigar.length > MAX_CIGAR) {
            const half = MAX_CIGAR / 2
            cigar = `${cigar.substring(0, half - 2)} ... ${cigar.substring(cigar.length - half + 2)}`
        }
        nameValues.push({name: 'Cigar', value: cigar})

        nameValues.push({name: 'Mapping Quality', value: this.mq})
        nameValues.push({name: 'Secondary', value: yesNo(this.isSecondary())})
        nameValues.push({name: 'Supplementary', value: yesNo(this.isSupplementary())})
        nameValues.push({name: 'Duplicate', value: yesNo(this.isDuplicate())})
        nameValues.push({name: 'Failed QC', value: yesNo(this.isFailsVendorQualityCheck())})

        if (this.isPaired()) {
            nameValues.push('<hr/>')
            nameValues.push({name: 'First in Pair', value: yesNo(!this.isSecondOfPair()), borderTop: true})
            nameValues.push({name: 'Mate is Mapped', value: yesNo(this.isMateMapped())})
            if (this.pairOrientation) {
                nameValues.push({name: 'Pair Orientation', value: this.pairOrientation})
            }
            if (this.isMateMapped()) {
                nameValues.push({name: 'Mate Chromosome', value: this.mate.chr})
                nameValues.push({name: 'Mate Start', value: (this.mate.position + 1)})
                nameValues.push({name: 'Mate Strand', value: (true === this.mate.strand ? '(+)' : '(-)')})
                nameValues.push({name: 'Insert Size', value: this.fragmentLength})
            }

        }

        const tagDict = this.tagDict

        if (tagDict.hasOwnProperty('SA')) {
            nameValues.push('<hr/>')
            nameValues.push({name: 'Supplementary Alignments', value: ''})
            const sa = createSupplementaryAlignments(tagDict['SA'] as string)
            if (sa) {
                nameValues.push('<ul>')
                for (let s of sa) {
                    nameValues.push(`<li>${s.printString()}</li>`)
                }
                nameValues.push('</ul>')
            }
        }

        nameValues.push('<hr/>')
        for (let key in tagDict) {
            const tagVal = tagDict[key]
            const displayValue: string | number = Array.isArray(tagVal) ? tagVal.join(', ') : (tagVal ?? '')
            if (showTags?.has(key)) {
                nameValues.push({name: key, value: displayValue})
            } else if (showTags) {
                hiddenTags!.add(key)
            } else if (!hiddenTags!.has(key)) {
                nameValues.push({name: key, value: displayValue})
            }
        }

        if (hiddenTags && hiddenTags.size > 0) {
            nameValues.push({name: 'Hidden Tags', value: Array.from(hiddenTags).join(", ")})
        }

        nameValues.push('<hr/>')
        nameValues.push({name: 'Genomic Location: ', value: StringUtils.numberFormatter(1 + genomicLocation)})
        nameValues.push({name: 'Read Base:', value: readBase})
        nameValues.push({name: 'Base Quality:', value: this.readBaseQualityAt(genomicLocation)})

        const bmSets = this.getBaseModificationSets()
        if (bmSets) {
            const i = this.positionToReadIndex(genomicLocation)
            if (undefined !== i) {
                let found = false
                for (let bmSet of bmSets) {
                    if (bmSet.containsPosition(i)) {
                        if (!found) {
                            nameValues.push('<hr/>')
                            nameValues.push('<b>Base modifications:</b>')
                            found = true
                        }
                        const lh = Math.round((100 / 255) * byteToUnsignedInt(bmSet.likelihoods.get(i)!))
                        nameValues.push(`${bmSet.fullName()} @ likelihood =  ${lh}%`)
                    }
                }
            }
        }

        return nameValues


        function yesNo(bool: boolean): string {
            return bool ? 'Yes' : 'No'
        }
    }

    readBaseAt(genomicLocation: number): string | undefined {

        const block = this.blockAtGenomicLocation(genomicLocation)
        if (block) {
            if ("*" === this.seq) {
                return "*"
            } else {
                const idx = block.seqIndexAt(genomicLocation)
                return this.seq[idx]
            }
        } else {
            return undefined
        }
    }

    readBaseQualityAt(genomicLocation: number): number | undefined {

        const block = this.blockAtGenomicLocation(genomicLocation)
        if (block) {
            if ("*" === this.qual) {
                return 30
            } else {
                const idx = block.seqIndexAt(genomicLocation)
                if (idx >= 0 && this.qual && idx < this.qual.length) {
                    return this.qual[idx] as number
                } else {
                    return 30
                }
            }
        } else {
            return undefined
        }
    }

    gapSizeAt(genomicLocation: number): number {
        if (this.gaps) {
            for (let gap of this.gaps) {
                if (genomicLocation >= gap.start && genomicLocation < gap.start + gap.len) {
                    return gap.len
                }
            }
        }
        return 0
    }

    /**
     * Return soft clipped blocks, if they exist, keyed by alignment end (left or right)
     */
    softClippedBlocks(): { left?: AlignmentBlock; right?: AlignmentBlock } {
        let left: AlignmentBlock | undefined
        let right: AlignmentBlock | undefined
        let interiorSeen = false
        for (let b of this.blocks) {
            if ('S' === b.type) {
                if (interiorSeen) {
                    right = b
                } else {
                    left = b
                }
            } else if ('H' !== b.type) {
                interiorSeen = true
            }
        }
        return {left, right}
    }

    getBaseModificationSets(): BaseModificationSet[] | Set<never> | undefined {

        if (!this.baseModificationSets && (this.tagDict["MM"] || this.tagDict["Mm"])) {

            const mm = this.tagDict["MM"] || this.tagDict["Mm"]
            const ml = this.tagDict["ML"] || this.tagDict["Ml"]

            if (StringUtils.isString(mm) && (!ml || Array.isArray(ml))) { // minimal validation, 10X uses these reserved tags for something completely different
                if ((mm as string).length === 0) {
                    this.baseModificationSets = EMPTY_SET
                } else {
                    this.baseModificationSets = getBaseModificationSets(mm as string, (ml as number[] | null), this.seq, this.isNegativeStrand())
                }
            }
        }
        return this.baseModificationSets
    }

    positionToReadIndex(position: number): number | undefined {
        const block = this.blockAtGenomicLocation(position)
        if (block) {
            return (position - block.start) + block.seqOffset
        } else {
            return undefined
        }
    }

    blockAtGenomicLocation(genomicLocation: number): AlignmentBlock | undefined {

        const blocks = this.blocks
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i]
            if (genomicLocation >= block.start && genomicLocation < block.start + block.len) {
                return block
            }
        }
        return undefined
    }

    /** Return the insertion at the specified genomic location, if it exists. Insertions are considered to be at the
     * position of the first inserted base, so for example an insertion of "AAA" after position 100
     * would be considered to be at position 101.
     */
    insertionAtGenomicLocation(genomicLocation: number): AlignmentBlock | undefined {
        if (this.insertions) {
            for (let insertion of this.insertions) {
                const ins_start = insertion.start
                if (genomicLocation === ins_start) {
                    return insertion
                }
            }
        }
        return undefined
    }

    getGroupValue(groupBy: string, expectedPairOrientation?: string): string | undefined {

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
                return this.strand ? '+' : '-'
            case 'firstOfPairStrand': {
                const strand = this.firstOfPairStrand
                return strand === undefined ? "" : strand ? '+' : '-'
            }
            case 'mateChr':
                return (this.mate && this.isMateMapped()) ? this.mate.chr : ""
            case 'pairOrientation':
                return orientationTypes[expectedPairOrientation!]?.[this.pairOrientation] || ""
            case 'chimeric':
                return this.hasTag('SA') ? "chimeric" : ""
            case 'supplementary':
                return this.isSupplementary() ? "supplementary" : ""
            case 'readOrder':
                if (this.isPaired() && this.isFirstOfPair()) {
                    return "first"
                } else if (this.isPaired() && this.isSecondOfPair()) {
                    return "second"
                } else {
                    return ""
                }
            case 'phase':
                return String(this.getTag('HP') ?? "")
            case 'tag':
                return String(this.getTag(tag!) ?? "")
            case 'base':
                if (this.chr === chr &&
                    this.start <= pos! &&
                    this.end > pos!) {
                    const baseAtPos = this.readBaseAt(pos!)
                    if (baseAtPos) {
                        return baseAtPos
                    } else {
                        return "GAP"
                    }
                } else {
                    return ""
                }
            case 'insertion':
                if (this.chr === chr &&
                    this.start <= pos! &&
                    this.end > pos!) {
                    const insertion = this.insertionAtGenomicLocation(pos!)
                    return insertion ? this.seq.substring(insertion.seqOffset, insertion.seqOffset + insertion.len) : ""
                } else {
                    return ""
                }
            default:
                return undefined
        }
    }

}

const EMPTY_SET: Set<never> = new Set()


function readInt(ba: Uint8Array, offset: number): number {
    return (ba[offset + 3] << 24) | (ba[offset + 2] << 16) | (ba[offset + 1] << 8) | (ba[offset])
}

function readShort(ba: Uint8Array, offset: number): number {
    return (ba[offset + 1] << 8) | (ba[offset])
}

function readFloat(ba: Uint8Array, offset: number): number {
    const dataView = new DataView(ba.buffer)
    return dataView.getFloat32(offset)
}

function readInt8(ba: Uint8Array, offset: number): number {
    const dataView = new DataView(ba.buffer)
    return dataView.getInt8(offset)
}

function readUInt8(ba: Uint8Array, offset: number): number {
    const dataView = new DataView(ba.buffer)
    return dataView.getUint8(offset)
}


export default BamAlignment
