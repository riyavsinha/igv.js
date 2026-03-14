import IGVGraphics from "./igv-canvas.js"
import {IGVColor, StringUtils} from "../node_modules/igv-utils/src/index.js"
import GenomeUtils from "./genome/genomeUtils.js"
import {isInteger} from "./util/igvUtils.js"

const numberFormatter = StringUtils.numberFormatter
const defaultRulerHeight = 40

class RulerTrack {

    browser: any
    height: number
    name: string
    disableButtons: boolean
    ignoreTrackMenu: boolean
    order: number
    removable: boolean
    type: string
    id: string

    constructor(browser: any) {

        this.browser = browser
        this.height = defaultRulerHeight
        this.name = ""
        this.disableButtons = true
        this.ignoreTrackMenu = true
        this.order = Number.MIN_SAFE_INTEGER * 1e-2
        this.removable = false
        this.type = 'ruler'
        this.id = "ruler"
    }

    async getFeatures(chr: string, start: number, end: number): Promise<any[]> {
        return []
    };

    computePixelHeight(ignore: any) {
        return this.height
    };

    draw({context, referenceFrame, pixelWidth, pixelHeight, bpPerPixel, bpStart}: { context: any; referenceFrame: any; pixelWidth: number; pixelHeight: number; bpPerPixel: number; bpStart: number }) {

        if (GenomeUtils.isWholeGenomeView(referenceFrame.chr)) {
            this.drawWholeGenome({context, pixelWidth, pixelHeight, bpPerPixel})
        } else {
            this.doDraw({context, referenceFrame, pixelWidth, pixelHeight, bpStart})
        }
    }

    drawWholeGenome({context, pixelWidth, pixelHeight, bpPerPixel}: { context: any; pixelWidth: number; pixelHeight: number; bpPerPixel: number }) {

        context.save()

        IGVGraphics.fillRect(context, 0, 0, pixelWidth, pixelHeight, {'fillStyle': 'white'})

        for (let name of this.browser.genome.wgChromosomeNames) {

            let xBP = this.browser.genome.getCumulativeOffset(name)
            let wBP = this.browser.genome.getChromosome(name).bpLength

            let x = Math.round(xBP / bpPerPixel)
            let w = Math.round(wBP / bpPerPixel)

            this.renderChromosomeRect(context, x, 0, w, pixelHeight, name)
        }

        context.restore()

    }

    doDraw({context, referenceFrame, pixelWidth, pixelHeight, bpStart}: { context: any; referenceFrame: any; pixelWidth: number; pixelHeight: number; bpStart: number }) {

        context.clearRect(0, 0, pixelWidth, pixelHeight)

        const tickHeight = 6
        const shim = 2

        const bpLength = Math.floor(referenceFrame.toBP(pixelWidth))
        const tick = findSpacing(bpLength, context.isSVG)

        let nTick = Math.floor(bpStart / tick.majorTick) - 1

        const {tickDelta, labelLength} = calculateDeltas(context, referenceFrame, bpStart, nTick, tick)

        const index = this.browser.referenceFrameList.indexOf(referenceFrame)
        // console.log(`ruler(${ index }) label-length ${ labelLength > tickDelta ? 'clobbers' : 'less than' } tick-delta ${ StringUtils.numberFormatter(tickDelta)} `)

        let xTick
        let bp
        let accumulatedTickDelta = tickDelta
        const labelLengthShim = 0.25 * labelLength
        do {

            bp = Math.floor(nTick * tick.majorTick)
            const rulerLabel = `${StringUtils.numberFormatter(Math.floor(bp / tick.unitMultiplier))} ${tick.majorUnit}`

            xTick = Math.round(referenceFrame.toPixels((bp - 1) - bpStart + 0.5))
            const xLabel = Math.round(xTick - context.measureText(rulerLabel).width / 2)

            if (xLabel > 0 && (labelLengthShim + labelLength) <= accumulatedTickDelta) {
                IGVGraphics.fillText(context, rulerLabel, xLabel, this.height - (tickHeight / 0.75))
                accumulatedTickDelta = 0
            }

            if (xTick > 0) {
                IGVGraphics.strokeLine(context, xTick, this.height - tickHeight, xTick, this.height - shim)
            }

            bp = Math.floor((1 + nTick) * tick.majorTick)
            let pixel = Math.round(referenceFrame.toPixels((bp - 1) - bpStart + 0.5))
            let delta = (pixel - xTick) / 2
            let xx = xTick + delta
            if (xx > 0) {
                IGVGraphics.strokeLine(context, xx, this.height - tickHeight, xx, this.height - shim)
            }

            ++nTick
            accumulatedTickDelta += tickDelta

        } while (xTick < pixelWidth)

        IGVGraphics.strokeLine(context, 0, this.height - shim, pixelWidth, this.height - shim)

    }

    renderChromosomeRect(ctx: any, x: number, y: number, w: number, h: number, name: string) {

        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = '12px sans-serif'

        IGVGraphics.strokeLine(ctx, x + w, y, x + w, y + h, {strokeStyle: IGVColor.greyScale(191)})

        name = this.browser.genome.getChromosomeDisplayName(name)
        const shortName = (name.startsWith("chr")) ? name.substring(3) : name

        if (w > ctx.measureText(shortName).width) {
            IGVGraphics.fillText(ctx, shortName, (x + (w / 2)), (y + (h / 2)), {fillStyle: IGVColor.greyScale(68)})
        }
    }

    get supportsWholeGenome() {
        return true
    };

    dispose() {
        // do stuff
    }
}

/**
 * Potentially shorten the chromosome name for whole genome view
 * @param name
 */
function shortenChromsomeName(name: string): string {

    if(name.startsWith("chr")) {
        const tmp = name.substring(3)
        if(isInteger(tmp)) {
            return tmp
        }
    }
    return name

}

function findSpacing(bpLength: number, isSVG: boolean): Tick {

    if (bpLength < 10) {
        return new Tick(1, 'bp', 1)
    }

    const nZeroes = Math.floor(Math.log10(bpLength))

    let majorUnit = 'bp'
    let unitMultiplier = 1

    if (nZeroes > 9) {
        majorUnit = 'gb'
        unitMultiplier = 1e9
    } else if (nZeroes > 6) {
        majorUnit = 'mb'
        unitMultiplier = 1e6
    } else if (nZeroes > 3) {
        majorUnit = 'kb'
        unitMultiplier = 1e3
    }

    const denom = Math.pow(10, nZeroes - 1)
    const nMajorTicks = bpLength / denom

    // const threshold = 25
    const threshold = 3 * 25

    const belowThresholdTick = Math.pow(10, nZeroes - 1)
    const aboveThresholdTick = Math.pow(10, nZeroes) / 2

    // console.log(`zeros ${ nZeroes } tick-threshold ${ threshold } ticks ${ nMajorTicks } belowTick ${ StringUtils.numberFormatter(belowThresholdTick) } aboveTick ${ StringUtils.numberFormatter(aboveThresholdTick) }`)

    const majorTick = (nMajorTicks < threshold && isSVG !== true) ? belowThresholdTick : aboveThresholdTick

    return new Tick(majorTick, majorUnit, unitMultiplier)
}

function calculateDeltas(context: any, referenceFrame: any, bpStart: number, nTick: number, tick: Tick): { tickDelta: number; labelLength: number } {

    const tickDelta = getX(referenceFrame, getBP(1 + nTick, tick), bpStart) - getX(referenceFrame, getBP(nTick, tick), bpStart)

    const label = `${StringUtils.numberFormatter(Math.floor(getBP(nTick, tick) / tick.unitMultiplier))} ${tick.majorUnit}`
    const labelLength = Math.floor(context.measureText(label).width)

    return {tickDelta, labelLength}

    function getBP(nTick: number, tick: Tick): number {
        return Math.floor(nTick * tick.majorTick)
    }

    function getX(referenceFrame: any, bp: number, bpStart: number): number {
        return Math.round(referenceFrame.toPixels((bp - 1) - bpStart + 0.5))
    }
}

class Tick {

    majorTick: number
    minorTick: number
    majorUnit: string
    unitMultiplier: number
    labelWidthBP?: number

    constructor(majorTick: number, majorUnit: string, unitMultiplier: number) {
        this.majorTick = majorTick
        this.minorTick = majorTick / 10.0
        this.majorUnit = majorUnit
        this.unitMultiplier = unitMultiplier
    }

    description(blurb?: string) {
        console.log((blurb || '') + ' tick ' + numberFormatter(this.majorTick) + ' label width ' + numberFormatter(this.labelWidthBP) + ' multiplier ' + this.unitMultiplier)
    }
}

export { defaultRulerHeight, shortenChromsomeName }
export default RulerTrack
