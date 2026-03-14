import * as UIUtils from "../utils/ui-utils.js"
import * as DOMUtils from "../utils/dom-utils.js"
import makeDraggable from "../utils/draggable.js"

interface GenericContainerOptions {
    parent: HTMLElement
    top?: number
    left?: number
    width?: number
    height?: number
    border?: string
    closeHandler?: () => void
}

class GenericContainer {

    container: HTMLElement

    constructor({parent,  top, left, width, height, border, closeHandler}: GenericContainerOptions) {

        const container = DOMUtils.div({class: 'igv-ui-generic-container'});
        parent.appendChild(container);

        this.container = container;

        if (width !== undefined) {
            this.container.style.width = `${ width }px`
        }
        if (height !== undefined) {
            this.container.style.height = `${ height }px`
        }
        if(border) {
            this.container.style.border = border;
        }

        // header
        const header = DOMUtils.div();
        this.container.appendChild(header);

        // close button
        UIUtils.attachDialogCloseHandlerWithParent(header, () => {
            if(typeof closeHandler === "function") {
                closeHandler();
            }
            this.hide()
        });

        makeDraggable(this.container, header);

        this.hide()
    }

    show(): void {
        this.container.style.display = 'flex'
    }

    hide(): void {
        this.container.style.display = 'none'
    }

    dispose(): void {
        if(this.container.parentElement)  {
            this.container.parentElement.removeChild(this.container);
        }
    }
}

export default GenericContainer;
