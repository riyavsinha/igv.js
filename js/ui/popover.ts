import * as Icon from './utils/icons.js'
import * as DOMUtils from "./utils/dom-utils.js"
import makeDraggable from "./utils/draggable.js"
import {createIcon} from "./utils/icons.js"

interface MenuItem {
    init?: () => void
    click?: (e?: Event) => void
    label?: string
    type?: string
    value?: unknown
}

interface MenuElement {
    element: HTMLElement
    init?: () => void
}

class Popover {

    parent: HTMLElement
    popover: HTMLElement
    popoverHeader: HTMLElement
    popoverContent: HTMLElement

    constructor(parent: HTMLElement, isDraggable: boolean, title?: string, closeHandler?: () => void) {

        this.parent = parent;

        this.popover = DOMUtils.div({ class: "igv-ui-popover" })
        parent.appendChild(this.popover)

        this.popoverHeader = DOMUtils.div();
        this.popover.appendChild(this.popoverHeader);

        const titleElement: HTMLElement = DOMUtils.div();
        this.popoverHeader.appendChild(titleElement);
        if (title) {
            titleElement.textContent = title;
        }

        // attach close handler
        const el: HTMLElement = DOMUtils.div()
        this.popoverHeader.appendChild(el)
        el.appendChild(createIcon('times'))
        el.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            e.preventDefault();
            closeHandler ? closeHandler() : this.dismiss()
        })

        if (true === isDraggable) {
            makeDraggable(this.popover, this.popoverHeader, { minX:0, minY:0 })
        }

        this.popoverContent = DOMUtils.div();
        this.popover.appendChild(this.popoverContent);

        this.popover.style.display = 'none'


    }

    configure(menuItems: (string | Node | MenuItem)[]): void {

        if (0 === menuItems.length) {
            return
        }

        const menuElements: MenuElement[] = createMenuElements(menuItems, this.popover)

        for (const { element } of menuElements) {
            this.popoverContent.appendChild(element)
        }

    }

    present(event: MouseEvent): void {

        this.popover.style.display = 'block'

        const parent = this.popover.parentNode as HTMLElement
        const { x, y, width } = DOMUtils.translateMouseCoordinates(event, parent)
        this.popover.style.top  = `${ y }px`

        const { width: w } = this.popover.getBoundingClientRect()

        const xmax = x + w
        const delta = xmax - width

        this.popover.style.left = `${ xmax > width ? (x - delta) : x }px`
        this.popoverContent.style.maxWidth = `${ Math.min(w, width) }px`
    }

    presentContentWithEvent(e: MouseEvent, content: string): void {

        this.popover.style.display = 'block'

        this.popoverContent.innerHTML = content

        present(e, this.popover, this.popoverContent)

    }

    presentMenu(e: MouseEvent, menuItems: (string | Node | MenuItem)[]): void {

        if (0 === menuItems.length) {
            return
        }

        this.popover.style.display = 'block'

        const menuElements: MenuElement[] = createMenuElements(menuItems, this.popover)
        for (let item of menuElements) {
            this.popoverContent.appendChild(item.element)
        }

        present(e, this.popover, this.popoverContent)
    }

    dismiss(): void {
        this.popover.style.display = 'none'
    }

    hide(): void {
        this.popover.style.display = 'none'
        this.dispose()
    }

    dispose(): void {

        if (this.popover) {
            this.popover.parentNode!.removeChild(this.popover);
        }

        const keys = Object.keys(this)
        for (let key of keys) {
            (this as unknown as Record<string, unknown>)[ key ] = undefined
        }
    }

}

function present(e: MouseEvent, popover: HTMLElement, popoverContent: HTMLElement): void {

    const { x, y, width } = DOMUtils.translateMouseCoordinates(e, popover.parentNode as HTMLElement)
    popover.style.top  = `${ y }px`

    const { width: w } = popover.getBoundingClientRect()

    const xmax = x + w
    const delta = xmax - width

    popover.style.left = `${ xmax > width ? (x - delta) : x }px`
    popoverContent.style.maxWidth = `${ Math.min(w, width) }px`


}

function createMenuElements(itemList: (string | Node | MenuItem)[], popover: HTMLElement): MenuElement[] {

    const list: MenuElement[]  = itemList.map(function (item: string | Node | MenuItem, i: number): MenuElement {
        let element: HTMLElement;

        if (typeof item === 'string') {
            element = DOMUtils.div();
            element.innerHTML = item;
        } else if (item instanceof Node) {
            element = item as HTMLElement;
        } else {
            if (typeof item.init === 'function') {
                item.init();
            }

            if ("checkbox" === item.type) {
                element = Icon.createCheckbox("Show all bases", item.value as boolean | undefined);
            }

            else {
                element = DOMUtils.div();
                if (typeof item.label === 'string') {
                    element.innerHTML = item.label;
                }
            }

            if (item.click && "color" !== item.type) {
                element.addEventListener('click', handleClick);
                element.addEventListener('touchend', handleClick);
                element.addEventListener('mouseup', function (e: Event) {
                    e.preventDefault();
                    e.stopPropagation();
                })

                // eslint-disable-next-line no-inner-declarations
                function handleClick(e: Event): void {
                    (item as MenuItem).click!();
                    DOMUtils.hide(popover);
                    e.preventDefault();
                    e.stopPropagation()
                }
            }
        }


        return { element, init: (item as MenuItem).init };
    })

    return list;
}

export { createMenuElements }
export default Popover;
