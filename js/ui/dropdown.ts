import {createMenuElements} from "./popover.js"
import * as DOMUtils from "./utils/dom-utils.js"

interface Shim {
    left: number
    top: number
}

class Dropdown {

    parent: HTMLElement
    popover: HTMLElement
    popoverContent: HTMLElement
    shim: Shim

    constructor(parent: HTMLElement, shim: Shim) {

        this.parent = parent;

        // popover
        this.popover = DOMUtils.div({ class: "igv-ui-dropdown" })
        parent.appendChild(this.popover)

        // content
        this.popoverContent = DOMUtils.div();
        this.popover.appendChild(this.popoverContent);

        this.popover.style.display = 'none'

        this.shim = shim
    }

    configure(dropdownItems: (string | Node | {init?: () => void, click?: (e?: Event) => void, label?: string, type?: string, value?: unknown})[]): void {

        if (0 === dropdownItems.length) {
            return
        }

        const menuElements = createMenuElements(dropdownItems, this.popover)

        for (const { element } of menuElements) {
            this.popoverContent.appendChild(element)
        }

    }

    present(event: MouseEvent): void {
        this.popover.style.display = 'block'

        let { x, y } = DOMUtils.translateMouseCoordinates(event, this.parent)

        // this.popover.style.left  = `${ x }px`
        // this.popover.style.top  = `${ y }px`

        this.popover.style.left  = `${ x + this.shim.left }px`
        this.popover.style.top  = `${ y + this.shim.top }px`
    }

    _present(event: MouseEvent): void {

        this.popover.style.display = 'block'

        let { x, y, width } = DOMUtils.translateMouseCoordinates(event, this.parent)

        x += this.shim.left
        y += this.shim.top

        this.popover.style.top  = `${ y }px`

        const { width: w } = this.popover.getBoundingClientRect()

        const xmax = x + w
        const delta = xmax - width

        this.popover.style.left = `${ xmax > width ? (x - delta) : x }px`

        // this.popoverContent.style.maxWidth = `${ Math.min(w, width) }px`
    }

    dismiss(): void {
        this.popover.style.display = 'none'
    }
}

export default Dropdown
