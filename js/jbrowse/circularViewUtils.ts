import Locus from "../locus.js"
import {CircularView} from "../../node_modules/circular-view/dist/circular-view.js"
import {createSupplementaryAlignments} from "../bam/supplementaryAlignment"
import {IGVColor} from "../../node_modules/igv-utils/src/index.js"
import {getChrColor} from "../util/getChrColor.js"

interface Chord {
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

const MINIMUM_SV_LENGTH: number = 1000000

const circViewIsInstalled = (): boolean => CircularView.isInstalled()

const shortChrName = (chrName: string): string => {
    return chrName.startsWith("chr") ? chrName.substring(3) : chrName
}

const makePairedAlignmentChords = (alignments: any[]): Chord[] => {

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

const makeSupplementalAlignmentChords = (alignments: any[]): Chord[] => {

    const makeChords = (a: any): void => {
        const sa: string = a.getTag('SA')
        const supAl: any[] = createSupplementaryAlignments(sa)
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
            makeChords(a.firstAlignment)
            if(a.secondAlignment) {
                makeChords(a.secondAlignment)
            }
        } else {
            makeChords(a)
        }
    }
    return chords
}

const makeBedPEChords = (features: any[]): Chord[] => {

    return features.map((v: any) => {

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


const makeVCFChords = (features: any[]): Chord[] => {

    const svFeatures: any[] = features.filter((v: any) => {
        const f = v._f || v
        const isLargeEnough: boolean = f.info && f.info.CHR2 && f.info.END &&
            (f.info.CHR2 !== f.chr || Math.abs(Number.parseInt(f.info.END) - f.pos) > MINIMUM_SV_LENGTH)
        return isLargeEnough
    })
    return svFeatures.map((v: any) => {

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

function makeCircViewChromosomes(genome: any): ChromosomeRegion[] {
    const regions: ChromosomeRegion[] = []
    const colors: string[] = []
    if(genome.wgChromosomeNames) {
        for (let chrName of genome.wgChromosomeNames) {
            const chr = genome.getChromosome(chrName)
            colors.push(getChrColor(chr.name))
            regions.push(
                {
                    name: chr.name,
                    bpLength: chr.bpLength
                }
            )
        }
    }
    return regions
}

function sendChords(chords: Chord[], track: any, refFrame: any, alpha: number): void {

    const baseColor: string =  track.color || 'rgb(0,0,255)'

    const chordSetColor: string = IGVColor.addAlpha("all" === refFrame.chr ? baseColor : getChrColor(refFrame.chr), alpha)
    const trackColor: string = IGVColor.addAlpha(baseColor, alpha)

    // name the chord set to include locus and filtering information
    const encodedName: string = track.name.replaceAll(' ', '%20')
    const chordSetName: string = "all" === refFrame.chr ? encodedName :
        `${encodedName}  ${refFrame.chr}:${refFrame.start}-${refFrame.end}`
    track.browser.circularView.addChords(chords, {track: chordSetName, color: chordSetColor, trackColor: trackColor})

    // show circular view if hidden
    if(!track.browser.circularViewVisible) track.browser.circularViewVisible = true

}


function createCircularView(el: HTMLElement, browser: any): any {

    const circularView = new CircularView(el, {

        onChordClick: (feature: any, chordTrack: any, pluginManager: any) => {

            const f1 = feature.data
            const f2 = f1.mate
            addFrameForFeature(f1)
            addFrameForFeature(f2)

            function addFrameForFeature(feature: any): void {

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
