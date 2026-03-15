import BamSource from "./bamSource.js"
import TrackBase from "../trackBase.js"
import IGVGraphics from "../igv-canvas.js"
import {createCheckbox} from "../igv-icons.js"
import {PaletteColorTable} from "../util/colorPalletes.js"
import {StringUtils} from "../../node_modules/igv-utils/src/index.js"
import {makePairedAlignmentChords, makeSupplementalAlignmentChords, sendChords} from "../jbrowse/circularViewUtils.js"
import PairedEndStats from "./pairedEndStats"
import AlignmentTrack from "./alignmentTrack.js"
import CoverageTrack from "./coverageTrack.js"
import type Browser from "../browser.js"
import type {TrackConfig} from "../types/config.js"
import type {ClickState, DrawConfiguration, MenuItem, DataRange} from "../types/ui.js"
import type {PopupData} from "../types/feature.js"
import type AlignmentContainer from "./alignmentContainer.js"
import type {Alignment} from "./alignmentContainer.js"
import type {Chord} from "../jbrowse/circularViewUtils.js"
import type TrackViewport from "../trackViewport.js"

interface SortObject {
    chr: string
    position: number
    option?: string
    direction: boolean
}

class BAMTrack extends TrackBase {
    [key: string]: any

    static defaults: Record<string, number | boolean> = {
        alleleFreqThreshold: 0.2,
        visibilityWindow: 30000,
        showCoverage: true,
        showAlignments: true,
        height: 300,
        coverageTrackHeight: 50,
        baseModificationThreshold: 0
    }

    coverageTrack!: CoverageTrack
    alignmentTrack!: AlignmentTrack
    sortObject: SortObject | undefined
    _pairedEndStats: PairedEndStats | undefined
    _height!: number
    showCoverage!: boolean
    showAlignments!: boolean
    coverageTrackHeight!: number
    maxTemplateLength: number | undefined

    constructor(config: TrackConfig, browser: Browser) {
        super(config, browser)
    }

    init(config: TrackConfig): void {

        this.type = "alignment"
        this.featureSource = new BamSource(config as unknown as ConstructorParameters<typeof BamSource>[0], this.browser) as unknown as typeof this.featureSource

        const coverageTrackConfig = Object.assign({parent: this}, config)
        this.coverageTrack = new CoverageTrack(coverageTrackConfig, this)

        const alignmentTrackConfig = Object.assign({parent: this}, config)
        this.alignmentTrack = new AlignmentTrack(alignmentTrackConfig, this.browser)

        super.init(config)

        if (!this.showAlignments) {
            this._height = this.coverageTrackHeight
        }

        // The sort object can be an array in the case of multi-locus view, however if multiple sort positions
        // are present for a given reference frame the last one will take precedence
        if (config.sort) {
            if (Array.isArray(config.sort)) {
                // Legacy support
                this.assignSort(config.sort[0])
            } else {
                this.assignSort(config.sort)
            }
        }
    }

    dispose(): void {
        this.alignmentTrack.dispose()
    }


    setHighlightedReads(highlightedReads: string[], highlightColor: string): void {
        this.alignmentTrack.setHighlightedReads(highlightedReads, highlightColor)
        this.updateViews()
    }

    get expectedPairOrientation(): string {
        return this.alignmentTrack.expectedPairOrientation
    }

    get viewAsPairs(): boolean {
        return this.alignmentTrack.viewAsPairs
    }

    get colorBy(): string {
        return this.alignmentTrack.colorBy
    }

    set height(h: number) {
        this._height = h
        if (this.showAlignments) {
            this.alignmentTrack.height = this.showCoverage ? h - this.coverageTrackHeight : h
        }
    }

    get height(): number {
        return this._height!
    }

    sort(options: SortObject): void {
        options = this.assignSort(options)

        for (let vp of this.trackView.viewports) {
            if (vp.containsPosition(options.chr, options.position)) {
                const alignmentContainer = vp.cachedFeatures as AlignmentContainer | undefined
                if (alignmentContainer) {
                    alignmentContainer.sortRows(options)
                    vp.repaint()
                }
            }
        }
    }

    assignSort(options: { chr?: string; position?: number; direction?: string | boolean; locus?: string; option?: string }): SortObject {
        // convert old syntax
        if (options.locus) {
            const range = StringUtils.parseLocusString(options.locus) as { chr: string; start: number; end?: number }
            options.chr = range.chr
            options.position = range.start
        } else {
            options.position!--
        }
        const direction = options.direction === "ASC" || options.direction === true

        // chr aliasing
        const chr = this.browser.genome.getChromosomeName(options.chr!)
        this.sortObject = { chr, position: options.position!, option: options.option, direction }

        return this.sortObject
    }

    async getFeatures(chr: string, bpStart: number, bpEnd: number, bpPerPixel: number, viewport: unknown): Promise<AlignmentContainer> {

        const alignmentContainer = await (this.featureSource as unknown as BamSource).getAlignments(chr, bpStart, bpEnd)
        alignmentContainer.viewport = viewport

        if (alignmentContainer.hasPairs && !this._pairedEndStats && !this.config.maxFragmentLength) {
            const pairedEndStats = new PairedEndStats(alignmentContainer.allAlignments(), this.config as unknown as ConstructorParameters<typeof PairedEndStats>[1])
            if (pairedEndStats.totalCount > 99) {
                this._pairedEndStats = pairedEndStats
            }
        }

        // Must pack before sorting
        alignmentContainer.pack(this.alignmentTrack)

        const sort = this.sortObject
        if (sort) {
            if (sort.chr === chr && sort.position >= bpStart && sort.position <= bpEnd) {
                alignmentContainer.sortRows(sort)
            }
        }

        this.alignmentTrack.hasPairs = this.alignmentTrack.hasPairs || alignmentContainer.hasPairs

        return alignmentContainer
    }


    computePixelHeight(alignmentContainer: AlignmentContainer): number {
        return (this.showCoverage ? this.coverageTrackHeight : 0) +
            (this.showAlignments ? this.alignmentTrack.computePixelHeight(alignmentContainer) : 0)
    }

    draw(options: DrawConfiguration): void {

        IGVGraphics.fillRect(options.context, 0, options.pixelTop, options.pixelWidth, options.pixelHeight, {'fillStyle': "rgb(255, 255, 255)"})

        if (true === this.showCoverage && this.coverageTrackHeight > 0 && false !== this.config.showAxis) {
            this.trackView.axisCanvas.style.display = 'block'
            this.coverageTrack.draw(options)
        } else {
            this.trackView.axisCanvas.style.display = 'none'
        }

        if (true === this.showAlignments) {
            this.alignmentTrack.setTop(this.coverageTrack, !!this.showCoverage)
            this.alignmentTrack.draw(options)
        }
    }

    paintAxis(ctx: CanvasRenderingContext2D, pixelWidth: number, pixelHeight: number): void {

        this.coverageTrack.paintAxis(ctx, pixelWidth, this.coverageTrackHeight)
    }

    contextMenuItemList(config: ClickState): (string | MenuItem)[] {
        return this.alignmentTrack.contextMenuItemList(config)
    }

    popupData(clickState: ClickState): Promise<PopupData[] | undefined> | PopupData[] {
        if (true === this.showCoverage && clickState.y >= this.coverageTrack.top && clickState.y < this.coverageTrackHeight) {
            return this.coverageTrack.popupData(clickState)
        } else {
            return this.alignmentTrack.popupData(clickState)
        }
    }

    clickedFeatures(clickState: ClickState): unknown[] {

        let clickedObject: unknown
        if (true === this.showCoverage && clickState.y >= this.coverageTrack.top && clickState.y < this.coverageTrackHeight) {
            clickedObject = this.coverageTrack.getClickedObject(clickState)
        } else {
            clickedObject = this.alignmentTrack.getClickedObject(clickState)
        }
        return clickedObject ? [clickedObject] : []
    }

    hoverText(clickState: ClickState): string | undefined {
        if (true === this.showCoverage && clickState.y >= this.coverageTrack.top && clickState.y < this.coverageTrackHeight) {
            const clickedObject = this.coverageTrack.getClickedObject(clickState) as { hoverText?: () => string } | undefined
            if (clickedObject && clickedObject.hoverText) {
                return clickedObject.hoverText()
            }
        }

    }

    menuItemList(): (string | MenuItem)[] {

        // Start with coverage track items
        let menuItems: (string | MenuItem)[] = []

        menuItems = menuItems.concat(this.numericDataMenuItems() as (string | MenuItem)[])

        menuItems = menuItems.concat(this.alignmentTrack.menuItemList() as (string | MenuItem)[])

        // Show coverage / alignment options
        const adjustTrackHeight = (): void => {
            if (!this.autoHeight) {
                const h: number =
                    (this.showCoverage ? this.coverageTrackHeight : 0) +
                    (this.showAlignments ? this.alignmentTrack.height : 0)
                this.trackView.setTrackHeight(h)
            }
        }

        menuItems.push('<hr/>')

        const showCoverageHandler = (): void => {
            this.showCoverage = !this.showCoverage
            adjustTrackHeight()
            this.trackView.checkContentHeight()
            this.trackView.repaintViews()
        }

        menuItems.push({
            element: createCheckbox("Show Coverage", this.showCoverage),
            click: showCoverageHandler
        })

        const showAlignmentHandler = (): void => {
            this.showAlignments = !this.showAlignments
            adjustTrackHeight()
            this.trackView.checkContentHeight()
            this.trackView.repaintViews()
        }

        menuItems.push({
            element: createCheckbox("Show Alignments", this.showAlignments),
            click: showAlignmentHandler
        })


        return menuItems
    }


    getState(): Record<string, unknown> {

        const config = super.getState() as Record<string, unknown>

        // Shared state
        if (this.sortObject) {
            config.sort = {
                chr: this.sortObject.chr,
                position: this.sortObject.position + 1,
                option: this.sortObject.option,
                direction: this.sortObject.direction ? "ASC" : "DESC"
            }
        }

        // Alignment track
        Object.assign(config, this.alignmentTrack.getState())

        return config
    }

    getCachedAlignmentContainers(): unknown[] {
        return this.trackView.viewports.map((vp: TrackViewport) => vp.cachedFeatures)
    }

    // @ts-expect-error - override property as accessor (TrackBase not yet converted)
    get dataRange(): DataRange | undefined {
        return this.coverageTrack.dataRange
    }

    set dataRange(dataRange: DataRange | undefined) {
        this.coverageTrack.dataRange = dataRange
    }

    get logScale(): boolean | undefined {
        return this.coverageTrack.logScale
    }

    set logScale(logScale: boolean | undefined) {
        this.coverageTrack.logScale = logScale
    }

    // @ts-expect-error - override property as accessor (TrackBase not yet converted)
    get autoscale(): boolean {
        return this.coverageTrack.autoscale
    }

    set autoscale(autoscale: boolean) {
        this.coverageTrack.autoscale = autoscale
    }

    addPairedChordsForViewport(viewport: TrackViewport): void {

        const maxTemplateLength: number = this.maxTemplateLength!
        const inView: Alignment[] = []
        const refFrame = viewport.referenceFrame
        for (let a of (viewport.cachedFeatures as AlignmentContainer).allAlignments()) {
            if (a.end >= refFrame.start
                && a.start <= refFrame.end) {
                if (a.paired) {
                    if (a.end - a.start > maxTemplateLength) {
                        inView.push(a)
                    }
                } else {
                    if (a.mate
                        && a.mate.chr
                        && (a.mate.chr !== a.chr || Math.max(a.fragmentLength) > maxTemplateLength)) {
                        inView.push(a)
                    }
                }
            }
        }
        const chords: Chord[] = makePairedAlignmentChords(inView)
        sendChords(chords, this, refFrame, 0.02)
    }

    addSplitChordsForViewport(viewport: TrackViewport): void {

        const inView: Alignment[] = []
        const refFrame = viewport.referenceFrame
        for (let a of (viewport.cachedFeatures as AlignmentContainer).allAlignments()) {

            const sa: boolean = a.hasTag('SA')
            if (a.end >= refFrame.start && a.start <= refFrame.end && sa) {
                inView.push(a)
            }
        }

        const chords: Chord[] = makeSupplementalAlignmentChords(inView)
        sendChords(chords, this, refFrame, 0.02)
    }

}

export default BAMTrack
