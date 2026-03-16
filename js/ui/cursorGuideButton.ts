import NavbarButton from "./navbarButton.js"
import GenomeUtils from "../genome/genomeUtils"
import {cursorImage, cursorImageHover} from "./navbarIcons/cursor.js"
import { buttonLabel } from "./navbarIcons/buttonLabel.js"
import type Browser from "../browser.js"

class CursorGuideButton extends NavbarButton {

    boundMouseClickHandler: () => void

    constructor(parent: HTMLElement, browser: Browser) {

        super(parent, browser, 'Crosshairs', buttonLabel, cursorImage, cursorImageHover, browser.doShowCursorGuide)

        this.button.addEventListener('mouseenter', () => {
            if (false === browser.doShowCursorGuide) {
                this.setState(true)
            }
        })

        this.button.addEventListener('mouseleave', () => {
            if (false === browser.doShowCursorGuide) {
                this.setState(false)
            }
        })

        const mouseClickHandler = () => {

            // if (false === browser.doShowCursorGuide && GenomeUtils.isWholeGenomeView(browser.referenceFrameList[0].chr)) {
            //     return
            // }

            browser.doShowCursorGuide = !browser.doShowCursorGuide
            browser.setCursorGuideVisibility(browser.doShowCursorGuide)
            this.setState(browser.doShowCursorGuide)

        }

        this.boundMouseClickHandler = mouseClickHandler.bind(this)

        this.button.addEventListener('click', this.boundMouseClickHandler)

        this.setVisibility(browser.config.showCursorTrackingGuideButton as boolean)

    }

}

export default CursorGuideButton
