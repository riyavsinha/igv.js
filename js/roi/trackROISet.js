import FeatureSource from '../feature/featureSource.js'
import IGVGraphics from "../igv-canvas.js"
import { ROI_DEFAULT_COLOR, screenCoordinates } from "./ROISet.js"

class TrackROISet {

    constructor(config, genome) {
        this.name = config.name
        this.featureSource = config.featureSource || FeatureSource(config, genome)
        this.color = config.color || ROI_DEFAULT_COLOR
    }

    async getFeatures(chr, start, end) {
        return this.featureSource.getFeatures({chr, start, end})
    }

    draw(drawConfiguration) {

        const { context, bpPerPixel, bpStart, pixelTop, pixelHeight, pixelWidth, features, browser } = drawConfiguration

        if (!features) {
            return
        }

        console.log(`ROI draw called: browser=${!!browser}, variantCoordinates=${!!(browser && browser.variantCoordinates)}, features.length=${features.length}`)

        // Viewport coordinates should now already be in expanded space from trackViewport.js
        // Transform ROI feature coordinates to expanded coordinates if we have insertions
        const bpEnd = bpStart + (pixelWidth * bpPerPixel) + 1
        for (let { start:regionStartBP, end:regionEndBP, chr } of features) {

            // Transform ROI coordinates to expanded coordinates if we have insertions
            let transformedStartBP = regionStartBP
            let transformedEndBP = regionEndBP
            
            if (browser && browser.variantCoordinates && chr) {
                transformedStartBP = browser.variantCoordinates.genomicToExpanded(chr, regionStartBP)
                transformedEndBP = browser.variantCoordinates.genomicToExpanded(chr, regionEndBP)
                console.log(`ROI feature transform: ${chr}:${regionStartBP}-${regionEndBP} -> ${transformedStartBP}-${transformedEndBP}`)
            }

            if (transformedEndBP < bpStart) {
                continue
            }

            if (transformedStartBP > bpEnd) {
                break
            }

            const { x, width } = screenCoordinates(transformedStartBP, transformedEndBP, bpStart, bpPerPixel)
            console.log(`ROI screen coords: x=${x}, width=${width} (from ${transformedStartBP}-${transformedEndBP}, viewport ${bpStart})`)
            IGVGraphics.fillRect(context, x, pixelTop, width, pixelHeight, { fillStyle: this.color })
        }
    }
}

export default TrackROISet
