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

class BAMTrack extends TrackBase {
    [key: string]: any

    static defaults: Record<string, any> = {
        alleleFreqThreshold: 0.2,
        visibilityWindow: 30000,
        showCoverage: true,
        showAlignments: true,
        height: 300,
        coverageTrackHeight: 50,
        baseModificationThreshold: 0
    }

    coverageTrack: CoverageTrack
    alignmentTrack: any
    sortObject: any
    _pairedEndStats: any
    _height: number | undefined
    showCoverage: boolean | undefined
    showAlignments: boolean | undefined
    coverageTrackHeight: number | undefined
    maxTemplateLength: number | undefined

    constructor(config: any, browser: any) {
        super(config, browser)
    }

    init(config: any): void {

        this.type = "alignment"
        this.featureSource = new BamSource(config, this.browser)

        const coverageTrackConfig: any = Object.assign({parent: this}, config)
        this.coverageTrack = new CoverageTrack(coverageTrackConfig, this)

        const alignmentTrackConfig: any = Object.assign({parent: this}, config)
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


    setHighlightedReads(highlightedReads: any, highlightColor: string): void {
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
            this.alignmentTrack.height = this.showCoverage ? h - this.coverageTrackHeight! : h
        }
    }

    get height(): number {
        return this._height!
    }

    sort(options: any): void {
        options = this.assignSort(options)

        for (let vp of this.trackView.viewports) {
            if (vp.containsPosition(options.chr, options.position)) {
                const alignmentContainer: any = vp.cachedFeatures
                if (alignmentContainer) {
                    alignmentContainer.sortRows(options)
                    vp.repaint()
                }
            }
        }
    }

    assignSort(options: any): any {
        // convert old syntax
        if (options.locus) {
            const range: any = StringUtils.parseLocusString(options.locus)
            options.chr = range.chr
            options.position = range.start
        } else {
            options.position--
        }
        options.direction = options.direction === "ASC" || options.direction === true

        // chr aliasing
        options.chr = this.browser.genome.getChromosomeName(options.chr)
        this.sortObject = options

        return this.sortObject
    }

    async getFeatures(chr: string, bpStart: number, bpEnd: number, bpPerPixel: number, viewport: any): Promise<any> {

        const alignmentContainer: any = await this.featureSource.getAlignments(chr, bpStart, bpEnd)
        alignmentContainer.viewport = viewport

        if (alignmentContainer.hasPairs && !this._pairedEndStats && !this.config.maxFragmentLength) {
            const pairedEndStats: any = new PairedEndStats(alignmentContainer.allAlignments(), this.config)
            if (pairedEndStats.totalCount > 99) {
                this._pairedEndStats = pairedEndStats
            }
        }

        // Must pack before sorting
        alignmentContainer.pack(this.alignmentTrack)

        const sort: any = this.sortObject
        if (sort) {
            if (sort.chr === chr && sort.position >= bpStart && sort.position <= bpEnd) {
                alignmentContainer.sortRows(sort)
            }
        }

        this.alignmentTrack.hasPairs = this.alignmentTrack.hasPairs || alignmentContainer.hasPairs

        return alignmentContainer
    }


    computePixelHeight(alignmentContainer: any): number {
        return (this.showCoverage ? this.coverageTrackHeight! : 0) +
            (this.showAlignments ? this.alignmentTrack.computePixelHeight(alignmentContainer) : 0)
    }

    draw(options: any): void {

        IGVGraphics.fillRect(options.context, 0, options.pixelTop, options.pixelWidth, options.pixelHeight, {'fillStyle': "rgb(255, 255, 255)"})

        if (true === this.showCoverage && this.coverageTrackHeight! > 0 && false !== this.config.showAxis) {
            this.trackView.axisCanvas.style.display = 'block'
            this.coverageTrack.draw(options)
        } else {
            this.trackView.axisCanvas.style.display = 'none'
        }

        if (true === this.showAlignments) {
            this.alignmentTrack.setTop(this.coverageTrack, this.showCoverage)
            this.alignmentTrack.draw(options)
        }
    }

    paintAxis(ctx: CanvasRenderingContext2D, pixelWidth: number, pixelHeight: number): void {

        this.coverageTrack.paintAxis(ctx, pixelWidth, this.coverageTrackHeight)
    }

    contextMenuItemList(config: any): any[] {
        return this.alignmentTrack.contextMenuItemList(config)
    }

    popupData(clickState: any): any {
        if (true === this.showCoverage && clickState.y >= this.coverageTrack.top && clickState.y < this.coverageTrackHeight!) {
            return this.coverageTrack.popupData(clickState)
        } else {
            return this.alignmentTrack.popupData(clickState)
        }
    }

    clickedFeatures(clickState: any): any[] {

        let clickedObject: any
        if (true === this.showCoverage && clickState.y >= this.coverageTrack.top && clickState.y < this.coverageTrackHeight!) {
            clickedObject = this.coverageTrack.getClickedObject(clickState)
        } else {
            clickedObject = this.alignmentTrack.getClickedObject(clickState)
        }
        return clickedObject ? [clickedObject] : []
    }

    hoverText(clickState: any): string | undefined {
        if (true === this.showCoverage && clickState.y >= this.coverageTrack.top && clickState.y < this.coverageTrackHeight!) {
            const clickedObject: any = this.coverageTrack.getClickedObject(clickState)
            if (clickedObject) {
                return clickedObject.hoverText()
            }
        }

    }

    menuItemList(): any[] {

        // Start with coverage track items
        let menuItems: any[] = []

        menuItems = menuItems.concat(this.numericDataMenuItems())

        menuItems = menuItems.concat(this.alignmentTrack.menuItemList())

        // Show coverage / alignment options
        const adjustTrackHeight = (): void => {
            if (!this.autoHeight) {
                const h: number =
                    (this.showCoverage ? this.coverageTrackHeight! : 0) +
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


    getState(): any {

        const config: any = super.getState()

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

    getCachedAlignmentContainers(): any[] {
        return this.trackView.viewports.map((vp: any) => vp.cachedFeatures)
    }

    // @ts-expect-error - override property as accessor (TrackBase not yet converted)
    get dataRange(): any {
        return this.coverageTrack.dataRange
    }

    set dataRange(dataRange: any) {
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

    addPairedChordsForViewport(viewport: any): void {

        const maxTemplateLength: number = this.maxTemplateLength!
        const inView: any[] = []
        const refFrame: any = viewport.referenceFrame
        for (let a of viewport.cachedFeatures.allAlignments()) {
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
        const chords: any[] = makePairedAlignmentChords(inView)
        sendChords(chords, this, refFrame, 0.02)
    }

    addSplitChordsForViewport(viewport: any): void {

        const inView: any[] = []
        const refFrame: any = viewport.referenceFrame
        for (let a of viewport.cachedFeatures.allAlignments()) {

            const sa: boolean = a.hasTag('SA')
            if (a.end >= refFrame.start && a.start <= refFrame.end && sa) {
                inView.push(a)
            }
        }

        const chords: any[] = makeSupplementalAlignmentChords(inView)
        sendChords(chords, this, refFrame, 0.02)
    }

}

export default BAMTrack
