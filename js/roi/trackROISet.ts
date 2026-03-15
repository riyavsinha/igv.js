import FeatureSource from '../feature/featureSource.js'
import IGVGraphics from "../igv-canvas.js"
import { ROI_DEFAULT_COLOR, screenCoordinates } from "./ROISet.js"
import type {ROIConfig} from "../types/config.js"
import type Genome from "../genome/genome.js"
import type {GenomicFeature} from "../types/feature.js"
import type {FeatureSource as IFeatureSource} from "../types/reader.js"

class TrackROISet {

    name: string | undefined
    featureSource: IFeatureSource
    color: string

    constructor(config: ROIConfig, genome: Genome) {
        this.name = config.name
        this.featureSource = (config.featureSource as IFeatureSource) || FeatureSource(config, genome)
        this.color = config.color || ROI_DEFAULT_COLOR
    }

    async getFeatures(chr: string, start: number, end: number): Promise<GenomicFeature[]> {
        return this.featureSource.getFeatures({chr, start, end})
    }

    draw(drawConfiguration: { context: CanvasRenderingContext2D, bpPerPixel: number, bpStart: number, pixelTop: number, pixelHeight: number, pixelWidth: number, features: GenomicFeature[] }): void {

        const { context, bpPerPixel, bpStart, pixelTop, pixelHeight, pixelWidth, features, } = drawConfiguration

        if (!features) {
            return
        }

        const bpEnd = bpStart + (pixelWidth * bpPerPixel) + 1
        for (let { start:regionStartBP, end:regionEndBP } of features) {

            if (regionEndBP < bpStart) {
                continue
            }

            if (regionStartBP > bpEnd) {
                break
            }

            const { x, width } = screenCoordinates(regionStartBP, regionEndBP, bpStart, bpPerPixel)
            IGVGraphics.fillRect(context, x, pixelTop, width, pixelHeight, { fillStyle: this.color })
        }
    }
}

export default TrackROISet
