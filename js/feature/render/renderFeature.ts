import IGVGraphics from "../../igv-canvas.js"
import {getCodingStart, getCodingEnd, getExonPhase} from "../exonUtils"
import {translationDict} from "../../util/translationDict"
import {complementSequence} from "../../util/sequenceUtils"

const aminoAcidSequenceRenderThreshold: number = 0.25

interface FeatureCoordinates {
    px: number
    px1: number
    pw: number
}

interface Exon {
    start: number
    end: number
    utr?: boolean
    cdStart?: number
    cdEnd?: number
    readingFrame?: number
}

interface Feature {
    start: number
    end: number
    strand?: string
    row?: number
    exons?: Exon[]
    name?: string
    gene?: { name: string }
    id?: string
    ID?: string
    [key: string]: any
}

interface SequenceInterval {
    hasSequence(start: number, end: number): boolean
    getSequence(start: number, end: number): string
}

interface RenderOptions {
    pixelWidth: number
    bpPerPixel: number
    sequenceInterval?: SequenceInterval
    drawLabel?: boolean
    referenceFrame?: any
    pixelXOffset?: number
    viewportWidth?: number
    labelAllFeatures?: boolean
    rowLastLabelX: Record<number, number>
}

interface LabelTransform {
    rotate?: { angle: number }
}

interface AminoAcidResult {
    triplet: string
    aminoAcidLetter: string
}

interface AminoAcidLetters {
    left: AminoAcidResult | undefined
    rite: AminoAcidResult | undefined
}

interface Remainder {
    start: number
    end: number
}

/**
 * @param feature
 * @param bpStart  genomic location of the left edge of the current canvas
 * @param xScale  scale in base-pairs per pixel
 * @returns {{px: number, px1: number, pw: number, h: number, py: number}}
 */
function calculateFeatureCoordinates(feature: Feature, bpStart: number, xScale: number): FeatureCoordinates {
    let px: number = (feature.start - bpStart) / xScale
    let px1: number = (feature.end - bpStart) / xScale
    //px = Math.round((feature.start - bpStart) / xScale),
    //px1 = Math.round((feature.end - bpStart) / xScale),
    let pw: number = px1 - px

    if (pw < 3) {
        pw = 3
        px -= 1.5
    }

    return {
        px: px,
        px1: px1,
        pw: pw
    }
}

/**
 *
 * @param feature
 * @param bpStart  genomic location of the left edge of the current canvas
 * @param xScale  scale in base-pairs per pixel
 * @param pixelHeight  pixel height of the current canvas
 * @param ctx  the canvas 2d context
 * @param options  genomic state
 */
function renderFeature(this: any, feature: Feature, bpStart: number, xScale: number, pixelHeight: number, ctx: CanvasRenderingContext2D, options: RenderOptions): void {

    try {
        ctx.save()

        // Set ctx color to a known valid color.  If getColorForFeature returns an invalid color string it is ignored, and
        // this default will be used.
        ctx.fillStyle = this.color
        ctx.strokeStyle = this.color

        const color: string = this.getColorForFeature(feature)
        // const color = '+' === feature.strand ? 'rgba(135,206,235,0.5)' : 'rgba(255,20,147,0.5)'

        ctx.fillStyle = color
        ctx.strokeStyle = color

        let h: number
        let py: number
        if (this.displayMode === "SQUISHED" && feature.row !== undefined) {
            h = this.featureHeight / 2
            py = this.margin + this.squishedRowHeight * feature.row
        } else if (this.displayMode === "EXPANDED" && feature.row !== undefined) {
            h = this.featureHeight
            py = this.margin + this.expandedRowHeight * feature.row
        } else {  // collapsed
            h = this.featureHeight
            py = this.margin
        }

        const pixelWidth: number = options.pixelWidth   // typical 3*viewportWidth

        const cy: number = py + h / 2
        const h2: number = h / 2
        const py2: number = cy - h2 / 2

        const exonCount: number = feature.exons ? feature.exons.length : 0
        const coord: FeatureCoordinates = calculateFeatureCoordinates(feature, bpStart, xScale)
        const step: number = this.arrowSpacing
        const direction: number = feature.strand === '+' ? 1 : feature.strand === '-' ? -1 : 0

        if (exonCount === 0) {
            // single-exon transcript
            const xLeft: number = Math.max(0, coord.px)
            const xRight: number = Math.min(pixelWidth, coord.px1)
            const width: number = xRight - xLeft

            ctx.fillRect(xLeft, py, width, h)

            if (direction !== 0) {
                ctx.fillStyle = "white"
                ctx.strokeStyle = "white"
                for (let x = xLeft + step / 2; x < xRight; x += step) {
                    // draw arrowheads along central line indicating transcribed orientation
                    IGVGraphics.strokeLine(ctx, x - direction * 2, cy - 2, x, cy)
                    IGVGraphics.strokeLine(ctx, x - direction * 2, cy + 2, x, cy)
                }
                ctx.fillStyle = color
                ctx.strokeStyle = color
            }
        } else {

            // multi-exon transcript
            IGVGraphics.strokeLine(ctx, coord.px + 1, cy, coord.px1 - 1, cy) // center line for introns
            const xLeft: number = Math.max(0, coord.px) + step / 2
            const xRight: number = Math.min(pixelWidth, coord.px1)
            for (let x = xLeft; x < xRight; x += step) {
                // draw arrowheads along central line indicating transcribed orientation
                IGVGraphics.strokeLine(ctx, x - direction * 2, cy - 2, x, cy)
                IGVGraphics.strokeLine(ctx, x - direction * 2, cy + 2, x, cy)
            }

            for (let i = 0; i < feature.exons.length; i++) {

                const exon: Exon = feature.exons[i]

                // draw the exons
                let ePx: number = Math.round((exon.start - bpStart) / xScale)
                let ePx1: number = Math.round((exon.end - bpStart) / xScale)
                let ePw: number = Math.max(1, ePx1 - ePx)
                let ePxU: number

                if (ePx + ePw < 0) {
                    continue  // Off the left edge
                }
                if (ePx > pixelWidth) {
                    break // Off the right edge
                }

                if (exon.utr) {
                    ctx.fillRect(ePx, py2, ePw, h2) // Entire exon is UTR
                } else {
                    if (exon.cdStart) {
                        ePxU = Math.round((exon.cdStart - bpStart) / xScale)
                        ctx.fillRect(ePx, py2, ePxU - ePx, h2) // start is UTR
                        ePw -= (ePxU - ePx)
                        ePx = ePxU
                    }
                    if (exon.cdEnd) {
                        ePxU = Math.round((exon.cdEnd - bpStart) / xScale)
                        ctx.fillRect(ePxU, py2, ePx1 - ePxU, h2) // start is UTR
                        ePw -= (ePx1 - ePxU)
                        ePx1 = ePxU
                    }

                    ePw = Math.max(ePw, 1)

                    ctx.fillRect(ePx, py, ePw, h)

                    if (exon.readingFrame !== undefined) {

                        if (options.bpPerPixel < aminoAcidSequenceRenderThreshold &&
                            options.sequenceInterval) {

                            const leftExon: Exon | undefined = i > 0 && feature.exons[i - 1].readingFrame !== undefined ? feature.exons[i - 1] : undefined
                            const riteExon: Exon | undefined = i < feature.exons.length - 1 && feature.exons[i + 1].readingFrame !== undefined ? feature.exons[i + 1] : undefined

                            renderAminoAcidSequence.call(this, ctx, feature.strand, leftExon, exon, riteExon, bpStart, options.bpPerPixel, py, h, options.sequenceInterval)
                        }
                    }

                    // Arrows
                    if (ePw > step + 5 && direction !== 0 && options.bpPerPixel > aminoAcidSequenceRenderThreshold) {
                        ctx.fillStyle = "white"
                        ctx.strokeStyle = "white"
                        for (let x = ePx + step / 2; x < ePx1; x += step) {
                            // draw arrowheads along central line indicating transcribed orientation
                            IGVGraphics.strokeLine(ctx, x - direction * 2, cy - 2, x, cy)
                            IGVGraphics.strokeLine(ctx, x - direction * 2, cy + 2, x, cy)
                        }
                        ctx.fillStyle = color
                        ctx.strokeStyle = color

                    }
                }
            }
        }

        if (options.drawLabel && this.displayMode !== "SQUISHED") {
            renderFeatureLabel.call(this, ctx, feature, coord.px, coord.px1, py, options.referenceFrame, options)
        }
    } finally {
        ctx.restore()
    }
}

function renderAminoAcidSequence(this: any, ctx: CanvasRenderingContext2D, strand: string | undefined, leftExon: Exon | undefined, exon: Exon, riteExon: Exon | undefined, bpStart: number, bpPerPixel: number, y: number, height: number, sequenceInterval: SequenceInterval): void {

    const aaColors: string[] =
        [
            'rgb(124,124,204)',
            'rgb(12, 12, 120)'
        ]


    ctx.save()

    const renderAminoAcidLetter = (strand: string | undefined, width: number, xs: number, y: number, aminoAcidLetter: string): void => {

        if ('STOP' === aminoAcidLetter) {
            aminoAcidLetter = '*'
        }

        const aminoAcidLetterWidth: number = ctx.measureText(aminoAcidLetter).width
        IGVGraphics.fillText(ctx, aminoAcidLetter, xs + (width - aminoAcidLetterWidth) / 2, y - 4, {fillStyle: '#ffffff'})
    }

    const doPaint = (strand: string | undefined, start: number, end: number, aminoAcidLetter: string | undefined, colorToggle: number, index: number | undefined): Remainder | undefined => {

        const xs: number = Math.round((start - bpStart) / bpPerPixel)
        const xe: number = Math.round((end - bpStart) / bpPerPixel)

        const width: number = xe - xs

        let aaLetter: string | undefined
        if (undefined === aminoAcidLetter) {

            if (sequenceInterval.hasSequence(start, end)) {

                const sequence: string = sequenceInterval.getSequence(start, end)
                if (sequence && 3 === sequence.length) {
                    const key: string = '+' === strand ? sequence : complementSequence(sequence.split('').reverse().join(''))
                    aaLetter = (translationDict as Record<string, string>)[key]
                }
            }

        } else {
            aaLetter = aminoAcidLetter
        }

        if ('M' === aminoAcidLetter) {
            ctx.fillStyle = '#83f902'
        } else if ('M' === aaLetter && 0 === index) {
            ctx.fillStyle = '#83f902'
        } else if ('STOP' === aaLetter) {
            ctx.fillStyle = '#ff2101'
        } else {
            ctx.fillStyle = aaColors[colorToggle]
        }

        ctx.fillRect(xs, y, width, height)

        if (aaLetter) {
            ctx.save()
            renderAminoAcidLetter(strand, width, xs, y + height, aaLetter)
            ctx.restore()
        }

        const widthBP: number = end - start
        return widthBP > 0 && widthBP < 3 ? {start, end} : undefined
    }

    const phase: number = getExonPhase(exon)
    let ss: number = getCodingStart(exon)
    let ee: number = getCodingEnd(exon)

    let bpTripletStart: number
    let bpTripletEnd: number

    let remainder: Remainder | undefined
    let aminoAcidBackdropColorCounter: number = 1
    let colorToggle: number
    let index: number
    if ('+' === strand) {

        if (phase > 0) {
            ss += phase
        }

        aminoAcidBackdropColorCounter = 1
        for (index = 0, bpTripletStart = ss; bpTripletStart < ee; index++, bpTripletStart += 3) {
            colorToggle = aminoAcidBackdropColorCounter % 2
            bpTripletEnd = Math.min(ee, bpTripletStart + 3)
            remainder = doPaint(strand, bpTripletStart, bpTripletEnd, undefined, aminoAcidBackdropColorCounter % 2, index)
            ++aminoAcidBackdropColorCounter
        }

        if (phase > 0 || remainder) {

            const result: AminoAcidLetters | undefined = phase > 0
                ? getAminoAcidLetterWithExonGap.call(this, strand, phase, ss - phase, ss, remainder, leftExon, exon, riteExon, sequenceInterval)
                : getAminoAcidLetterWithExonGap.call(this, strand, undefined, undefined, undefined, remainder, leftExon, exon, riteExon, sequenceInterval)

            if (result) {
                const {left, rite} = result

                if (left) {
                    doPaint(strand, ss - phase, ss, left.aminoAcidLetter, 0, undefined)
                }

                if (rite) {
                    doPaint(strand, remainder!.start, remainder!.end, rite.aminoAcidLetter, colorToggle!, undefined)
                }

            }

        }

    } else {

        if (phase > 0) {
            ee -= phase
        }

        aminoAcidBackdropColorCounter = 1
        index = 0
        for (index = 0, bpTripletEnd = ee; bpTripletEnd > ss; index++, bpTripletEnd -= 3) {
            colorToggle = aminoAcidBackdropColorCounter % 2
            bpTripletStart = Math.max(ss, bpTripletEnd - 3)
            remainder = doPaint(strand, bpTripletStart, bpTripletEnd, undefined, aminoAcidBackdropColorCounter % 2, index)
            ++aminoAcidBackdropColorCounter
        }

        if (phase > 0 || remainder) {

            const result: AminoAcidLetters | undefined = phase > 0
                ? getAminoAcidLetterWithExonGap.call(this, strand, phase, ee, ee + phase, remainder, leftExon, exon, riteExon, sequenceInterval)
                : getAminoAcidLetterWithExonGap.call(this, strand, undefined, undefined, undefined, remainder, leftExon, exon, riteExon, sequenceInterval)

            if (result) {
                const {left, rite} = result

                if (rite) {
                    doPaint(strand, ee, ee + phase, rite.aminoAcidLetter, 0, undefined)
                }

                if (left) {
                    doPaint(strand, remainder!.start, remainder!.end, left.aminoAcidLetter, colorToggle!, undefined)
                }

            }

        }

    }

    ctx.restore()
}

/**
 * @param ctx       the canvas 2d context
 * @param feature
 * @param featureX  feature start in pixel coordinates
 * @param featureX1 feature end in pixel coordinates
 * @param featureY  feature y-coordinate
 * @param referenceFrame  genomic state
 * @param options  options
 */
function renderFeatureLabel(this: any, ctx: CanvasRenderingContext2D, feature: Feature, featureX: number, featureX1: number, featureY: number, referenceFrame: any, options: RenderOptions): void {

    try {
        ctx.save()

        const labelField: string = this.config.labelField ? this.config.labelField : 'name'
        let name: string | undefined = feature[labelField]
        if (name === undefined && feature.gene) name = feature.gene.name
        if (name === undefined) name = feature.id || feature.ID
        if (!name || name === '.') return

        let pixelXOffset: number = options.pixelXOffset || 0
        const t1: number = Math.max(featureX, -pixelXOffset)
        const t2: number = Math.min(featureX1, -pixelXOffset + options.viewportWidth!)
        let centerX: number = (t1 + t2) / 2
        //let centerX = (featureX + featureX1) / 2

        let transform: LabelTransform | undefined
        if (this.displayMode === "COLLAPSED" && this.labelDisplayMode === "SLANT") {
            transform = {rotate: {angle: 45}}
        }
        const labelY: number = getFeatureLabelY(featureY, transform)

        let color: string = this.getColorForFeature(feature)
        let selected: boolean = this.browser.qtlSelections.hasPhenotype(feature.name)

        const geneFontStyle: { textAlign: string | undefined; fillStyle: string; strokeStyle: string } = {
            textAlign: "SLANT" === this.labelDisplayMode ? undefined : 'center',
            fillStyle: color,
            strokeStyle: color
        }

        const textMetrics: TextMetrics = ctx.measureText(name)
        const xleft: number = centerX - textMetrics.width / 2
        const xright: number = centerX + textMetrics.width / 2
        const lastLabelX: number = options.rowLastLabelX[feature.row!] || -Number.MAX_SAFE_INTEGER
        if (options.labelAllFeatures || xleft > lastLabelX || selected) {
            options.rowLastLabelX[feature.row!] = xright

            ctx.clearRect(
                centerX - textMetrics.width / 2 - 1,
                labelY - textMetrics.actualBoundingBoxAscent - 1,
                textMetrics.width + 2,
                textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent + 2)
            IGVGraphics.fillText(ctx, name, centerX, labelY, geneFontStyle, transform)

        }

    } finally {
        ctx.restore()
    }
}

function getFeatureLabelY(featureY: number, transform: LabelTransform | undefined): number {
    return transform ? featureY + 20 : featureY + 25
}

function getAminoAcidLetterWithExonGap(this: any, strand: string | undefined, phase: number | undefined, phaseExtentStart: number | undefined, phaseExtentEnd: number | undefined, remainder: Remainder | undefined, leftExon: Exon | undefined, exon: Exon, riteExon: Exon | undefined, sequenceInterval: SequenceInterval): AminoAcidLetters | undefined {

    let ss: number
    let ee: number
    let stringA: string = ''
    let stringB: string = ''
    let triplet: string = ''

    const aminoAcidLetters: AminoAcidLetters = {left: undefined, rite: undefined}
    if ('+' === strand) {

        if (phase) {
            stringB = sequenceInterval.getSequence(phaseExtentStart!, phaseExtentEnd!)

            if (!stringB) {
                return undefined
            }

            [ss, ee] = [getCodingEnd(leftExon!) - (3 - phase), getCodingEnd(leftExon!)]
            stringA = sequenceInterval.getSequence(ss, ee)

            if (!stringA) {
                return undefined
            }

            triplet = stringA + stringB
            aminoAcidLetters.left = {triplet, aminoAcidLetter: (translationDict as Record<string, string>)[triplet]}
        }

        if (remainder) {

            if (!riteExon) {
                return undefined
            }

            stringA = sequenceInterval.getSequence(remainder.start, remainder.end)

            if (!stringA) {
                return undefined
            }

            const ritePhase: number = getExonPhase(riteExon!)
            const riteStart: number = getCodingStart(riteExon!)
            stringB = sequenceInterval.getSequence(riteStart, riteStart + ritePhase)

            if (!stringB) {
                return undefined
            }

            triplet = stringA + stringB
            aminoAcidLetters.rite = {triplet, aminoAcidLetter: (translationDict as Record<string, string>)[triplet]}
        }

    } else {

        if (phase) {
            stringA = sequenceInterval.getSequence(phaseExtentStart!, phaseExtentEnd!)

            if (!stringA) {
                return undefined
            }

            [ss, ee] = [getCodingStart(riteExon!), getCodingStart(riteExon!) + (3 - phase)]
            stringB = sequenceInterval.getSequence(ss, ee)

            if (!stringB) {
                return undefined
            }

            triplet = stringA + stringB
            triplet = complementSequence(triplet.split('').reverse().join(''))
            aminoAcidLetters.rite = {triplet, aminoAcidLetter: (translationDict as Record<string, string>)[triplet]}
        }

        if (remainder) {
            stringB = sequenceInterval.getSequence(remainder.start, remainder.end)

            if (!stringB) {
                return undefined
            }

            const leftPhase: number = getExonPhase(leftExon!)
            const leftEnd: number = getCodingEnd(leftExon!)
            stringA = sequenceInterval.getSequence(leftEnd - leftPhase, leftEnd)

            if (!stringA) {
                return undefined
            }

            triplet = stringA + stringB
            triplet = complementSequence(triplet.split('').reverse().join(''))
            aminoAcidLetters.left = {triplet, aminoAcidLetter: (translationDict as Record<string, string>)[triplet]}
        }
    }

    return aminoAcidLetters
}


// exon

export {aminoAcidSequenceRenderThreshold, calculateFeatureCoordinates, renderFeature}

