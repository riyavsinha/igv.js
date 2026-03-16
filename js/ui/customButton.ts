import * as DOMUtils from "../ui/utils/dom-utils.js"
import type Browser from "../browser.js"

const CustomButton = function (parent: HTMLElement, browser: Browser, b: { label: string; callback: (browser: Browser) => void }): void {

    const button = DOMUtils.div({class: 'igv-navbar-button'})
    parent.appendChild(button)
    button.textContent = b.label
    button.addEventListener('click', () => b.callback(browser))
}

export default CustomButton
