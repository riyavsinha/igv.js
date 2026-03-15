
import type Browser from "../browser.js"
import * as DOMUtils from "../ui/utils/dom-utils.js"

class CursorGuide {

    browser: Browser
    columnContainer: HTMLElement
    horizontalGuide: HTMLElement
    verticalGuide: HTMLElement
    boundMouseMoveHandler!: (event: MouseEvent) => void
    customMouseHandler: ((data: { start: number; bp: number; end: number; interpolant: number }) => void) | undefined

    constructor(columnContainer: HTMLElement, browser: Browser) {
        this.browser = browser
        this.columnContainer = columnContainer

        this.horizontalGuide = DOMUtils.div({class: 'igv-cursor-guide-horizontal'})
        columnContainer.appendChild(this.horizontalGuide)

        this.verticalGuide = DOMUtils.div({class: 'igv-cursor-guide-vertical'})
        columnContainer.appendChild(this.verticalGuide)

        this.addMouseHandler(browser)

        this.setVisibility(browser.config.showCursorGuide ?? false)

    }

    addMouseHandler(browser: Browser): void {

        this.boundMouseMoveHandler = mouseMoveHandler.bind(this)
        this.columnContainer.addEventListener('mousemove', this.boundMouseMoveHandler)

        function mouseMoveHandler(this: CursorGuide, event: MouseEvent): void {

            const tag = (event.target as HTMLElement).tagName

            const {x, y} = DOMUtils.translateMouseCoordinates(event, this.columnContainer)
            this.horizontalGuide.style.top = `${y}px`

            if ('CANVAS' === (event.target as HTMLElement).tagName) {

                const viewport = findAncestorOfClass(event.target as HTMLElement, 'igv-viewport')

                if (viewport && browser.getRulerTrackView()) {

                    this.verticalGuide.style.left = `${x}px`

                    const columns = browser.root.querySelectorAll('.igv-column')
                    let index: number | undefined = undefined
                    const viewportParent = viewport.parentElement
                    for (let i = 0; i < columns.length; i++) {
                        if (undefined === index && viewportParent === columns[i]) {
                            index = i
                        }
                    }

                    if (!(undefined === index)) {

                        const rulerViewport = browser.getRulerTrackView()!.viewports[index]
                        const result = rulerViewport.mouseMove(event)

                        if (result) {

                            const {start, bp, end} = result
                            const interpolant = (bp - start) / (end - start)

                            if (this.customMouseHandler) {
                                this.customMouseHandler({start, bp, end, interpolant})
                            }
                        } // if (result)

                    } // if (index)

                } // if (viewport && browser.getRulerTrackView())

            } // if ('CANVAS' === event.target.tagName) {

        }
    }

    removeMouseHandler(): void {
        this.columnContainer.removeEventListener('mousemove', this.boundMouseMoveHandler)
    }

    setVisibility(showCursorGuide: boolean): void {
        if (true === showCursorGuide) {
            this.show()
        } else {
            this.hide()
        }
    }

    show(): void {
        this.verticalGuide.style.display = 'block'
        this.horizontalGuide.style.display = 'block'

    }

    hide(): void {

        this.verticalGuide.style.display = 'none'
        this.horizontalGuide.style.display = 'none'

        const rulerTrackView = this.browser.getRulerTrackView()
        if (rulerTrackView) {
            for (let viewport of rulerTrackView.viewports) {
                viewport.tooltip.style.display = 'none'
            }
        }

    }

}

function findAncestorOfClass(target: HTMLElement, classname: string): HTMLElement | undefined {

    while (target.parentElement) {
        if (target.parentElement.classList.contains(classname)) {
            return target.parentElement
        } else {
            target = target.parentElement
        }
    }
    return undefined

}


export default CursorGuide
