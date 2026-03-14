import * as DOMUtils from "../ui/utils/dom-utils.js"
import {appleCrayonRGB} from '../util/colorPalletes.js'
import IGVGraphics from "../igv-canvas.js"
import {drawGroupDividers, GROUP_MARGIN_HEIGHT} from "./sampleUtils.js"

const maxSampleNameViewportWidth: number = 200
const fudgeTextMetricWidth: number = 4
const maxFontSize: number = 10

class SampleNameViewport {

    guid: string
    trackView: any
    browser: any
    viewport: HTMLElement
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    contentTop: number
    hitList: Record<string, string> | undefined
    boundClickHandler: (event: MouseEvent) => void
    boundMouseMoveHandler: (event: MouseEvent) => void

    constructor(trackView: any, column: HTMLElement, unused: any, width: number) {

        this.guid = DOMUtils.guid()
        this.trackView = trackView

        this.browser = trackView.browser

        this.viewport = DOMUtils.div({class: 'igv-viewport'})

        column.appendChild(this.viewport)

        if (trackView.track.height) {
            this.viewport.style.height = `${trackView.track.height}px`
        }

        this.canvas = document.createElement('canvas')
        this.viewport.appendChild(this.canvas)
        this.ctx = this.canvas.getContext("2d")!

        this.contentTop = 0
        this.hitList = undefined

        this.setWidth(width)

        this.addMouseHandlers()
    }

    checkCanvas(): void {

        let width: number = 0
        if (true === this.browser.showSampleNames) {
            width = undefined === this.browser.sampleNameViewportWidth ? 0 : this.browser.sampleNameViewportWidth
        }

        this.ctx.canvas.width = width * window.devicePixelRatio
        this.ctx.canvas.style.width = `${width}px`

        this.ctx.canvas.height = this.viewport.clientHeight * window.devicePixelRatio
        this.ctx.canvas.style.height = `${this.viewport.clientHeight}px`

        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    }

    setTop(contentTop: number): void {

        if (typeof this.trackView.track.getSamples === 'function') {
            this.contentTop = contentTop
            const samples = this.trackView.track.getSamples()
            this.repaint(samples)
        }

    }

    setWidth(width: number): void {
        (this.viewport as any).innerWidth = width
        this.checkCanvas()
    }

    async repaint(samples: any): Promise<void> {

        if (samples.names.length > 0) {
            if (true === this.browser.showSampleNames) {
                this.checkCanvas()
                this.draw({context: this.ctx, samples})

                if (undefined === this.browser.sampleNameViewportWidth) {
                    const lengths: number[] = samples.names.map((name: string) => this.ctx.measureText(name).width)
                    this.browser.sampleNameViewportWidth = Math.min(maxSampleNameViewportWidth, fudgeTextMetricWidth + Math.ceil(Math.max(...lengths)))
                    this.browser.layoutChange()
                }

            }
        }

    }

    draw({context, samples}: {context: CanvasRenderingContext2D, samples: any}): void {

        IGVGraphics.fillRect(context, 0, 0, context.canvas.width, samples.height, { fillStyle: appleCrayonRGB('snow') })

        if (samples && samples.names.length > 0) {

            const viewportHeight: number = this.viewport.getBoundingClientRect().height
            const tileHeight: number = samples.height
            const shim: number = tileHeight - 2 <= 1 ? 0 : 1

            let y: number =  samples.yOffset - this.contentTop

            let rowIndex: number = 0
            this.hitList = {}

            for (const sampleName of samples.names) {

                const x: number = 0
                let yy: number = y + shim
                if (samples.groupIndeces && samples.groups.size > 0) {
                    yy += (samples.groupIndeces[rowIndex] + 1) * GROUP_MARGIN_HEIGHT
                }

                if (yy + tileHeight > 0) {
                    const hh: number = tileHeight - (2 * shim)
                    drawTextInRect(context, sampleName, x + 2, yy, context.canvas.width, hh);
                }

                y += tileHeight
                rowIndex++

                if (y > viewportHeight) {
                    break
                }
            }

            drawGroupDividers(context, 0, context.canvas.width, context.canvas.height,  samples.yOffset - this.contentTop, samples.height, samples.groups)
        }
    }

    renderSVGContext(context: any, {deltaX, deltaY}: {deltaX: number, deltaY: number}): void {

        if (typeof this.trackView.track.getSamples === 'function') {

            const samples = this.trackView.track.getSamples()

            const yScrollDelta: number = 0   // This is not relevant, scrolling is handled in "draw"

            const {width, height} = this.viewport.getBoundingClientRect()

            const str: string = (this.trackView.track.name || this.trackView.track.id).replace(/\W/g, '')
            const id: string = `${str}_sample_names_guid_${DOMUtils.guid()}`

            context.saveWithTranslationAndClipRect(id, deltaX, deltaY + yScrollDelta, width, height, -yScrollDelta)

            this.draw({context, samples})

            context.restore()
        }
    }

    addMouseHandlers(): void {

        this.boundClickHandler = clickHandler.bind(this)
        this.viewport.addEventListener('contextmenu', this.boundClickHandler)

        function clickHandler(this: SampleNameViewport, event: MouseEvent): void {

            event.preventDefault()
            // event.stopPropagation()

            const config =
                {
                    label: 'Name Panel Width',
                    value: this.browser.sampleNameViewportWidth,
                    callback: (newWidth: string) => {
                        this.browser.sampleNameViewportWidth = parseInt(newWidth)
                        // for (let {sampleNameViewport} of this.browser.trackViews) {
                        //     sampleNameViewport.setWidth(this.browser.sampleNameViewportWidth)
                        // }
                        this.browser.layoutChange()
                    }
                }

            this.browser.inputDialog.present(config, event)
        }

        this.boundMouseMoveHandler = mouseMove.bind(this)
        this.viewport.addEventListener('mousemove', this.boundMouseMoveHandler)

        function mouseMove(this: SampleNameViewport, event: MouseEvent): void {
            // event.stopPropagation()

            if (this.hitList) {

                const entries: [string, string][] = Object.entries(this.hitList)

                const {x, y} = DOMUtils.translateMouseCoordinates(event, this.viewport)

                this.viewport.setAttribute('title', '')

                for (const [bbox, value] of entries) {
                    const [xx, yy, width, height] = bbox.split('#').map((str: string) => parseInt(str, 10))
                    if (x < xx || x > xx + width || y < yy || y > yy + height) {
                        // do nothing
                    } else {
                        this.viewport.setAttribute('title', `${value}`)
                        break
                    }
                }
            }
        }

    }

    removeMouseHandlers(): void {
        this.viewport.removeEventListener('contextmenu', this.boundClickHandler)
        this.viewport.removeEventListener('mousemove', this.boundMouseMoveHandler)
    }

    dispose(): void {
        this.removeMouseHandlers()
        this.viewport.remove()
    }

}

function drawTextInRect(context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number): void {

    const pixels: number = Math.min(height, maxFontSize)
    context.font = `${pixels}px sans-serif`
    context.textAlign = 'start'
    context.fillStyle = appleCrayonRGB('lead')

    const textX: number = x

    const metrics: TextMetrics = context.measureText(text)
    const textHeight: number = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    const textY: number = y + height / 2 + textHeight / 2

    context.fillText(text, textX, textY)
}

export default SampleNameViewport
