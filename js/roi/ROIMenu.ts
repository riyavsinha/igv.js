import * as DOMUtils from "../ui/utils/dom-utils.js"
import * as UIUtils from "../ui/utils/ui-utils.js"
import {isSecureContext} from "../util/igvUtils.js"
import {createBlatTrack} from "../blat/blatTrack.js"
import type Browser from "../browser.js"
import type ROISet from "./ROISet.js"
import type ROIManager from "./ROIManager.js"
import type {GenomicFeature} from "../types/feature.js"
import type {MenuItem} from "../types/ui.js"
import type {Track} from "../types/ui.js"

const maxSequenceSize = 1000000
const maxBlatSize = 25000

class ROIMenu {

    browser: Browser
    container: HTMLElement
    body: HTMLElement

    constructor(browser: Browser, parent: HTMLElement) {

        this.browser = browser

        // container
        this.container = DOMUtils.div({class: 'igv-roi-menu'})
        parent.appendChild(this.container)

        // header
        const header = DOMUtils.div()
        this.container.appendChild(header)

        UIUtils.attachDialogCloseHandlerWithParent(header, () => this.container.style.display = 'none')

        // body
        this.body = DOMUtils.div()
        this.container.appendChild(this.body)

        this.container.style.display = 'none'
    }

    async present(feature: GenomicFeature, roiSet: ROISet, event: MouseEvent, roiManager: ROIManager, columnContainer: HTMLElement, regionElement: HTMLElement): Promise<void> {
        const menuItems = this.menuItems(feature, roiSet, event, roiManager, columnContainer, regionElement)
        this.browser.menuPopup.presentTrackContextMenu(event, menuItems)
    }

    menuItems(feature: GenomicFeature, roiSet: ROISet, event: MouseEvent, roiManager: ROIManager, columnContainer: HTMLElement, regionElement: HTMLElement): (string | MenuItem)[] {
        const items: (string | MenuItem)[] = feature.name ? [`<b>${feature.name}</b><br/>`]  : []
        if ('name' in roiSet) items.push(`<b>ROI Set: ${roiSet.name}</b>`)
        if (items.length > 0) items.push(`<hr/>`)

        if (roiSet.isUserDefined) {
            this.#addDescriptionMenuItem(items, feature, event)
        }

        // sequence

        // copy
        if (isSecureContext() && feature.end - feature.start < maxSequenceSize) {
            this.#addCopySequenceMenuItem(items, feature)
        }

        if (feature.end - feature.start <= maxBlatSize) {
            this.#addBlatMenuItem(items, feature)
        }

        // Add sort menu items  -- disabled for now, its not clear what this means for tracks in general
        this.#addSortMenuItems(items, feature)


        if (roiSet.isUserDefined) {

            this.#addDeleteMenuItem(items, feature, roiSet, roiManager, columnContainer, regionElement)
        }

        return items
    }

    #addDeleteMenuItem(items: (string | MenuItem)[], feature: GenomicFeature, roiSet: ROISet, roiManager: ROIManager, columnContainer: HTMLElement, regionElement: HTMLElement): void {

        items.push('<hr/>')
        items.push(
            {
                label: 'Delete',
                click: async () => {
                    roiSet.removeFeature(feature)

                    roiManager.browser.fireEvent('roiremoved', [{
                        chr: feature.chr,
                        start: feature.start,
                        end: feature.end,
                        name: feature.name
                    }])

                    const userDefinedFeatures = await roiSet.getAllFeatures()

                    // Delete user defined ROI Set if it is empty
                    if (Object.keys(userDefinedFeatures).length === 0) {
                        roiManager.deleteUserDefinedROISet()
                    }
                    roiManager.deleteRegionWithKey(regionElement.dataset.region!, columnContainer)
                    roiManager.repaintTable()
                }
            }
        )
    }

    #addCopySequenceMenuItem(items: (string | MenuItem)[], feature: GenomicFeature): void {
        items.push({
            label: 'Copy reference sequence',
            click: async () => {
                this.container.style.display = 'none'
                let sequence = await this.browser.genome.getSequence(feature.chr, feature.start, feature.end)
                if (!sequence) {
                    sequence = "Unknown sequence"
                }
                try {
                    await navigator.clipboard.writeText(sequence)
                } catch (e: unknown) {
                    console.error(e)
                    this.browser.alert.present(`Failed to copy the sequence to the clipboard. (${(e as Error).message})`)
                }
            }
        })
    }

    #addDescriptionMenuItem(items: (string | MenuItem)[], feature: GenomicFeature, event: MouseEvent): void {
        items.push(
            {
                label: 'Set description ...',
                click: () => {
                    const callback = () => {
                        const value = this.browser.inputDialog.value || ''
                        feature.name = value.trim()
                        this.browser.roiManager.repaintTable()
                    }
                    const config = {
                        label: 'Description',
                        value: (feature.name || ''),
                        callback
                    }

                    this.browser.inputDialog.present(config, event)
                }
            }
        )
    }

    #addSortMenuItems(items: (string | MenuItem)[], feature: GenomicFeature): void {

        const found = this.browser.findTracks((track: Track) => typeof track.sortByValue === 'function')
        if (found.length > 0) {

            items.push(`<hr/>`)

            const { chr, start, end } = feature
            items.push({
                    label: 'Sort by value (ascending)',
                    click: () => Promise.all(found.map((track: Track) => track.sortByValue({ option: 'VALUE', direction: 'ASC', chr, start, end })))
                })

            items.push('<hr style="border: none; height: 1px; background-color: white; margin-top: 1px; margin-bottom: 1px;" />')

            items.push({
                    label: 'Sort by value (descending)',
                    click: () => Promise.all(found.map((track: Track) => track.sortByValue({ option: 'VALUE', direction: 'DESC', chr, start, end })))
                })
        }
    }



    #addBlatMenuItem(items: (string | MenuItem)[], feature: GenomicFeature): void {
        items.push({
            label: 'BLAT reference sequence',
            click: async () => {
                this.container.style.display = 'none'
                const {chr, start, end} = feature
                let sequence = await this.browser.genome.getSequence(chr, start, end)
                if (sequence) {
                    const name = `blat: ${chr}:${start + 1}-${end}`
                    const title = `blat: ${chr}:${start + 1}-${end}`
                    createBlatTrack({sequence, browser: this.browser, name, title})
                }
            }
        })
    }

    dispose(): void {
        this.container.innerHTML = ''
    }

}

export default ROIMenu
