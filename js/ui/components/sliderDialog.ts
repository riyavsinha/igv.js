import * as UIUtils from "../utils/ui-utils.js"
import * as DOMUtils from "../utils/dom-utils.js"
import makeDraggable from "../utils/draggable.js"
import DOMPurify from "../../../node_modules/dompurify/dist/purify.es.mjs"

class SliderDialog {

    parent: HTMLElement
    container: HTMLElement
    label: HTMLElement
    input_container: HTMLElement
    _input: HTMLInputElement
    _output: HTMLOutputElement
    ok: HTMLElement
    cancel: HTMLElement
    callback: ((value: number) => void) | undefined
    _scaleFactor: number = 1
    _precision: number = 2

    constructor(parent: HTMLElement) {

        this.parent = parent

        // dialog container
        this.container = DOMUtils.div({class: 'igv-ui-generic-dialog-container'})
        parent.appendChild(this.container)

        // dialog header
        const header = DOMUtils.div({class: 'igv-ui-generic-dialog-header'})
        this.container.appendChild(header)

        // dialog label
        this.label = DOMUtils.div({class: 'igv-ui-generic-dialog-one-liner'})
        this.container.appendChild(this.label)
        this.label.textContent = 'Unlabeled'

        // input container
        this.input_container = DOMUtils.div({class: 'igv-ui-generic-dialog-input'})
        this.container.appendChild(this.input_container)

        // input element
        let html: string = `<input type="range" id="igv-slider-dialog-input" name="igv-slider-dialog-input" />`
        this._input = document.createRange().createContextualFragment(html).firstChild as HTMLInputElement
        this.input_container.appendChild(this._input)

        // output element
        html = `<output id="igv-slider-dialog-output" name="igv-slider-dialog-output" for="igv-slider-dialog-input"></output>`
        this._output = document.createRange().createContextualFragment(html).firstChild as HTMLOutputElement
        this.input_container.appendChild(this._output)


        // ok | cancel
        const buttons = DOMUtils.div({class: 'igv-ui-generic-dialog-ok-cancel'})
        this.container.appendChild(buttons)

        // ok
        this.ok = DOMUtils.div()
        buttons.appendChild(this.ok)
        this.ok.textContent = 'OK'

        // cancel
        this.cancel = DOMUtils.div()
        buttons.appendChild(this.cancel)
        this.cancel.textContent = 'Cancel'

        DOMUtils.hide(this.container)

        this._input.addEventListener('input', UIUtils.throttle(() => {
            const number = parseFloat(this._input.value)/this._scaleFactor
            this.callback!(number)
            this._output.value = `${number.toFixed(this._precision)}`
        }, 200))

        this.ok.addEventListener('click', () => {
            if (typeof this.callback === 'function') {
                const number = parseFloat(this._input.value)/this._scaleFactor
                this.callback(number)
                this.callback = undefined
            }
            this._input.value = ''
            DOMUtils.hide(this.container)
        })

        const cancel = (): void => {
            this._input.value = ''
            DOMUtils.hide(this.container)
        }

        this.cancel.addEventListener('click', cancel)

        UIUtils.attachDialogCloseHandlerWithParent(header, cancel)
        makeDraggable(this.container, header)

    }

    get value(): string {
        return DOMPurify.sanitize(this._input.value)
    }

    present(options: {label: string, scaleFactor: number, precision?: number, min: number, max: number, value: number, callback?: (value: number) => void, click?: (value: number) => void, color?: string}, e: MouseEvent): void {

        this.label.textContent = options.label

        this._scaleFactor = options.scaleFactor
        this._precision = options.precision || 2 // added precision option with default value of 2
        const [ minS, maxS, valueS ] = [ options.min, options.max, options.value ].map((number: number) => (Math.floor(this._scaleFactor * number)).toString())

        this._input.min = minS
        this._input.max = maxS
        this._input.value = valueS

        const numer = parseFloat(valueS)
        const denom = this._scaleFactor
        const number = numer/denom
        this._output.value = `${number.toFixed(this._precision)}`

        this.callback = options.callback || options.click

        if(options.color) {
            this._input.style.background = `linear-gradient(to right, #fff, ${options.color})`;
        }

        DOMUtils.show(this.container)
        this.clampLocation(e.clientX, e.clientY)

    }

    clampLocation(clientX: number, clientY: number): void {

        const {width: w, height: h} = this.container.getBoundingClientRect()
        const wh = window.innerHeight
        const ww = window.innerWidth

        const y = Math.min(wh - h, clientY)
        const x = Math.min(ww - w, clientX)
        this.container.style.left = `${x}px`
        this.container.style.top = `${y}px`

    }
}

export default SliderDialog
