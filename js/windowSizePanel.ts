import * as DOMUtils from "./ui/utils/dom-utils.js"
import {prettyBasePairNumber} from './util/igvUtils.js'

class WindowSizePanel {

    container: HTMLElement
    browser: any

    constructor(parent: HTMLElement, browser: any) {

        this.container = DOMUtils.div({class: 'igv-windowsize-panel-container'})
        parent.appendChild(this.container)

        browser.on('locuschange', (referenceFrameList: any[]) => {
            this.updatePanel(referenceFrameList)
        })

        this.browser = browser

    }

    show(): void {
        this.container.style.display = 'block'
    }

    hide(): void {
        this.container.style.display = 'none'
    }

    updatePanel(referenceFrameList: any[]): void {
        const width = this.browser.calculateViewportWidth(this.browser.referenceFrameList.length)
        this.container.innerText = 1 === referenceFrameList.length ? prettyBasePairNumber(Math.round(width * referenceFrameList[0].bpPerPixel)) : ''
    }
}

export default WindowSizePanel
