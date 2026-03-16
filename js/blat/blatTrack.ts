import FeatureTrack from "../feature/featureTrack.js"
import TrackBase from "../trackBase.js"
import BlatTable from "./blatTable.js"
import {blat} from "./blatClient.js"
import StaticFeatureSource from "../feature/staticFeatureSource.js"
import type Browser from "../browser.js"
import type {TrackConfig} from "../types/config"
import type {GenomicFeature} from "../types/feature"

const maxSequenceSize = 25000
//const blatServer = "https://genome.ucsc.edu/cgi-bin/hgBlat"
const defaultBlatServer = "https://igv.org/services/blatUCSC.php"
//const blatServer = "http://localhost:8000/blatUCSC.php"

class BlatTrack extends FeatureTrack {
    // Dynamic property access — intentional any for TrackBase config merging
    [key: string]: any

    constructor(config: TrackConfig, browser: Browser) {
        super(config, browser)
        if (!this.name) {
            this.name = 'Blat Results'
        }
        this.sequence = config.sequence
        this.table = undefined

        // On initial creation features are fetched before track construction
        if(config.features) {
            this._features = config.features
            this.featureSource = new StaticFeatureSource({features: config.features as GenomicFeature[]}, this.browser.genome)
            delete config.features
        }
    }

    async postInit() {
        if(!this.featureSource) {
            // This will be the case when restoring from a session
            const db = this.browser.genome.ucscID   // TODO -- blat specific property
            const url = this.browser.config["blatServerURL"] as string
            const features = await blat({url, userSeq: this.sequence, db})
            this._features = features;
            this.featureSource = new StaticFeatureSource({features: features as GenomicFeature[]}, this.browser.genome)
        }

        this._initialColor = this.color || (this.constructor as typeof TrackBase).defaultColor
        this._initialAltColor = this.altColor || (this.constructor as typeof TrackBase).defaultColor

        return this
    }

    openTableView() {

        if (undefined === this.table) {

            const rows = this._features.map((f: Record<string, unknown>) => [
                this.browser.genome.getChromosomeDisplayName(f.chr as string),
                ((f.start as number) + 1),
                f.end,
                f.strand,
                f.score,
                f.matches,
                f.misMatches,
                f.repMatches,
                f.nCount,
                f.qNumInsert,
                f.qBaseInsert,
                f.tNumInsert,
                f.tBaseInsert
            ])

            const config =
                {
                    browser: this.browser,
                    parent: this.browser.columnContainer,
                    headerTitle: this.config.title as string,
                    description: this.sequence as string,
                    dismissHandler: () => {
                        this.table.dismiss()
                        this.table.dispose()
                        this.table = undefined
                    },
                    columnFormat: BlatTable.getColumnFormatConfiguration(),
                    gotoButtonHandler: BlatTable.gotoButtonHandler
                }

            this.table = new BlatTable(config)
            this.table.renderTable(rows)
        }

        this.table.present()

    }

    menuItemList() {

        const menuItems = super.menuItemList()

        menuItems.push('<hr/>')

        const self = this
        const element = document.createElement('div')
        element.textContent = 'Open table view'
        menuItems.push({ element, click() { self.openTableView() } })

        return menuItems
    }


    /**
     * Track has been permanently removed.  Release resources and other cleanup
     */
    dispose() {
        super.dispose()
        // Release DOM element for table
        if (this.table) {
            this.table.popover.parentElement.removeChild(this.table.popover)
        }
    }
}


async function createBlatTrack({sequence, browser, name, title}: { sequence: string, browser: Browser, name?: string, title?: string }): Promise<void> {

    if (sequence.length > maxSequenceSize) {
        browser.alert.present(`Sequence size exceeds maximum allowed length (${sequence.length} > ${maxSequenceSize})`)
        return
    }

    try {

        const db = browser.genome.ucscID   // TODO -- blat specific property
        const url = (browser.config["blatServerURL"] as string) || defaultBlatServer
        const features = await blat({url, userSeq: sequence, db})

        const trackConfig = {
            type: 'blat',
            name: name || 'blat results',
            title: title || 'blat results',
            sequence: sequence,
            altColor: 'rgb(176, 176, 236)',
            color: 'rgb(236, 176, 176)',
            searchable: false,
            features
        }

        const track = (await browser.loadTrackList([trackConfig as TrackConfig]))[0]
        if (track) track.openTableView()

    } catch (e) {
        browser.alert.present(`Error performing blat search:  ${e}`)
    }

}

export default BlatTrack
export {createBlatTrack, maxSequenceSize}
