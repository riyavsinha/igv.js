import * as DOMUtils from "../utils/dom-utils.js"
import Picker from "../../../node_modules/vanilla-picker/dist/vanilla-picker.csp.mjs"
import GenericContainer from './genericContainer.js'
import {genericColorPickerPalette} from "../../util/colorPalletes.js"

class GenericColorPicker extends GenericContainer {

    static maxRecentColors: number = 10

    colorSwatchContainer: HTMLElement
    moreColorsContainer: HTMLElement
    recentColorsSwatches: HTMLElement
    recentColors: string[]
    moreColorsPresentationColor: string | undefined

    constructor({parent, width}: { parent: HTMLElement; width?: number }) {
        super({parent, width, border: '1px solid gray'})

        this.container.classList.add('igv-ui-colorpicker-container')

        // nth-child(2) - Color Swatches
        this.colorSwatchContainer = DOMUtils.div()
        this.container.appendChild(this.colorSwatchContainer)

        // nth-child(3) - More Colors interative color picker
        this.moreColorsContainer = DOMUtils.div()
        this.container.appendChild(this.moreColorsContainer)

        // nth-child(4) - Recent Colors - swatches
        this.recentColorsSwatches = DOMUtils.div()
        this.container.appendChild(this.recentColorsSwatches)

        this.recentColors = []

        this.moreColorsPresentationColor = undefined

    }

    configure(initialTrackColor: string, colorHandler: (color: string) => void, moreColorsPresentationColor: string): void {

        this.moreColorsPresentationColor = moreColorsPresentationColor

        this.colorSwatchContainer.innerHTML = ''

        this.recentColorsSwatches.innerHTML = ''

        // Populate ColorSwatches
        const hexColorStrings = Object.values(genericColorPickerPalette)
        for (const hexColorString of hexColorStrings) {
            const swatch = DOMUtils.div({class: 'igv-ui-color-swatch'})
            this.colorSwatchContainer.appendChild(swatch)
            this.decorateSwatch(swatch, hexColorString, colorHandler)
        }

        // Populate Previous Colors
        if (this.recentColors.length > 0) {
            for (const hexColorString of this.recentColors) {
                const swatch = DOMUtils.div({class: 'igv-ui-color-swatch'})
                this.recentColorsSwatches.appendChild(swatch)
                this.decorateSwatch(swatch, hexColorString, colorHandler)
            }
        }

        // Present MoreColors picker
        this.decorateMoreColorsButton(this.moreColorsContainer, colorHandler)

    }

    decorateSwatch(swatch: HTMLElement, hexColorString: string, colorHandler: (color: string) => void): void {

        swatch.style.backgroundColor = hexColorString

        swatch.addEventListener('click', (event: Event) => {
            event.stopPropagation()
            colorHandler(hexColorString)
            this.moreColorsPresentationColor = hexColorString
        })

        swatch.addEventListener('touchend', (event: Event) => {
            event.stopPropagation()
            colorHandler(hexColorString)
            this.moreColorsPresentationColor = hexColorString
        })

    }

    decorateMoreColorsButton(moreColorsContainer: HTMLElement, colorHandler: (color: string) => void): void {

        moreColorsContainer.innerText = 'More Colors ...'

        moreColorsContainer.addEventListener('click', (event: Event) => {
            event.stopPropagation()
            this.createAndPresentMoreColorsPicker(moreColorsContainer, (hexColorString: string) => colorHandler(hexColorString))
        })

    }

    updateRecentColorsSwatches(colorHandler: (color: string) => void): void {
        this.recentColorsSwatches.innerHTML = ''
        for (const hexColorString of this.recentColors) {
            const swatch = DOMUtils.div({class: 'igv-ui-color-swatch'})
            this.recentColorsSwatches.appendChild(swatch)
            this.decorateSwatch(swatch, hexColorString, colorHandler)
        }
    }

    createAndPresentMoreColorsPicker(moreColorsContainer: HTMLElement, colorHandler: (color: string) => void): void {

        let picker: InstanceType<typeof Picker>

        moreColorsContainer.innerHTML = ''
        moreColorsContainer.innerText = 'More Colors ...'

        const colorPickerContainer = document.createElement('div')
        colorPickerContainer.style.position = 'absolute'
        moreColorsContainer.appendChild(colorPickerContainer)

        const {width, height} = moreColorsContainer.getBoundingClientRect()
        colorPickerContainer.style.right = `${0}px`
        colorPickerContainer.style.top = `${0}px`
        colorPickerContainer.style.width = `${width}px`
        colorPickerContainer.style.height = `${height}px`

        colorPickerContainer.addEventListener('click', (event: Event) => {
            event.stopPropagation()
        })


        picker = new Picker()

        const config =
            {
                parent: colorPickerContainer,
                popup: 'top',
                editor: false,
                editorFormat: 'rgb',
                alpha: false,
                color: this.moreColorsPresentationColor,
            }

        picker.setOptions(config)

        picker.setColor(this.moreColorsPresentationColor!, true)

        picker.onOpen = () => {
            console.log(`picker - onOpen`)
        }
        picker.onChange = (color: {rgba: string}) => moreColorsContainer.style.backgroundColor = color.rgba

        picker.onDone = (color: {hex: string}) => {

            // Remove alpha from hex color string
            const hexColorString = color.hex.substring(0, 7)

            this.recentColors.unshift(hexColorString)

            const src = this.recentColors.slice(0)
            this.recentColors = [...new Set(src)].slice(0, GenericColorPicker.maxRecentColors)

            colorHandler(hexColorString)

            this.updateRecentColorsSwatches(colorHandler)

            this.moreColorsPresentationColor = hexColorString

            picker.destroy()
            colorPickerContainer.remove()
        }

        picker.show()
    }

    present(event: MouseEvent): void {

        // Make the dialog visible to measure its dimensions
        this.show()

        const {clientX, clientY} = event
        const {offsetWidth: containerWidth, offsetHeight: containerHeight} = this.container
        const {innerHeight: windowHeight} = window
        const windowWidth = document.documentElement.clientWidth

        const padding = 10

        // Calculate initial centered position
        let left = clientX - (containerWidth / 2)
        let top = clientY

        // Clamp horizontal position to viewport
        const minLeft = padding
        const maxLeft = windowWidth - containerWidth - padding
        left = Math.max(minLeft, Math.min(left, maxLeft))

        // Clamp vertical position to viewport
        const minTop = padding
        const maxTop = windowHeight - containerHeight - padding
        top = Math.max(minTop, Math.min(top, maxTop))

        this.container.style.left = `${left}px`
        this.container.style.top = `${top}px`
    }

}

export default GenericColorPicker
