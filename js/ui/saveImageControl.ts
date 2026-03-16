import NavbarButton from "./navbarButton.js"
import type Browser from "../browser.js"
import Dropdown from "./dropdown.js"
// Icon Button SVG
import { imageSaveImageSVG, imageSaveImageHoverSVG } from './navbarIcons/saveImage.js'
import { buttonLabel } from "./navbarIcons/buttonLabel.js"

class SaveImageControl extends NavbarButton {

    dropdown: Dropdown

    constructor(parent: HTMLElement, browser: Browser) {

        super(parent, browser, 'Save Image', buttonLabel, imageSaveImageSVG, imageSaveImageHoverSVG, false)

        this.button.addEventListener('mouseenter', () => this.setState(true))

        this.button.addEventListener('mouseleave', () => {

            for (const el of this.button.querySelectorAll('div')) {
                if('block' === (el as HTMLElement).style.display) {
                    return
                }
            }

            this.setState(false)
        })

        this.dropdown = new Dropdown(this.button.parentNode as HTMLElement, { top:24, left:-88 })

        const items =
            [
                {
                    label: "Save as SVG",
                    click: () => {
                        this.browser.saveSVGtoFile("igvjs.svg")
                        this.dropdown.dismiss()
                    }
                },
                {
                    label: "Save as PNG",
                    click: () => {
                        this.browser.savePNGtoFile("igvjs.png")
                        this.dropdown.dismiss()
                    }
                },
            ]

        this.dropdown.configure(items)

        this.button.addEventListener('click', (e: MouseEvent) => {

            let takeAction: boolean | undefined
            if (e.target === this.button) {
                takeAction = true
            } else if ((e.target as Element).closest('svg')) {
                const parentDiv = (e.target as Element).closest('div')
                if (parentDiv === this.button) {
                    takeAction = true
                }
            }

            if (true === takeAction) {
                 'none' === this.dropdown.popover.style.display ? this.dropdown.present(e) : this.dropdown.dismiss()
            }

        })

        this.setVisibility(browser.config.showSVGButton as boolean)

    }

    navbarResizeHandler(navbarButtonCSSClass: string): void {
        this.dropdown.dismiss()
        super.navbarResizeHandler(navbarButtonCSSClass)
    }

}

export default SaveImageControl
