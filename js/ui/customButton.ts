import * as DOMUtils from "../ui/utils/dom-utils.js"

const CustomButton = function (parent: HTMLElement, browser: any, b: { label: string; callback: (browser: any) => void }): void {

    const button = DOMUtils.div({class: 'igv-navbar-button'})
    parent.appendChild(button)
    button.textContent = b.label
    button.addEventListener('click', () => b.callback(browser))
}

export default CustomButton
