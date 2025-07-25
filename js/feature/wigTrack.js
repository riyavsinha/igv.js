import FeatureSource from './featureSource.js'
import TDFSource from "../tdf/tdfSource.js"
import TrackBase from "../trackBase.js"
import BWSource from "../bigwig/bwSource.js"
import IGVGraphics from "../igv-canvas.js"
import paintAxis from "../util/paintAxis.js"
import {IGVColor, StringUtils} from "../../node_modules/igv-utils/src/index.js"
import {createCheckbox} from "../igv-icons.js"
import {ColorScaleFactory} from "../util/colorScale.js"
import ColorScaleEditor from "../ui/components/colorScaleEditor.js"

class WigTrack extends TrackBase {

    static defaultColor = 'rgb(150, 150, 150)'

    static defaults = {
        height: 50,
        flipAxis: false,
        logScale: false,
        windowFunction: 'mean',
        graphType: 'bar',
        normalize: undefined,
        scaleFactor: undefined,
        overflowColor: `rgb(255, 32, 255)`,
        baselineColor: 'lightGray',
        summarize: true,
        visibilityWindow: undefined
    }

    constructor(config, browser) {
        super(config, browser)
    }

    init(config) {

        super.init(config)

        this.type = "wig"
        this.featureType = 'numeric'
        this.resolutionAware = true
        this._paintAxis = paintAxis.bind(this)

        const format = config.format ? config.format.toLowerCase() : config.format
        if (config.featureSource) {
            this.featureSource = config.featureSource
            delete config.featureSource
        } else if ("bigwig" === format) {
            this.featureSource = new BWSource(config, this.browser.genome)
        } else if ("tdf" === format) {
            this.featureSource = new TDFSource(config, this.browser.genome)
        } else {
            this.featureSource = FeatureSource(config, this.browser.genome)
        }

        // Override autoscale default
        if (config.max === undefined || config.autoscale === true) {
            this.autoscale = true
        } else {
            this.dataRange = {
                min: config.min || 0,
                max: config.max
            }
        }

        if (config.colorScale) {
            this._colorScale = ColorScaleFactory.fromJson(config.colorScale)
        }

        // Override default height for heatmaps
        if ("heatmap" === config.graphType && !config.height) {
            this.height = 20
        }
    }

    async postInit() {
        const header = await this.getHeader()
        if (this.disposed) return   // This track was removed during async load
        if (header) this.setTrackProperties(header)

        this._initialColor = this.color || this.constructor.defaultColor
        this._initialAltColor = this.altColor || this.constructor.defaultColor

    }

    get supportsWholeGenome() {
        return !this.config.indexURL && this.config.supportsWholeGenome !== false
    }

    get paintAxis() {
        // Supply do-nothing implementation for heatmaps
        return "heatmap" === this.graphType ? () => {
        } : this._paintAxis
    }

    get colorScale() {
        return this._colorScale
    }

    async getFeatures(chr, start, end, bpPerPixel) {

        const windowFunction = this.windowFunction

        const features = await this.featureSource.getFeatures({
            chr,
            start,
            end,
            bpPerPixel,
            visibilityWindow: this.visibilityWindow,
            windowFunction
        })
        if (this.normalize && this.featureSource.normalizationFactor) {
            const scaleFactor = this.featureSource.normalizationFactor
            for (let f of features) {
                f.value *= scaleFactor
            }
        }
        if (this.scaleFactor) {
            const scaleFactor = this.scaleFactor
            for (let f of features) {
                f.value *= scaleFactor
            }
        }

        // For dynseq rendering, attach sequence data to features
        if (this.graphType === "dynseq" && features && features.length > 0) {
            for (let f of features) {
                try {
                    f.sequence = await this.browser.genome.getSequence(f.chr, Math.floor(f.start), Math.floor(f.end))
                } catch (error) {
                    console.warn('Failed to get sequence for feature:', error)
                    f.sequence = null
                }
            }
        }

        // Summarize features to current resolution.  This needs to be done here, rather than in the "draw" function,
        // for group autoscale to work.
        if (this.summarize && ("mean" === windowFunction || "min" === windowFunction || "max" === windowFunction)) {
            return summarizeData(features, start, bpPerPixel, windowFunction)
        } else {
            return features
        }
    }

    menuItemList() {
        const items = []

        if ('heatmap' === this.graphType) {
            items.push('<hr>')
            items.push({
                label: 'Set color scale', click: function () {
                    ColorScaleEditor.open(this.colorScale, this.browser.columnContainer, (colorScale) => {
                        this._colorScale = colorScale
                        this.trackView.repaintViews()
                    })
                }
            })
        } else if (this.flipAxis !== undefined) {
            items.push('<hr>')
            items.push({
                label: 'Flip y-axis',
                click: function () {
                    this.flipAxis = !this.flipAxis
                    this.trackView.repaintViews()
                }
            })
        }

        items.push(...this.graphTypeItems())

        if (this.featureSource.windowFunctions) {
            items.push(...this.wigSummarizationItems())
        }

        items.push(...this.numericDataMenuItems())

        return items
    }

    wigSummarizationItems() {

        const windowFunctions = this.featureSource.windowFunctions

        const menuItems = []
        menuItems.push('<hr/>')
        menuItems.push("<div>Windowing function</div>")
        for (const wf of windowFunctions) {

            function clickHandler() {
                this.windowFunction = wf
                this.trackView.updateViews()
            }

            menuItems.push({element:createCheckbox(wf, this.windowFunction === wf), click: clickHandler})
        }

        return menuItems
    }

    graphTypeItems() {

        const graphType = ['bar', 'line', 'points', 'heatmap', 'dynseq']

        const menuItems = []
        menuItems.push('<hr/>')
        menuItems.push("<div>Graph type</div>")

        for (const gt of graphType) {

            function clickHandler() {
                this.graphType = gt
                this.trackView.repaintViews()
            }

            menuItems.push({element:createCheckbox(gt, this.graphType === gt), click: clickHandler})
        }

        return menuItems
    }

    async getHeader() {

        if (typeof this.featureSource.getHeader === "function") {
            this.header = await this.featureSource.getHeader()
        }
        return this.header
    }

    // TODO: refactor to igvUtils.js
    getScaleFactor(min, max, height, logScale) {
        const minValue = (logScale === true) ? ((min < 0) ? -Math.log10(Math.abs(min) + 1) : Math.log10(Math.abs(min) + 1)) : min
        const maxValue = (logScale === true) ? Math.log10(Math.abs(max) + 1) : max
        const scale = height / (maxValue - minValue)
        return scale
    }

    computeYPixelValue(yValue, yScaleFactor) {
        return (this.flipAxis ? (yValue - this.dataRange.min) : (this.dataRange.max - yValue)) * yScaleFactor
    }

    computeYPixelValueInLogScale(yValue, yScaleFactor) {
        let maxValue = this.dataRange.max
        let minValue = this.dataRange.min
        minValue = (minValue < 0) ? -Math.log10(Math.abs(minValue) + 1) : Math.log10(Math.abs(minValue) + 1)
        maxValue = (maxValue < 0) ? -Math.log10(Math.abs(maxValue) + 1) : Math.log10(Math.abs(maxValue) + 1)

        yValue = (yValue < 0) ? -Math.log10(Math.abs(yValue) + 1) : Math.log10(yValue + 1)
        return ((this.flipAxis ? (yValue - minValue) : (maxValue - yValue)) * yScaleFactor)
    }

    draw(options) {

        const features = options.features
        const ctx = options.context
        const bpPerPixel = options.bpPerPixel
        const bpStart = options.bpStart
        const pixelWidth = options.pixelWidth
        const pixelHeight = options.pixelHeight - 1
        const bpEnd = bpStart + pixelWidth * bpPerPixel + 1

        const scaleFactor = this.getScaleFactor(this.dataRange.min, this.dataRange.max, pixelHeight, this.logScale)
        const yScale = (yValue) => this.logScale
            ? this.computeYPixelValueInLogScale(yValue, scaleFactor)
            : this.computeYPixelValue(yValue, scaleFactor)

        if (features && features.length > 0) {

            if (this.dataRange.min === undefined) this.dataRange.min = 0

            // Max can be less than min if config.min is set but max left to autoscale.   If that's the case there is
            // nothing to paint.
            if (this.dataRange.max > this.dataRange.min) {

                let lastPixelEnd = -1
                let lastY
                const y0 = yScale(0)

                for (let f of features) {

                    if (f.end < bpStart) continue
                    if (f.start > bpEnd) break

                    const x = (f.start - bpStart) / bpPerPixel
                    if (Number.isNaN(x)) continue

                    let y = yScale(f.value)

                    const rectEnd = (f.end - bpStart) / bpPerPixel
                    const width = rectEnd - x

                    const color = options.alpha ? IGVColor.addAlpha(this.getColorForFeature(f), options.alpha) : this.getColorForFeature(f)

                    if (this.graphType === "line") {
                        if (lastY !== undefined) {
                            IGVGraphics.strokeLine(ctx, lastPixelEnd, lastY, x, y, {
                                "fillStyle": color,
                                "strokeStyle": color
                            })
                        }
                        IGVGraphics.strokeLine(ctx, x, y, x + width, y, {"fillStyle": color, "strokeStyle": color})
                    } else if (this.graphType === "points") {
                        const pointSize = this.config.pointSize || 3
                        const px = x + width / 2
                        IGVGraphics.fillCircle(ctx, px, y, pointSize / 2, {"fillStyle": color, "strokeStyle": color})

                        if (f.value > this.dataRange.max) {
                            IGVGraphics.fillCircle(ctx, px, pointSize / 2, pointSize / 2, 3, {fillStyle: this.overflowColor})
                        } else if (f.value < this.dataRange.min) {
                            IGVGraphics.fillCircle(ctx, px, pixelHeight - pointSize / 2, pointSize / 2, 3, {fillStyle: this.overflowColor})
                        }


                    } else if (this.graphType === "heatmap") {
                        if (!this._colorScale) {
                            // Create a default color scale.
                            this._colorScale = this.dataRange.min < 0 && this.dataRange.max > 0 ?
                                ColorScaleFactory.defaultDivergingScale(this.dataRange.min, 0, this.dataRange.max) :
                                ColorScaleFactory.defaultGradientScale(this.dataRange.min, this.dataRange.max)
                        }
                        const color = this._colorScale.getColor(f.value)
                        IGVGraphics.fillRect(ctx, x, 0, width, pixelHeight, {fillStyle: color})
                    } else if (this.graphType === "dynseq") {
                        // Dynamic sequence rendering - render bases as glyphs with heights based on wig values
                        this.renderDynSeq(ctx, f, x, width, y, y0, pixelHeight)
                    } else {
                        // Default graph type (bar)
                        const height = Math.min(pixelHeight, y - y0)
                        IGVGraphics.fillRect(ctx, x, y0, width, height, {fillStyle: color})
                        if (f.value > this.dataRange.max) {
                            IGVGraphics.fillRect(ctx, x, 0, width, 3, {fillStyle: this.overflowColor})
                        } else if (f.value < this.dataRange.min) {
                            IGVGraphics.fillRect(ctx, x, pixelHeight - 2, width, 3, {fillStyle: this.overflowColor})
                        }

                    }
                    lastPixelEnd = x + width
                    lastY = y
                }

                // If the track includes negative values draw a baseline
                if (this.dataRange.min < 0) {
                    let maxValue = this.dataRange.max
                    let minValue = this.dataRange.min
                    minValue = (this.logScale === true) ? ((minValue < 0) ? -Math.log10(Math.abs(minValue) + 1) : Math.log10(Math.abs(minValue) + 1)) : minValue
                    maxValue = (this.logScale === true) ? ((maxValue < 0) ? -Math.log10(Math.abs(maxValue) + 1) : Math.log10(Math.abs(maxValue) + 1)) : maxValue
                    const ratio = maxValue / (maxValue - minValue)
                    const basepx = this.flipAxis ? (1 - ratio) * pixelHeight : ratio * pixelHeight
                    IGVGraphics.strokeLine(ctx, 0, basepx, options.pixelWidth, basepx, {strokeStyle: this.baselineColor})
                }
            }
        }

        // Draw guidelines
        if (this.config.hasOwnProperty('guideLines')) {
            for (let line of this.config.guideLines) {
                if (line.hasOwnProperty('color') && line.hasOwnProperty('y') && line.hasOwnProperty('dotted')) {
                    let y = yScale(line.y)
                    let props = {
                        'strokeStyle': line['color'],
                        'strokeWidth': 2
                    }
                    if (line['dotted']) IGVGraphics.dashedLine(options.context, 0, y, options.pixelWidth, y, 5, props)
                    else IGVGraphics.strokeLine(options.context, 0, y, options.pixelWidth, y, props)
                }
            }
        }
    }

    renderDynSeq(ctx, feature, x, width, y, y0, pixelHeight) {
        // Use pre-cached sequence data from the feature
        const sequence = feature.sequence
        
        if (!sequence) {
            // Fall back to regular bar rendering if no sequence data
            const height = Math.min(pixelHeight, y - y0)
            const color = this.getColorForFeature(feature)
            IGVGraphics.fillRect(ctx, x, y0, width, height, {fillStyle: color})
            return
        }
        
        // Calculate rectangle position and height based on the wig value
        const rectY = Math.min(y, y0)
        const rectHeight = Math.max(1, Math.abs(y - y0)) // Ensure minimum height of 1px
        
        // Render each base in the sequence
        const baseWidth = width / sequence.length
        const isNegative = feature.value < 0
        
        for (let i = 0; i < sequence.length; i++) {
            const baseX = x + (i * baseWidth)
            const base = sequence[i].toUpperCase()
            
            // Get nucleotide color from browser's color scheme
            const nucleotideColor = this.browser.nucleotideColors[base] || 'gray'
            
            // Draw the base as a letter-shaped glyph
            this.drawLetterGlyph(ctx, base, baseX, rectY, baseWidth, rectHeight, nucleotideColor, isNegative)
        }
        
        // Draw overflow indicators if needed
        if (feature.value > this.dataRange.max) {
            IGVGraphics.fillRect(ctx, x, 0, width, 3, {fillStyle: this.overflowColor})
        } else if (feature.value < this.dataRange.min) {
            IGVGraphics.fillRect(ctx, x, pixelHeight - 2, width, 3, {fillStyle: this.overflowColor})
        }
    }

    drawLetterGlyph(ctx, base, x, y, width, height, color, flipVertical = false) {
        // Define letter path data as SVG path strings (100x100 coordinate system)
        const letterPaths = {
            'A': {
                main: `M 0 100 L 33 0 L 66 0 L 100 100 L 75 100 L 66 75 L 33 75 L 25 100 L 0 100`,
                overlay: `M 41 55 L 50 25 L 58 55 L 41 55`
            },
            'C': {
                main: `M 100 28 C 100 -13 0 -13 0 50 C 0 113 100 113 100 72 L 75 72 C 75 90 30 90 30 50 C 30 10 75 10 75 28 L 100 28`
            },
            'G': {
                main: `M 100 28 C 100 -13 0 -13 0 50 C 0 113 100 113 100 72 L 100 48 L 55 48 L 55 72 L 75 72 C 75 90 30 90 30 50 C 30 10 75 5 75 28 L 100 28`
            },
            'T': {
                main: `M 0 0 L 0 20 L 35 20 L 35 100 L 65 100 L 65 20 L 100 20 L 100 0 L 0 0`
            },
            'N': {
                main: `M 0 100 L 0 0 L 20 0 L 80 75 L 80 0 L 100 0 L 100 100 L 80 100 L 20 25 L 20 100 L 0 100`
            }
        }

        const pathData = letterPaths[base] || letterPaths['N']
        
        ctx.save()
        ctx.fillStyle = color
        
        // Apply vertical flip transformation if needed
        if (flipVertical) {
            ctx.translate(x + width/2, y + height/2)
            ctx.scale(1, -1)
            ctx.translate(-(x + width/2), -(y + height/2))
        }
        
        // Draw main path
        this.drawSVGPath(ctx, pathData.main, x, y, width, height)
        
        // Draw overlay path (if exists) - typically a cutout or highlight
        if (pathData.overlay) {
            ctx.fillStyle = '#ffffff'
            this.drawSVGPath(ctx, pathData.overlay, x, y, width, height)
        }
        
        ctx.restore()
    }

    drawSVGPath(ctx, pathString, x, y, width, height) {
        // Parse SVG path string and draw it scaled to the given dimensions
        // Path is defined in 100x100 coordinate system
        const scaleX = width / 100
        const scaleY = height / 100
        
        ctx.beginPath()
        
        // Enhanced SVG path parser for M (move), L (line), and C (cubic Bézier curve) commands
        const commands = pathString.match(/[MLC][^MLC]*/g) || []
        
        for (let command of commands) {
            const type = command[0]
            const coords = command.slice(1).trim().split(/[\s,]+/).map(Number)
            
            if (type === 'M') {
                // Move to
                ctx.moveTo(x + coords[0] * scaleX, y + coords[1] * scaleY)
            } else if (type === 'L') {
                // Line to
                ctx.lineTo(x + coords[0] * scaleX, y + coords[1] * scaleY)
            } else if (type === 'C') {
                // Cubic Bézier curve
                // C x1 y1 x2 y2 x y (control point 1, control point 2, end point)
                if (coords.length >= 6) {
                    ctx.bezierCurveTo(
                        x + coords[0] * scaleX, y + coords[1] * scaleY, // control point 1
                        x + coords[2] * scaleX, y + coords[3] * scaleY, // control point 2
                        x + coords[4] * scaleX, y + coords[5] * scaleY  // end point
                    )
                }
            }
        }
        
        ctx.closePath()
        ctx.fill()
    }

    popupData(clickState, features) {

        if (features === undefined) features = this.clickedFeatures(clickState)

        if (features && features.length > 0) {

            const genomicLocation = clickState.genomicLocation
            const popupData = []

            // Sort features based on distance from click
            features.sort(function (a, b) {
                const distA = Math.abs((a.start + a.end) / 2 - genomicLocation)
                const distB = Math.abs((b.start + b.end) / 2 - genomicLocation)
                return distA - distB
            })

            // Display closest 10
            const displayFeatures = features.length > 10 ? features.slice(0, 10) : features

            // Resort in ascending order
            displayFeatures.sort(function (a, b) {
                return a.start - b.start
            })

            for (let selectedFeature of displayFeatures) {
                if (selectedFeature) {
                    if (popupData.length > 0) {
                        popupData.push('<hr/>')
                    }
                    let posString = (selectedFeature.end - selectedFeature.start) === 1 ?
                        StringUtils.numberFormatter(Math.floor(selectedFeature.start) + 1)
                        : StringUtils.numberFormatter(Math.floor(selectedFeature.start) + 1) + "-" + StringUtils.numberFormatter(Math.floor(selectedFeature.end))
                    popupData.push({name: "Position:", value: posString})
                    popupData.push({
                        name: "Value:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;",
                        value: StringUtils.numberFormatter(selectedFeature.value.toFixed(4))
                    })
                }
            }
            if (displayFeatures.length < features.length) {
                popupData.push("<hr/>...")
            }

            return popupData

        } else {
            return []
        }
    }

    /**
     * Return color for feature.
     * @param feature
     * @returns {string}
     */

    getColorForFeature(f) {
        let c = (f.value < 0 && this.altColor) ? this.altColor : this.color || WigTrack.defaultColor
        return (typeof c === "function") ? c(f.value) : c
    }


    getState() {
        const state = super.getState()
        if (this._colorScale) {
            state.colorScale = this._colorScale.toJson()
        }
        return state
    }

    /**
     * Called when the track is removed.  Do any needed cleanup here
     */
    dispose() {
        this.trackView = undefined
    }

}

/**
 * Summarize wig data in bins of size "bpPerPixel" with the given window function.
 *
 * @param features  wig (numeric) data -- features cannot overlap, and are in ascending order by start position
 * @param startBP  bp start position for computing binned data
 * @param bpPerPixel  bp per pixel (bin)
 * @param windowFunction mean, min, or max
 * @returns {*|*[]}
 */
function summarizeData(features, startBP, bpPerPixel, windowFunction = "mean") {

    if (bpPerPixel <= 1 || !features || features.length === 0 || windowFunction === "none") {
        return features
    }

    // Assume features are sorted by position.  Wig features cannot overlap.  Note, UCSC "reductionLevel" == bpPerPixel
    const chr = features[0].chr
    const binSize = bpPerPixel
    const summaryFeatures = []

    const finishBin = (bin) => {
        const start = startBP + bin.bin * binSize
        const end = start + binSize
        let value
        switch (windowFunction) {
            case "mean":
                value = bin.sumData / bin.count
                break
            case "max":
                value = bin.max
                break
            case "min":
                value = bin.min
                break
            default:
                throw Error(`Unknown window function: ${windowFunction}`)
        }
        const description = `${windowFunction} of ${bin.count} values`
        summaryFeatures.push({chr, start, end, value, description})
    }

    let currentBinData
    for (let f of features) {

        // Loop through bins this feature overlaps, updating the weighted sum for each bin or min/max,
        // depending on window function
        let startBin = Math.floor((f.start - startBP) / binSize)
        const endBin = Math.floor((f.end - startBP) / binSize)

        if (currentBinData && startBin === currentBinData.bin) {
            currentBinData.add(f)
            startBin++
        }

        if (!currentBinData || endBin > currentBinData.bin) {

            if (currentBinData) {
                finishBin(currentBinData)
            }

            // Feature stretches across multiple bins.
            if (endBin > startBin) {
                const end = startBP + endBin * binSize
                summaryFeatures.push({chr, start: f.start, end, value: f.value})
            }

            currentBinData = new SummaryBinData(endBin, f)
        }

    }
    if (currentBinData) {
        finishBin(currentBinData)
    }

    // Consolidate
    const c = []
    let lastFeature = summaryFeatures[0]
    for (let f of summaryFeatures) {
        if (lastFeature.value === f.value && f.start <= lastFeature.end) {
            lastFeature.end = f.end
        } else {
            c.push(lastFeature)
            lastFeature = f
        }
    }
    c.push(lastFeature)

    return c

}

class SummaryBinData {
    constructor(bin, feature) {
        this.bin = bin
        this.sumData = feature.value
        this.count = 1
        this.min = feature.value
        this.max = feature.value
    }

    add(feature) {
        this.sumData += feature.value
        this.max = Math.max(feature.value, this.max)
        this.min = Math.min(feature.value, this.min)
        this.count++
    }

    get mean() {
        return this.sumData / this.count
    }
}

export default WigTrack
export {summarizeData}
