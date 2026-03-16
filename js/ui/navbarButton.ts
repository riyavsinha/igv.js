import * as DOMUtils from "../ui/utils/dom-utils.js"
import type Browser from "../browser.js"

class NavbarButton {

    browser: Browser
    button: HTMLDivElement
    textContent: string
    title: string
    buttonLabel: string
    imageDictionary: { image: string; imageHover: string }
    responsiveKey: string
    groupElement: Element | undefined
    doHover: boolean | undefined

    constructor(parent: HTMLElement, browser: Browser, title: string | string[], buttonLabel: string, imageSVG: string, imageHoverSVG: string, initialButtonState: boolean | undefined) {

        this.browser = browser

        this.button = DOMUtils.div({class: 'igv-navbar-text-button'})
        parent.appendChild(this.button)

        if (Array.isArray(title)) {
            this.textContent = title[ 0 ]
            this.title = title[ 1 ]
        } else {
            this.textContent = this.title = title
        }

        this.buttonLabel = buttonLabel

        this.imageDictionary =
            {
                image: `url("data:image/svg+xml,${ encodeURIComponent(imageSVG) }")`,
                imageHover: `url("data:image/svg+xml,${ encodeURIComponent(imageHoverSVG) }")`,
            }

        this.responsiveKey = 'text'

        this.configureButton(this.textContent, this.title)

        this.setState(initialButtonState)

        browser.on('navbar-resize', (navbarButtonCSSClass: unknown) => {
            this.navbarResizeHandler(navbarButtonCSSClass as string)
        })

    }

    navbarResizeHandler(navbarButtonCSSClass: string): void {
        const key = 'igv-navbar-icon-button' === navbarButtonCSSClass ? 'image' : 'text'
        if (key !== this.responsiveKey) {
            this.responsiveKey = key
            this.configureButton(this.textContent, this.title)
            this.setState(undefined)
        }
    }

    configureButton(textContent: string, title: string): void {

        this.groupElement = undefined
        this.button.title = title
        this.button.innerHTML = ''
        this.button.style.backgroundImage = 'none'
        this.button.classList.remove('igv-navbar-icon-button')
        this.button.classList.remove('igv-navbar-text-button')

        'text' === this.responsiveKey ? this.configureTextButton(textContent) : this.configureIconButton()

    }

    configureTextButton(textContent: string): void {

        this.button.classList.add('igv-navbar-text-button')

        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = this.buttonLabel
        const svgRoot = tempDiv.firstChild as Element
        this.button.appendChild(svgRoot)

        this.groupElement = svgRoot.querySelector('#igv-navbar-button-group')!

        const tspanElement = svgRoot.querySelector('#igv-navbar-button-label') as Element
        tspanElement.textContent = textContent
    }

    configureIconButton(): void {
        this.button.classList.add('igv-navbar-icon-button')
    }

    setState(doHover: boolean | undefined): void {

        if (undefined !== doHover) {
            this.doHover = doHover
        }

        'text' === this.responsiveKey ? this.setTextButtonState(this.doHover) : this.setIconButtonState(this.doHover)

    }

    setTextButtonState(doHover: boolean | undefined): void {
        this.groupElement!.classList.remove(...this.groupElement!.classList)
        const className = true === doHover ? 'igv-navbar-text-button-svg-hover' : 'igv-navbar-text-button-svg-inactive'
        this.groupElement!.classList.add(className)
    }

    setIconButtonState(doHover: boolean | undefined): void {
        this.button.style.backgroundImage = true === doHover ? this.imageDictionary.imageHover : this.imageDictionary.image
    }

    show(): void {
        this.button.style.display = ''
    }

    hide(): void {
        this.button.style.display = 'none'
    }

    setVisibility(isVisible: boolean): void {
        if (true === isVisible) {
            this.show()
        } else {
            this.hide()
        }
    }
}

export default NavbarButton
