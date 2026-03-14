import FeatureTrack from "./feature/featureTrack.js"
import SequenceTrack from "./sequenceTrack.js"
import WigTrack from "./feature/wigTrack.js"
import SegTrack from "./feature/segTrack.js"
import MergedTrack from "./feature/mergedTrack.js"
import BAMTrack from "./bam/bamTrack.js"
import InteractionTrack from "./feature/interactionTrack.js"
import VariantTrack from "./variant/variantTrack.js"
import QTLTrack from "./qtl/qtlTrack.js"
import GWASTrack from "./gwas/gwasTrack.js"
import GCNVTrack from "./gcnv/gcnvTrack.js"
import RnaStructTrack from "./rna/rnaStruct.js"
import IdeogramTrack from "./ideogramTrack.js"
import SpliceJunctionTrack from "./feature/spliceJunctionTrack.js"
import BlatTrack from "./blat/blatTrack.js"
import CNVPytorTrack from "./cnvpytor/cnvpytorTrack.js"
import ShoeboxTrack from "./shoebox/shoeboxTrack.js"
import ImageTrack from "./ucsc/imageTrack.js"
//import CNVPytorTrack from "./CNVpytor/cnvpytorTrack.js"


const trackFunctions = new Map<string, (config: any, browser: any) => any>([
        ['ideogram', (config: any, browser: any) => new IdeogramTrack(browser)],
        ['sequence', (config: any, browser: any) => new SequenceTrack(config, browser)],
        ['feature', (config: any, browser: any) => new FeatureTrack(config, browser)],
        ['seg', (config: any, browser: any) => new SegTrack(config, browser)],
        ['mut', (config: any, browser: any) => new SegTrack(config, browser)],
        ['maf', (config: any, browser: any) => new SegTrack(config, browser)],
        ['shoebox', (config: any, browser: any) => new ShoeboxTrack(config, browser)],
        ['wig', (config: any, browser: any) => new WigTrack(config, browser)],
        ['merged', (config: any, browser: any) => new MergedTrack(config, browser, undefined)],
        ['alignment', (config: any, browser: any) => new BAMTrack(config, browser)],
        ['interaction', (config: any, browser: any) => new InteractionTrack(config, browser)],
        ['interact', (config: any, browser: any) => new InteractionTrack(config, browser)],
        ['variant', (config: any, browser: any) => new VariantTrack(config, browser)],
        ['qtl', (config: any, browser: any) => new QTLTrack(config, browser)],
        ['eqtl', (config: any, browser: any) => new QTLTrack(config, browser)],
        ['gwas', (config: any, browser: any) => new GWASTrack(config, browser)],
        ['arc', (config: any, browser: any) => new RnaStructTrack(config, browser)],
        ['gcnv', (config: any, browser: any) => new GCNVTrack(config, browser)],
        ['junction', (config: any, browser: any) => new SpliceJunctionTrack(config, browser)],
        ['blat', (config: any, browser: any) => new BlatTrack(config, browser)],
        ['cnvpytor', (config: any, browser: any) => new CNVPytorTrack(config, browser)],
        ['image', (config: any, browser: any) => new ImageTrack(config, browser)]
    ])

function knownTrackTypes (): Set<string> {
    return new Set(trackFunctions.keys())
}

function getTrack (type: string, config: any, browser: any): any | undefined {

    let trackKey: string
    switch (type) {
        case "annotation":
        case "genes":
        case "fusionjuncspan":
        case "snp":
            trackKey = "feature"
            break
        case 'seg':
        case 'maf':
        case 'mut':
            trackKey = 'seg'
            break
        case 'junctions':
        case 'splicejunctions':
            trackKey = 'junction'
            break
        default:
            trackKey = type
    }

    return trackFunctions.has(trackKey) ?
        trackFunctions.get(trackKey)!(config, browser) :
        undefined
}

function registerTrackClass(type: string, trackClass: any): void {
    trackFunctions.set(type, (config: any, browser: any) => new trackClass(config, browser))
}



function registerTrackCreatorFunction (type: string, track: (config: any, browser: any) => any): void {
    trackFunctions.set(type, track)
}

export {
    getTrack,
    trackFunctions,
    registerTrackClass,
    registerTrackCreatorFunction,
    knownTrackTypes
}
