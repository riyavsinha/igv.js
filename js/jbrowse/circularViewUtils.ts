import Locus from "../locus.js"
import {CircularView} from "../../node_modules/circular-view/dist/circular-view.js"
import {createSupplementaryAlignments} from "../bam/supplementaryAlignment"
import {IGVColor} from "../../node_modules/igv-utils/src/index.js"
import {getChrColor} from "../util/getChrColor.js"
import type Browser from "../browser.js"
import type ReferenceFrame from "../referenceFrame.js"

export interface Chord {
    uniqueId: string
    refName: string
    start: number
    end: number
    mate: {
        refName: string
        start: number
        end: number
    }
}

interface ChromosomeRegion {
    name: string
    bpLength: number
}

/** Alignment-like object with mate info, as accessed by circular view chord builders */
interface AlignmentLike {
    paired?: boolean
    firstAlignment?: AlignmentLike
    secondAlignment?: AlignmentLike
    readName: string
    chr: string
    start: number
    end: number
    mate?: { chr: string; position: number }
    getTag?(tag: string): string | number | number[] | null | undefined
}

/** BedPE-like feature as accessed by makeBedPEChords */
interface BedPEFeatureLike {
    _f?: BedPEFeatureLike
    chr1: string
    start1: number
    end1: number
    chr2: string
    start2: number
    end2: number
}

/** VCF variant-like feature as accessed by makeVCFChords */
interface VCFFeatureLike {
    _f?: VCFFeatureLike
    chr: string
    start: number
    end: number
    pos: number
    info: Record<string, string>
}

/** Feature-like object from chord click callback */
interface ChordFeature {
    refName: string
    chr: string
    start: number
    end: number
    mate?: ChordFeature
}

interface Genome {
    wgChromosomeNames?: string[]
    getChromosome(name: string): { name: string; bpLength: number } | undefined
    getChromosomeName(name: string): string
}

const MINIMUM_SV_LENGTH: number = 1000000

const circViewIsInstalled = (): boolean => CircularView.isInstalled()

const shortChrName = (chrName: string): string => {
    return chrName.startsWith("chr") ? chrName.substring(3) : chrName
}

const makePairedAlignmentChords = (alignments: AlignmentLike[]): Chord[] => {

    const chords: Chord[] = []
    for (let a of alignments) {

        if(a.paired) {
            if(a.firstAlignment && a.secondAlignment) {
                chords.push({
                    uniqueId: a.readName,
                    refName: shortChrName(a.firstAlignment.chr),
                    start: a.firstAlignment.start,
                    end: a.firstAlignment.end,
                    mate: {
                        refName: shortChrName(a.secondAlignment.chr),
                        start: a.secondAlignment.start,
                        end: a.secondAlignment.end,
                    }
                })
            }
        }
        else {
            const mate = a.mate
            if (mate && mate.chr && mate.position) {
                chords.push({
                    uniqueId: a.readName,
                    refName: shortChrName(a.chr),
                    start: a.start,
                    end: a.end,
                    mate: {
                        refName: shortChrName(mate.chr),
                        start: mate.position - 1,
                        end: mate.position,
                    }
                })
            }
        }
    }
    return chords
}

const makeSupplementalAlignmentChords = (alignments: AlignmentLike[]): Chord[] => {

    const makeChords = (a: AlignmentLike): void => {
        const sa = a.getTag!('SA') as string
        const supAl = createSupplementaryAlignments(sa)
        let n: number = 0
        for (let s of supAl) {
            if (s.start !== a.start) {
                chords.push({
                    uniqueId: `${a.readName}_${n++}`,
                    refName: shortChrName(a.chr),
                    start: a.start,
                    end: a.end,
                    mate: {
                        refName: shortChrName(s.chr),
                        start: s.start,
                        end: s.start + s.lenOnRef
                    }
                })
            }
        }
    }

    const chords: Chord[] = []
    for (let a of alignments) {
        if(a.paired) {
            makeChords(a.firstAlignment!)
            if(a.secondAlignment) {
                makeChords(a.secondAlignment)
            }
        } else {
            makeChords(a)
        }
    }
    return chords
}

const makeBedPEChords = (features: BedPEFeatureLike[]): Chord[] => {

    return features.map((v) => {

        // If v is a whole-genome feature, get the true underlying variant.
        const f = v._f || v

        return {
            uniqueId: `${f.chr1}:${f.start1}-${f.end1}_${f.chr2}:${f.start2}-${f.end2}`,
            refName: shortChrName(f.chr1),
            start: f.start1,
            end: f.end1,
            mate: {
                refName: shortChrName(f.chr2),
                start: f.start2,
                end: f.end2,
            }
        }
    })
}


const makeVCFChords = (features: VCFFeatureLike[]): Chord[] => {

    const svFeatures = features.filter((v) => {
        const f = v._f || v
        return !!(f.info && f.info.CHR2 && f.info.END &&
            (f.info.CHR2 !== f.chr || Math.abs(Number.parseInt(f.info.END) - f.pos) > MINIMUM_SV_LENGTH))
    })
    return svFeatures.map((v) => {

        // If v is a whole-genome feature, get the true underlying variant.
        const f = v._f || v

        const pos2: number = Number.parseInt(f.info.END)
        const start2: number = pos2 - 100
        const end2: number = pos2 + 100

        return {
            uniqueId: `${f.chr}:${f.start}-${f.end}_${f.info.CHR2}:${f.info.END}`,
            refName: shortChrName(f.chr),
            start: f.start,
            end: f.end,
            mate: {
                refName: shortChrName(f.info.CHR2),
                start: start2,
                end: end2
            }
        }
    })
}

function makeCircViewChromosomes(genome: Genome): ChromosomeRegion[] {
    const regions: ChromosomeRegion[] = []
    if(genome.wgChromosomeNames) {
        for (let chrName of genome.wgChromosomeNames) {
            const chr = genome.getChromosome(chrName)
            if (chr) {
                regions.push(
                    {
                        name: chr.name,
                        bpLength: chr.bpLength
                    }
                )
            }
        }
    }
    return regions
}

function sendChords(chords: Chord[], track: { name?: string; color?: unknown; browser: Browser }, refFrame: ReferenceFrame, alpha: number): void {

    const baseColor: string = (track.color as string) || 'rgb(0,0,255)'

    const chordSetColor: string = IGVColor.addAlpha("all" === refFrame.chr ? baseColor : getChrColor(refFrame.chr), alpha)
    const trackColor: string = IGVColor.addAlpha(baseColor, alpha)

    // name the chord set to include locus and filtering information
    const encodedName: string = (track.name || '').replace(/ /g, '%20')
    const chordSetName: string = "all" === refFrame.chr ? encodedName :
        `${encodedName}  ${refFrame.chr}:${refFrame.start}-${refFrame.end}`
    track.browser.circularView.addChords(chords, {track: chordSetName, color: chordSetColor, trackColor: trackColor})

    // show circular view if hidden
    if(!track.browser.circularViewVisible) track.browser.circularViewVisible = true

}


function createCircularView(el: HTMLElement, browser: Browser): InstanceType<typeof CircularView> {

    const circularView = new CircularView(el, {

        onChordClick: (feature: { data: unknown }) => {

            const f1 = feature.data as ChordFeature
            const f2 = f1.mate
            addFrameForFeature(f1)
            if (f2) addFrameForFeature(f2)

            function addFrameForFeature(feature: ChordFeature): void {

                feature.chr = browser.genome.getChromosomeName(feature.refName)
                let frameFound: boolean = false
                for (let referenceFrame of browser.referenceFrameList) {
                    const l = Locus.fromLocusString(referenceFrame.getLocusString())
                    if (l.contains(feature)) {
                        frameFound = true
                        break
                    } else if (l.overlaps(feature)) {
                        referenceFrame.extend(feature)
                        frameFound = true
                        break
                    }
                }
                if (!frameFound) {
                    const flanking: number = 2000
                    const center: number = (feature.start + feature.end) / 2
                    browser.addMultiLocusPanel(feature.chr, center - flanking, center + flanking)

                }
            }
        }
    })

    return circularView
}

export {
    circViewIsInstalled,
    makeBedPEChords,
    makePairedAlignmentChords,
    makeSupplementalAlignmentChords,
    makeVCFChords,
    createCircularView,
    makeCircViewChromosomes,
    sendChords
}
