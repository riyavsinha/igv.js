import * as DOMUtils from "../utils/dom-utils.js"

/**
 * Generic container for UI components
 */
class Panel {
    elem: HTMLElement
    html: HTMLElement | undefined

    constructor() {
        this.elem = DOMUtils.create('div', { class: 'igv-ui-panel-column' })
    }

    add(component: Node | {elem: Element} | string): void {

        if(component instanceof Node) {
            this.elem.appendChild(component);
        }
        else if(typeof component === 'object') {
            this.elem.appendChild((component as {elem: Element}).elem);
        }
        else {
            // Assuming a string, possibly html
            const wrapper = DOMUtils.div();
            wrapper.innerHTML = component;
            this.elem.appendChild(wrapper);
            this.html = wrapper
        }
    }


}


export default Panel
