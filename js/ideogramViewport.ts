import IGVGraphics from './igv-canvas.js'
import * as DOMUtils from "./ui/utils/dom-utils.js"
import TrackViewport from "./trackViewport.js"
import { IGVMath } from "../node_modules/igv-utils/src/index.js"

let timer: ReturnType<typeof setTimeout> | undefined
const toolTipTimeout = 1e4

class IdeogramViewport extends TrackViewport {

    // @ts-expect-error - IdeogramViewport uses a different cache type than TrackViewport
    featureCache: IdeogramFeatureCache = new IdeogramFeatureCache()
    ideogram_ctx: CanvasRenderingContext2D | undefined
    tooltip: HTMLDivElement | undefined
    tooltipContent: HTMLDivElement | undefined

    constructor(trackView: any, viewportColumn: HTMLElement, referenceFrame: any, width: number) {
        super(trackView, viewportColumn, referenceFrame, width)
    }

    initializationHelper(): void {

        this.canvas = document.createElement('canvas')

        this.canvas.className = 'igv-ideogram-canvas'
        this.viewportElement.appendChild(this.canvas);
        this.ideogram_ctx = this.canvas.getContext('2d')

        // Create the tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'igv-cytoband-tooltip';
        this.tooltip.style.height = `${this.viewportElement.clientHeight}px`;
        this.viewportElement.appendChild(this.tooltip);

        // Add tooltip for cytoband names
        this.tooltipContent = document.createElement('div');
        this.tooltip.appendChild(this.tooltipContent);

        // Initially hide the tooltip
        this.tooltip.style.display = 'none';

        this.addMouseHandlers()
    }

    // @ts-expect-error - IdeogramViewport has different getFeatures signature than TrackViewport
    async getFeatures(chr: string, start: number, end: number, bpPerPixel: number): Promise<any> {
        if (this.featureCache.containsRange(chr)) {
            return this.featureCache.get(chr)
        } else {
          return this.loadFeatures()
        }
    }

    async loadFeatures(): Promise<any> {
        const chr = this.referenceFrame.chr;
        const features = await  this.referenceFrame.genome.getCytobands(chr)
        this.featureCache.set(chr, features)
        return features
    }

    repaint(): void {

        if (undefined === this.featureCache) {
            return
        }

        const {width, height} = this.viewportElement.getBoundingClientRect()
        IGVGraphics.configureHighDPICanvas(this.ideogram_ctx, width, height)

        const chr = this.referenceFrame.chr
        const features = this.featureCache.get(chr)

        const config =
            {
                context: this.ideogram_ctx,
                pixelWidth: width,
                pixelHeight: height,
                referenceFrame: this.referenceFrame,
                features
            }

        this.trackView.track.draw(config)

    }


    addMouseHandlers(): void {
        this.addViewportClickHandler(this.viewportElement)

        // Add tooltip when showing contig name
        if (this.trackView.track.showCytobandNames) {
            this.viewportElement.addEventListener('mousemove', this.mouseMove.bind(this))
            this.viewportElement.addEventListener('mouseleave', this.mouseLeave.bind(this))
        }
    }

    mouseMove(event: MouseEvent): void {
        const {x} = DOMUtils.translateMouseCoordinates(event, this.viewportElement)

        // Get features
        const features = this.featureCache.get(this.referenceFrame.chr)
        if (features) {
            const {width: w} = this.viewportElement.getBoundingClientRect()

            const chrLength = features[features.length - 1].end
            const scale = w / chrLength

            let found = false;
            // Find cytoband that the mouse is over
            for (let i = 0; i < features.length; i++) {
                const cytoband = features[i]
                const start = cytoband.start * scale
                const end = cytoband.end * scale

                // If the mouse is over the cytoband, show the tooltip
                if (x >= start && x <= end) {
                    this.tooltipContent!.textContent = cytoband.name;
                    const {width: ww} = this.tooltipContent!.getBoundingClientRect()
                    let center = (start + end) / 2 - ww / 2

                    const tooltipLeft = IGVMath.clamp(center, 0, w - ww);
                    this.tooltip!.style.left = `${tooltipLeft}px`;

                    // hide tooltip when movement stops
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                        if (this.tooltip) this.tooltip.style.display = "none";
                    }, toolTipTimeout);

                    this.tooltip!.style.display = "block";

                    found = true
                    break
                }
            }
            if (found)
                return;
        }

        // If the mouse is not over a cytoband, or there are no features, hide the tooltip
        this.tooltip!.style.display = 'none';
    }

    mouseLeave(event: MouseEvent): void {
        this.tooltip!.style.display = 'none';
    }

    addViewportClickHandler(viewport: HTMLElement): void {

        this.boundClickHandler = clickHandler.bind(this) as (event: MouseEvent) => void
        viewport.addEventListener('click', this.boundClickHandler)

        function clickHandler(this: IdeogramViewport, event: MouseEvent): void {

            const {xNormalized, width} = DOMUtils.translateMouseCoordinates(event, this.ideogram_ctx!.canvas)
            const {bpLength} = this.browser.genome.getChromosome(this.referenceFrame.chr)
            const locusLength = this.referenceFrame.bpPerPixel * width
            const chrCoveragePercentage = locusLength / bpLength

            let xPercentage = xNormalized
            if (xPercentage - (chrCoveragePercentage / 2.0) < 0) {
                xPercentage = chrCoveragePercentage / 2.0
            }

            if (xPercentage + (chrCoveragePercentage / 2.0) > 1.0) {
                xPercentage = 1.0 - chrCoveragePercentage / 2.0
            }

            const ss = Math.round((xPercentage - (chrCoveragePercentage / 2.0)) * bpLength)
            const ee = Math.round((xPercentage + (chrCoveragePercentage / 2.0)) * bpLength)

            this.referenceFrame.start = ss
            this.referenceFrame.end = ee
            this.referenceFrame.bpPerPixel = (ee - ss) / width

            this.browser.updateViews(this.referenceFrame, this.browser.trackViews, true)

        }

    }

    setWidth(width: number): void {
        this.viewportElement.style.width = width + 'px';
    }

    renderSVGContext(context: any, {deltaX, deltaY}: { deltaX: number; deltaY: number }, includeLabel: boolean = true): void {

        const {width, height} = this.viewportElement.getBoundingClientRect()

        const str = 'ideogram'
        const index = this.browser.referenceFrameList.indexOf(this.referenceFrame)
        const id = `${str}_referenceFrame_${index}_guid_${DOMUtils.guid()}`

        const x = deltaX
        const y = this.contentTop + deltaY
        const yClipOffset = -this.contentTop

        context.saveWithTranslationAndClipRect(id, x, y, width, height, yClipOffset)
        this.trackView.track.draw({
            context,
            pixelWidth: width,
            pixelHeight: height,
            referenceFrame: this.referenceFrame,
            features: this.featureCache.get(this.referenceFrame.chr)
        })
        context.restore()

    }


    startSpinner(): void {
    }

    stopSpinner(): void {
    }
}

class IdeogramFeatureCache {
    features: Map<string, any> = new Map()

    containsRange(chr: string): boolean {
        return this.features.has(chr)
    }

    set(chr: string, features: any): void {
        this.features.set(chr, features)
    }

    get(chr: string): any {
        return this.features.get(chr)
    }
}

export default IdeogramViewport
