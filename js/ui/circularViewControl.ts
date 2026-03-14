import * as DOMUtils from "../ui/utils/dom-utils.js"

class CircularViewControl {

    button: HTMLDivElement
    browser: any

    constructor(parent: HTMLElement, browser: any) {

        this.button = DOMUtils.div({class: 'igv-navbar-button'})
        parent.appendChild(this.button)
        this.button.textContent = 'circular view'

        this.button.addEventListener('click', () => {
            browser.circularViewVisible = !browser.circularViewVisible
        })

        this.browser = browser

        this.setVisibility(browser.config.showCircularViewButton)

        this.setState(browser.circularViewVisible)

    }

    setVisibility(showCircularViewButton: boolean): void {
        if (true === showCircularViewButton) {
            this.show()
        } else {
            this.hide()
        }
    }

    setState(circularViewVisible: boolean): void {
        if (true === circularViewVisible) {
            this.button.classList.add('igv-navbar-button-clicked')
        } else {
            this.button.classList.remove('igv-navbar-button-clicked')
        }
    }

    show(): void {
        this.button.style.display = 'block'
        this.setState(this.browser.circularViewVisible)
    }

    hide(): void {
        this.button.style.display = 'none'
    }
}

export default CircularViewControl
