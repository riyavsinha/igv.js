import {createIcon} from "./utils/icons.js"
import * as DOMUtils from "./utils/dom-utils.js"

const sliderMin: number = 0
let sliderMax: number = 23
let sliderValueRaw: number = 0

class ZoomWidget {

    browser: any
    zoomContainer: HTMLDivElement
    zoomOutButton: HTMLDivElement
    slider: HTMLInputElement
    zoomInButton: HTMLDivElement

    constructor(config: any, browser: any, parent: HTMLElement) {

        this.browser = browser

        this.zoomContainer = DOMUtils.div({class: 'igv-zoom-widget'})
        parent.appendChild(this.zoomContainer)

        // zoom out
        this.zoomOutButton = DOMUtils.div()
        this.zoomContainer.appendChild(this.zoomOutButton)
        this.zoomOutButton.appendChild(createIcon('minus-circle'))
        this.zoomOutButton.addEventListener('click', () => {
            browser.zoomOut()
        })

        // Range slider
        const el: HTMLDivElement = DOMUtils.div()
        this.zoomContainer.appendChild(el)
        this.slider = document.createElement('input')
        this.slider.type = 'range'

        this.slider.min = `${sliderMin}`
        this.slider.max = `${sliderMax}`

        el.appendChild(this.slider)

        this.slider.addEventListener('change', (e: Event) => {

            e.preventDefault()
            e.stopPropagation()

            const target = e.target as HTMLInputElement
            const referenceFrame = browser.referenceFrameList[0]
            const {bpLength} = referenceFrame.genome.getChromosome(referenceFrame.chr)
            const {end, start} = referenceFrame

            const extent = end - start

            const scaleFactor = Math.pow(2, target.valueAsNumber)

            const zoomedExtent = bpLength / scaleFactor

            browser.zoomWithScaleFactor(zoomedExtent / extent)

        })

        // zoom in
        this.zoomInButton = DOMUtils.div()
        this.zoomContainer.appendChild(this.zoomInButton)
        this.zoomInButton.appendChild(createIcon('plus-circle'))
        this.zoomInButton.addEventListener('click', () => {
            browser.zoomIn()
        })

        browser.on('locuschange', (referenceFrameList: any[]) => {

            if (this.browser.isMultiLocusMode()) {
                this.disable()
            } else {
                this.enable()
                this.update(referenceFrameList)
            }

        })

    }

    update(referenceFrameList: any[]): void {

        if (this.slider) {
            const referenceFrame = referenceFrameList[0]
            const {bpLength} = referenceFrame.genome.getChromosome(referenceFrame.chr)
            const {start, end} = referenceFrame

            sliderMax = Math.ceil(Math.log2(bpLength / this.browser.minimumBases()))
            this.slider.max = `${sliderMax}`

            const scaleFactor = bpLength / (end - start)
            sliderValueRaw = Math.log2(scaleFactor)
            this.slider.value = `${Math.round(sliderValueRaw)}`
        }
    }


    enable(): void {

        if (this.slider) this.slider.disabled = false
    }

    disable(): void {

        if (this.slider) this.slider.disabled = true
    }

    hide(): void {
        this.zoomContainer.style.display = 'none'
    }

    show(): void {
        this.zoomContainer.style.display = 'block'
    }

    hideSlider(): void {
        if (this.slider) this.slider.style.display = 'none'
    }

    showSlider(): void {
        if (this.slider) this.slider.style.display = 'block'
    }
}

export default ZoomWidget
