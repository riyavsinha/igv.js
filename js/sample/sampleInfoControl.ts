import NavbarButton from "../ui/navbarButton.js"
import {sampleInfoImage, sampleInfoImageHover} from "../ui/navbarIcons/sampleInfo.js"
import { buttonLabel } from "../ui/navbarIcons/buttonLabel.js"
import type Browser from "../browser.js"

class SampleInfoControl extends NavbarButton {

    showSampleInfo: boolean;

    constructor(parent: HTMLElement, browser: Browser) {

        super(parent, browser, 'Sample Info', buttonLabel, sampleInfoImage, sampleInfoImageHover, false)

        this.showSampleInfo = false

        this.button.addEventListener('mouseenter', () => {
            if (false === this.showSampleInfo) {
                this.setState(true)
            }
        })

        this.button.addEventListener('mouseleave', () => {
            if (false === this.showSampleInfo) {
                this.setState(false)
            }
        })

        this.button.addEventListener('click', () => {
            this.performClickWithState(browser, undefined)
        })

    }

    performClickWithState(browser: Browser, doShowSampleInfoOrUndefined: boolean | undefined): void {

        this.showSampleInfo = undefined === doShowSampleInfoOrUndefined ? !this.showSampleInfo : doShowSampleInfoOrUndefined

        const column: HTMLElement = browser.columnContainer.querySelector('.igv-sample-info-column')!
        column.style.display = false === this.showSampleInfo ? 'none' : 'flex'

        this.setState(this.showSampleInfo)

        browser.layoutChange()

    }

    setButtonVisibility(isVisible: boolean): void {

        this.showSampleInfo = isVisible

        this.setState(this.showSampleInfo)

        if (true === this.showSampleInfo) {
            this.show()
        } else {
            this.hide()
        }
    }

}

export default SampleInfoControl
