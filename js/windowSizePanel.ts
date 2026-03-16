import * as DOMUtils from "./ui/utils/dom-utils.js"
import {prettyBasePairNumber} from './util/igvUtils.js'
import type Browser from "./browser.js"
import type ReferenceFrame from "./referenceFrame.js"

class WindowSizePanel {

    container: HTMLElement
    browser: Browser

    constructor(parent: HTMLElement, browser: Browser) {

        this.container = DOMUtils.div({class: 'igv-windowsize-panel-container'})
        parent.appendChild(this.container)

        browser.on('locuschange', ((referenceFrameList: ReferenceFrame[]) => {
            this.updatePanel(referenceFrameList)
        }) as (...args: unknown[]) => unknown)

        this.browser = browser

    }

    show(): void {
        this.container.style.display = 'block'
    }

    hide(): void {
        this.container.style.display = 'none'
    }

    updatePanel(referenceFrameList: ReferenceFrame[]): void {
        const width = this.browser.calculateViewportWidth(this.browser.referenceFrameList.length)
        this.container.innerText = 1 === referenceFrameList.length ? prettyBasePairNumber(Math.round(width * referenceFrameList[0].bpPerPixel)) : ''
    }
}

export default WindowSizePanel
