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
import type {TrackConfig} from "./types/config"
import type Browser from "./browser.js"
//import CNVPytorTrack from "./CNVpytor/cnvpytorTrack.js"

/** Union of all built-in track types */
type Track =
    | IdeogramTrack
    | SequenceTrack
    | FeatureTrack
    | SegTrack
    | ShoeboxTrack
    | WigTrack
    | MergedTrack
    | BAMTrack
    | InteractionTrack
    | VariantTrack
    | QTLTrack
    | GWASTrack
    | RnaStructTrack
    | GCNVTrack
    | SpliceJunctionTrack
    | BlatTrack
    | CNVPytorTrack
    | ImageTrack

type TrackCreator = (config: TrackConfig, browser: Browser) => Track

const trackFunctions = new Map<string, TrackCreator>([
        ['ideogram', (config: TrackConfig, browser: Browser) => new IdeogramTrack(browser)],
        ['sequence', (config: TrackConfig, browser: Browser) => new SequenceTrack(config, browser)],
        ['feature', (config: TrackConfig, browser: Browser) => new FeatureTrack(config, browser)],
        ['seg', (config: TrackConfig, browser: Browser) => new SegTrack(config, browser)],
        ['mut', (config: TrackConfig, browser: Browser) => new SegTrack(config, browser)],
        ['maf', (config: TrackConfig, browser: Browser) => new SegTrack(config, browser)],
        ['shoebox', (config: TrackConfig, browser: Browser) => new ShoeboxTrack(config, browser)],
        ['wig', (config: TrackConfig, browser: Browser) => new WigTrack(config, browser)],
        ['merged', (config: TrackConfig, browser: Browser) => new MergedTrack(config, browser, undefined)],
        ['alignment', (config: TrackConfig, browser: Browser) => new BAMTrack(config, browser)],
        ['interaction', (config: TrackConfig, browser: Browser) => new InteractionTrack(config, browser)],
        ['interact', (config: TrackConfig, browser: Browser) => new InteractionTrack(config, browser)],
        ['variant', (config: TrackConfig, browser: Browser) => new VariantTrack(config, browser)],
        ['qtl', (config: TrackConfig, browser: Browser) => new QTLTrack(config, browser)],
        ['eqtl', (config: TrackConfig, browser: Browser) => new QTLTrack(config, browser)],
        ['gwas', (config: TrackConfig, browser: Browser) => new GWASTrack(config, browser)],
        ['arc', (config: TrackConfig, browser: Browser) => new RnaStructTrack(config, browser)],
        ['gcnv', (config: TrackConfig, browser: Browser) => new GCNVTrack(config, browser)],
        ['junction', (config: TrackConfig, browser: Browser) => new SpliceJunctionTrack(config, browser)],
        ['blat', (config: TrackConfig, browser: Browser) => new BlatTrack(config, browser)],
        ['cnvpytor', (config: TrackConfig, browser: Browser) => new CNVPytorTrack(config, browser)],
        ['image', (config: TrackConfig, browser: Browser) => new ImageTrack(config, browser)]
    ])

function knownTrackTypes (): Set<string> {
    return new Set(trackFunctions.keys())
}

function getTrack (type: string, config: TrackConfig, browser: Browser): Track | undefined {

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

function registerTrackClass(type: string, trackClass: new (config: TrackConfig, browser: Browser) => any): void {
    trackFunctions.set(type, (config: TrackConfig, browser: Browser) => new trackClass(config, browser))
}



function registerTrackCreatorFunction (type: string, track: TrackCreator): void {
    trackFunctions.set(type, track)
}

export {
    getTrack,
    trackFunctions,
    registerTrackClass,
    registerTrackCreatorFunction,
    knownTrackTypes
}

export type { Track, TrackCreator }
