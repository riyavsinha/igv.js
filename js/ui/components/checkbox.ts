import * as Icon from '../utils/icons.js'
import * as DOMUtils from "../utils/dom-utils.js"

const style = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
}

interface CheckboxOptions {
    selected: boolean
    label?: string
    onchange?: (state: boolean) => void
}

class Checkbox {

    state: boolean
    onchange?: (state: boolean) => void
    elem: HTMLElement
    svg: any

    constructor({selected, label, onchange}: CheckboxOptions) {

        this.state = selected;
        this.onchange = onchange;
        this.elem = DOMUtils.div({style: style});

        const svgDiv = DOMUtils.div({
            style: {
                width: '14px',
                height: '14px',
                borderColor: 'gray',
                borderWidth: '1px',
                borderStyle: 'solid'
            }
        })
        this.svg = Icon.createIcon('check', (true === selected ? '#444' : 'transparent'));
        this.svg.style.width = '12px';
        this.svg.style.height = '12px';
        svgDiv.appendChild(this.svg);
        this.elem.appendChild(svgDiv);

        if (label) {
            const d = DOMUtils.div({style: {marginLeft: '5px'}});
            d.textContent = label
            this.elem.appendChild(d);
        }

        const handleClick = (e: Event): void => {
            e.preventDefault();
            e.stopPropagation();
            const newState = !this.state;
            this.selected = newState;
            if (typeof this.onchange === 'function') {
                this.onchange(newState);
            }
        }
        this.elem.addEventListener('click', handleClick);
        this.elem.addEventListener('touchend', handleClick);
    }

    set selected(selected: boolean) {
        this.state = selected;
        const p = this.svg.querySelector('path');
        p.setAttributeNS(null, 'fill', (true === selected ? '#444' : 'transparent'));
    }

    get selected(): boolean {
        return this.state;
    }

}

export default Checkbox;
