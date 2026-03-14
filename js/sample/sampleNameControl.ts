import NavbarButton from "../ui/navbarButton.js"
import {sampleNameImage, sampleNameImageHover} from "../ui/navbarIcons/sampleNames.js"
import { sampleNameButtonLabel } from "../ui/navbarIcons/buttonLabel.js"

class SampleNameControl extends NavbarButton {

    [key: string]: any

    constructor(parent: HTMLElement, browser: any) {

        super(parent, browser, 'Sample Names', sampleNameButtonLabel, sampleNameImage, sampleNameImageHover, browser.config.showSampleNames)

        this.button.addEventListener('mouseenter', () => {
            if (false === browser.showSampleNames) {
                this.setState(true)
            }
        })

        this.button.addEventListener('mouseleave', () => {
            if (false === browser.showSampleNames) {
                this.setState(false)
            }
        })

        this.button.addEventListener('click', () => {
            this.performClickWithState(browser, undefined)
        })

        if (true === browser.config.showSampleNameButton) {
            this.show()
        } else {
            this.hide()
        }

    }

    performClickWithState(browser: any, doShowSampleNamesOrUndefined: boolean | undefined): void {

        browser.showSampleNames = undefined === doShowSampleNamesOrUndefined ? !browser.showSampleNames : doShowSampleNamesOrUndefined

        const column: HTMLElement = browser.columnContainer.querySelector('.igv-sample-name-column')
        column.style.display = false === browser.showSampleNames ? 'none' : 'flex'

        this.setState(browser.showSampleNames)

        browser.layoutChange()

    }

}

export default SampleNameControl
