import * as DOMUtils from "../utils/dom-utils.js"
import DOMPurify from "../../../node_modules/dompurify/dist/purify.es.mjs"

interface TextboxOptions {
    value?: string
    label?: string
    onchange?: (value: string) => void
}

class Textbox {

    elem: HTMLElement
    textBox: HTMLInputElement

    constructor({value, label, onchange}: TextboxOptions) {

        this.elem = DOMUtils.div({class: 'igv-ui-generic-dialog-label-input'});

        if(label) {
            const div = DOMUtils.div();
            div.innerHTML = label;
            this.elem.appendChild(div);
        }

        this.textBox = DOMUtils.create('input') as HTMLInputElement;
        if(value) {
            this.textBox.value = DOMPurify.sanitize(value);
        }
        this.elem.appendChild(this.textBox);

        if(onchange) {
            this.textBox.addEventListener('change', (e: Event) => onchange(this.textBox.value))
        }
    }

    get value(): string {
        return this.textBox.value;
    }

    set value(v: string) {
        this.textBox.value = v;
    }
}


export default Textbox
