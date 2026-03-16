import type Browser from "../browser.js"
import * as DOMUtils from "./utils/dom-utils.js"
import {createIcon} from "./utils/icons.js"
import makeDraggable from "./utils/draggable.js"

interface RegionTableConfig {
    browser: Browser
    parent: HTMLElement
    headerTitle: string
    dismissHandler: () => void
    columnFormat: {label: string, width: string}[]
    width?: string
    gotoButtonHandler: (event: Event) => void
}

class RegionTableBase {

    config: RegionTableConfig
    browser: Browser
    columnFormat: {label: string, width: string}[]
    tableRowSelectionList: number[]
    tableDOM: HTMLElement
    gotoButton!: HTMLElement
    boundDismissHandler!: (event: MouseEvent) => void
    boundGotoButtonHandler!: (event: Event) => void
    _headerDOM!: HTMLElement
    _tableColumnTitlesDOM!: HTMLElement
    _tableRowContainerDOM!: HTMLElement
    _footerDOM!: HTMLElement

    constructor(config: RegionTableConfig) {

        this.config = config

        this.browser = config.browser

        this.columnFormat = config.columnFormat

        this.tableRowSelectionList = []

        this.tableDOM = DOMUtils.div({ class: 'igv-roi-table' })

        if(config.width) {
            const [ wStr ] = config.width.split('px')
            const w = parseInt(wStr, 10)
            this.tableDOM.style.width = `${Math.min(w, 1600)}px`
        }

        config.parent.appendChild(this.tableDOM)

        this.headerDOM = config

        this.tableColumnTitles = this.tableDOM

        this.tableRowContainer = this.tableDOM

        this.footerDOM = config.gotoButtonHandler

    }

    set headerDOM({ browser, parent, headerTitle, dismissHandler }: { browser: Browser; parent: HTMLElement; headerTitle: string; dismissHandler: () => void }) {

        // header
        const dom = DOMUtils.div()
        this.tableDOM.appendChild(dom)

        // header title
        const div = DOMUtils.div()
        dom.appendChild(div)
        div.innerHTML = headerTitle

        // table dismiss button
        const dismiss = DOMUtils.div()
        dom.appendChild(dismiss)
        dismiss.appendChild(createIcon('times'))

        this.boundDismissHandler = mouseClickHandler.bind(this)

        dismiss.addEventListener('click', this.boundDismissHandler)

        function mouseClickHandler (this: RegionTableBase, event: MouseEvent): void {
            event.stopPropagation()
            dismissHandler()
        }

        const { y:y_root } = browser.root.getBoundingClientRect()
        const { y:y_parent } = parent.getBoundingClientRect()
        const constraint = -(y_parent - y_root)
        makeDraggable(this.tableDOM, dom, { minX:0, minY:constraint })

        this.tableDOM.style.display = 'none'

        this._headerDOM = dom

    }

    set tableColumnTitles(tableDOM: HTMLElement) {

        const tblColumnTitles = DOMUtils.div({ class: 'igv-roi-table-column-titles' })
        tableDOM.appendChild(tblColumnTitles)

        for (const { label, width } of this.columnFormat) {
            const col = DOMUtils.div()
            tblColumnTitles.appendChild(col)
            col.style.width = width
            col.innerText = label
        }

        this._tableColumnTitlesDOM = tblColumnTitles

    }

    get tableColumnTitles(): HTMLElement {
        return this._tableColumnTitlesDOM
    }

    set tableRowContainer(container: HTMLElement) {

        const tblRowContainer = DOMUtils.div({ class: 'igv-roi-table-row-container' })
        container.appendChild(tblRowContainer)

        this._tableRowContainerDOM = tblRowContainer

    }

    get tableRowContainer(): HTMLElement {
        return this._tableRowContainerDOM
    }

    set footerDOM(gotoButtonHandler: (event: Event) => void) {

        const dom = DOMUtils.div()
        this.tableDOM.appendChild(dom)

        // Go To Button
        const gotoButton = DOMUtils.div({class: 'igv-roi-table-button'})
        dom.appendChild(gotoButton)

        gotoButton.id = 'igv-roi-table-view-button'
        gotoButton.textContent = 'Go To'
        gotoButton.style.pointerEvents = 'none'

        this._footerDOM = dom

        this.gotoButton = gotoButton

        this.boundGotoButtonHandler = gotoButtonHandler.bind(this)

        this.gotoButton.addEventListener('click', this.boundGotoButtonHandler)

    }

    tableRowDOMHelper(dom: HTMLElement): void {

        dom.addEventListener('mousedown', event => {
            event.stopPropagation()

            dom.classList.toggle('igv-roi-table-row-selected')
            dom.classList.contains('igv-roi-table-row-selected') ? dom.classList.remove('igv-roi-table-row-hover') : dom.classList.add('igv-roi-table-row-hover')

            this.setTableRowSelectionState(dom.classList.contains('igv-roi-table-row-selected'))
        })

        dom.addEventListener('mouseover', e => {
            dom.classList.contains('igv-roi-table-row-selected') ? dom.classList.remove('igv-roi-table-row-hover') : dom.classList.add('igv-roi-table-row-hover')
        })

        dom.addEventListener('mouseout', e => {
            dom.classList.remove('igv-roi-table-row-hover')
        })

    }

    clearTable(): void {
        const elements = this.tableRowContainer.querySelectorAll('.igv-roi-table-row')
        for (let el of elements) {
            el.remove()
        }
    }

    setTableRowSelectionState(isTableRowSelected: boolean): void {
        isTableRowSelected ? this.tableRowSelectionList.push(1) : this.tableRowSelectionList.pop()
        this.gotoButton.style.pointerEvents = this.tableRowSelectionList.length > 0 ? 'auto' : 'none'
    }

    present(): void {
        this.tableDOM.style.left = `${ 0 }px`

        const { y:y_root } = this.browser.root.getBoundingClientRect()
        const { y:y_parent } = this.config.parent.getBoundingClientRect()

        this.tableDOM.style.top  = `${ y_root - y_parent }px`
        this.tableDOM.style.display = 'flex'
    }

    dismiss(): void {
        this.tableDOM.style.display = 'none'
    }

    isVisible(): boolean {
        return this.tableDOM.style.display !== 'none'
    }

    dispose(): void {

        this.tableDOM.innerHTML = ''
        this.tableDOM.remove()

        for (const key of Object.keys(this)) {
            (this as unknown as Record<string, unknown>)[key] = undefined
        }

        document.removeEventListener('click', this.boundDismissHandler)

    }

}

export default RegionTableBase
