import * as DOMUtils from "./ui/utils/dom-utils.js"
import {validateGenomicExtent} from "./util/igvUtils.js"
import GenomeUtils from './genome/genomeUtils.js'
import { ROI_USER_DEFINED_COLOR } from "./roi/ROISet.js"

const RULER_SWEEPER_COLOR = 'rgba(68, 134, 247, 0.25)'

class RulerSweeper {

    rulerViewport: any
    rulerSweeper: HTMLElement
    browser: any
    referenceFrame: any
    isMouseHandlers: boolean | undefined
    boundObserverHandler: (() => void) | undefined
    boundContentMouseDownHandler: ((event: MouseEvent) => void) | undefined
    boundDocumentMouseMoveHandler: ((event: MouseEvent) => void) | undefined
    boundDocumentMouseUpHandler: ((event: MouseEvent) => void) | undefined

    constructor(rulerViewport: any, column: HTMLElement, browser: any, referenceFrame: any) {

        this.rulerViewport = rulerViewport

        this.rulerSweeper = DOMUtils.div({class: 'igv-ruler-sweeper'})
        column.appendChild(this.rulerSweeper)

        this.browser = browser
        this.referenceFrame = referenceFrame

        this.isMouseHandlers = undefined

        this.addBrowserObserver()
    }

    addBrowserObserver(): void {

        const observerHandler = () => {
            if (this.referenceFrame) {
                GenomeUtils.isWholeGenomeView(this.referenceFrame.chr) ? this.removeMouseHandlers() : this.addMouseHandlers()
            }
        }

        // Viewport Content
        this.boundObserverHandler = observerHandler.bind(this)
        this.browser.on('locuschange', this.boundObserverHandler)

    }

    removeBrowserObserver(): void {
        this.browser.off('locuschange', this.boundObserverHandler)
    }

    addMouseHandlers(): void {

        if (true === this.isMouseHandlers) {
            return
        }

        const threshold = 1

        let isMouseDown: boolean | undefined
        let isMouseIn: boolean | undefined
        let mouseDownX: number
        let left: number
        let width: number
        let dx: number

        // Viewport Content
        this.boundContentMouseDownHandler = contentMouseDownHandler.bind(this)
        this.rulerViewport.contentDiv.addEventListener('mousedown', this.boundContentMouseDownHandler)

        function contentMouseDownHandler(this: RulerSweeper, event: MouseEvent): void {

            isMouseDown = true
            isMouseIn = true

            const {x} = DOMUtils.translateMouseCoordinates(event, this.rulerViewport.contentDiv)
            left = mouseDownX = x

            width = threshold


            this.rulerSweeper.style.display = 'block'
            this.rulerSweeper.style.backgroundColor = true === event.shiftKey ? ROI_USER_DEFINED_COLOR : RULER_SWEEPER_COLOR

            this.rulerSweeper.style.left = `${left}px`
            this.rulerSweeper.style.width = `${width}px`

        }

        // Document
        this.boundDocumentMouseMoveHandler = documentMouseMoveHandler.bind(this)
        document.addEventListener('mousemove', this.boundDocumentMouseMoveHandler!)

        function documentMouseMoveHandler(this: RulerSweeper, event: MouseEvent): void {

            let mouseCurrentX: number

            if (isMouseDown && isMouseIn) {

                const {x} = DOMUtils.translateMouseCoordinates(event, this.rulerViewport.contentDiv)
                mouseCurrentX = Math.max(Math.min(x, this.rulerViewport.contentDiv.clientWidth), 0)

                dx = mouseCurrentX - mouseDownX

                width = Math.abs(dx)
                this.rulerSweeper.style.width = `${width}px`

                if (dx < 0) {
                    left = mouseDownX + dx
                    this.rulerSweeper.style.left = `${left}px`
                }

            }

        }

        this.boundDocumentMouseUpHandler = documentMouseUpHandler.bind(this)
        document.addEventListener('mouseup', this.boundDocumentMouseUpHandler!)

        function documentMouseUpHandler(this: RulerSweeper, event: MouseEvent): void {

            let genomicExtent: { start: number; end: number } | undefined

            if (true === isMouseDown && true === isMouseIn) {

                isMouseDown = isMouseIn = undefined

                this.rulerSweeper.style.display = 'none'

                if (width > threshold) {

                    genomicExtent =
                        {
                            start: Math.floor(this.referenceFrame.calculateEnd(left)),
                            end: Math.floor(this.referenceFrame.calculateEnd(left + width)),
                        }


                    const shiftKeyPressed = event.shiftKey

                    if (true === shiftKeyPressed) {
                        this.browser.roiManager.updateUserDefinedROISet(Object.assign({chr: this.referenceFrame.chr}, genomicExtent))
                    } else {

                        validateGenomicExtent(this.browser.genome.getChromosome(this.referenceFrame.chr).bpLength, genomicExtent, this.browser.minimumBases())
                        updateReferenceFrame(this.referenceFrame, genomicExtent, this.rulerViewport.contentDiv.clientWidth)
                        this.browser.updateViews(this.referenceFrame)

                    }

                }

            }

        }

        this.isMouseHandlers = true
    }

    removeMouseHandlers(): void {
        this.rulerViewport.contentDiv.removeEventListener('mousedown', this.boundContentMouseDownHandler)
        document.removeEventListener('mousemove', this.boundDocumentMouseMoveHandler!)
        document.removeEventListener('mouseup', this.boundDocumentMouseUpHandler!)
        this.isMouseHandlers = false
    }

    dispose(): void {
        this.removeBrowserObserver()
        this.removeMouseHandlers()
        this.rulerSweeper.remove()
    }

}

function updateReferenceFrame(referenceFrame: any, genomicExtent: { start: number; end: number }, pixelWidth: number): void {
    referenceFrame.start = Math.round(genomicExtent.start)
    referenceFrame.end = Math.round(genomicExtent.end)
    referenceFrame.bpPerPixel = (referenceFrame.end - referenceFrame.start) / pixelWidth
}

export default RulerSweeper
