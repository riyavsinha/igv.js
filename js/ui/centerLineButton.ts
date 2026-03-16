import NavbarButton from "./navbarButton.js"
import {centerlineImage, centerlineImageHover} from "./navbarIcons/centerline.js"
import { buttonLabel } from "./navbarIcons/buttonLabel.js"
import type Browser from "../browser.js"

class CenterLineButton extends NavbarButton {

    boundMouseClickHandler: () => void

    constructor(parent: HTMLElement, browser: Browser) {

        super(parent, browser, 'Center Line', buttonLabel, centerlineImage, centerlineImageHover, browser.config.showCenterGuide)

        this.button.addEventListener('mouseenter', () => {
            if (false === browser.doShowCenterLine) {
                this.setState(true)
            }
        })

        this.button.addEventListener('mouseleave', () => {
            if (false === browser.doShowCenterLine) {
                this.setState(false)
            }
        })

        const mouseClickHandler = (): void => {

            browser.doShowCenterLine = !browser.doShowCenterLine
            browser.setCenterLineVisibility(browser.doShowCenterLine)
            this.setState(browser.doShowCenterLine)
        }

        this.boundMouseClickHandler = mouseClickHandler.bind(this)

        this.button.addEventListener('click', this.boundMouseClickHandler)

        this.setVisibility(browser.config.showCenterGuideButton as boolean)

    }

}

export default CenterLineButton
