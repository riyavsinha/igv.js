import {doAutoscale} from "./util/igvUtils.js"
import {createViewport} from "./util/viewportUtils.js"
import {FeatureUtils, IGVColor} from '../node_modules/igv-utils/src/index.js'
import * as DOMUtils from "./ui/utils/dom-utils.js"
import {createIcon} from "./ui/utils/icons.js"
import SampleInfoViewport from "./sample/sampleInfoViewport.js"
import SampleNameViewport from './sample/sampleNameViewport.js'
import MenuPopup from "./ui/menuPopup.js"
import {autoScaleGroupColorHash, multiTrackSelectExclusionTypes} from "./ui/menuUtils.js"
import {colorPalettes, hexToRGB} from "./util/colorPalletes.js"
import {isOverlayTrackCriteriaMet} from "./ui/overlayTrackButton.js"
import type Browser from "./browser.js"

const igv_axis_column_width: number = 50
const scrollbarExclusionTypes: Set<string> = new Set(['sequence', 'ruler', 'ideogram'])
const colorPickerExclusionTypes: Set<string> = new Set(['ruler', 'sequence', 'ideogram'])

class TrackView {

    namespace: string
    browser: Browser
    track: any
    axis: any
    axisCanvas: HTMLCanvasElement | undefined
    viewports!: any[]
    sampleInfoViewport: any
    sampleNameViewport: any
    outerScroll: any
    innerScroll: any
    dragHandle: any
    gearContainer: any
    gear: any
    trackGearPopup: any
    trackSelectionContainer: any
    disposed: boolean | undefined
    alert: any
    boundTrackGearClickHandler: ((event: Event) => void) | undefined
    boundTrackScrollMouseDownHandler: ((event: MouseEvent) => void) | undefined
    boundColumnContainerMouseMoveHandler: ((event: MouseEvent) => void) | undefined
    boundColumnContainerMouseUpHandler: ((event: MouseEvent) => void) | undefined
    boundTrackDragMouseDownHandler: ((event: MouseEvent) => void) | undefined
    boundDocumentTrackDragMouseUpHandler: ((event: MouseEvent) => void) | undefined
    boundTrackDragMouseEnterHandler: ((event: MouseEvent) => void) | undefined
    boundTrackDragMouseOutHandler: ((event: MouseEvent) => void) | undefined;

    [key: string]: any

    constructor(browser: Browser, columnContainer: HTMLElement, track: any) {

        this.namespace = `trackview-${DOMUtils.guid()}`

        this.browser = browser
        this.track = track
        track.trackView = this

        this.addDOMToColumnContainer(browser, columnContainer, browser.referenceFrameList)

    }

    startSpinner(): void {
        if (this.viewports && this.viewports.length > 0) {
            this.viewports[0].startSpinner()
        }
    }

    stopSpinner(): void {
        if (this.viewports && this.viewports.length > 0) {
            this.viewports[0].stopSpinner()
        }
    }

    addDOMToColumnContainer(browser: any, columnContainer: HTMLElement, referenceFrameList: any[]): void {

        // Axis
        this.axis = this.createAxis(browser, this.track)

        this.createViewports(browser, columnContainer, referenceFrameList)

        // Sample Info
        this.sampleInfoViewport = new SampleInfoViewport(this, browser.columnContainer.querySelector('.igv-sample-info-column'), browser.getSampleInfoViewportWidth())

        // SampleName Viewport
        this.sampleNameViewport = new SampleNameViewport(this, browser.columnContainer.querySelector('.igv-sample-name-column'), undefined, browser.getSampleNameViewportWidth())

        // Track Scrollbar
        this.createTrackScrollbar(browser)

        // Track Drag
        this.createTrackDragHandle(browser)

        // Track Gear
        this.createTrackGearPopup(browser)

    }

    createViewports(browser: any, columnContainer: HTMLElement, referenceFrameList: any[]): void {

        this.viewports = []
        const viewportWidth = browser.calculateViewportWidth(referenceFrameList.length)
        const viewportColumns = columnContainer.querySelectorAll('.igv-column')
        for (let i = 0; i < viewportColumns.length; i++) {
            const viewport = createViewport(this, viewportColumns[i] as HTMLElement, referenceFrameList[i], viewportWidth)
            this.viewports.push(viewport)
        }
        if (typeof this.track.createGroupLabels === 'function') {
            this.track.createGroupLabels()
        }
    }

    getLastViewport(): any | undefined {
        if (this.viewports && this.viewports.length > 0) {
            return this.viewports[this.viewports.length - 1]
        } else {
            return undefined
        }
    }

    createAxis(browser: any, track: any): any {

        const axisColumn = browser.columnContainer.querySelector('.igv-axis-column')
        if(!axisColumn) {
            return;   // The axis column is optional.
        }

        const axis = DOMUtils.div()
        this.axis = axis
        axisColumn.appendChild(axis)

        axis.dataset.tracktype = track.type

        axis.style.height = `${track.height}px`

        if (typeof track.paintAxis === 'function') {

            const {width, height} = axis.getBoundingClientRect()
            this.axisCanvas = document.createElement('canvas')
            this.axisCanvas.style.width = `${width}px`
            this.axisCanvas.style.height = `${height}px`
            axis.appendChild(this.axisCanvas)
        }

        if (false === multiTrackSelectExclusionTypes.has(this.track.type)) {

            this.trackSelectionContainer = DOMUtils.div()
            axis.appendChild(this.trackSelectionContainer)

            const html = `<input type="checkbox" name="track-select">`
            const input = document.createRange().createContextualFragment(html).firstChild as HTMLInputElement
            this.trackSelectionContainer.appendChild(input)
            input.checked = this.track.selected || false

            input.addEventListener('change', (event: Event) => {
                event.preventDefault()
                event.stopPropagation()
                this.track.selected = (event.target as HTMLInputElement).checked
                this.setDragHandleSelectionState((event.target as HTMLInputElement).checked)
                this.browser.overlayTrackButton.setVisibility(isOverlayTrackCriteriaMet(this.browser))
            })

            this.enableTrackSelection(false)

        }

        return axis

    }

    resizeAxisCanvas(width: number, height: number): void {

        this.axis.style.width = `${width}px`
        this.axis.style.height = `${height}px`

        if (typeof this.track.paintAxis === 'function') {
            // Size the canvas in CSS (logical) pixels.  The buffer size will be set when painted.
            this.axisCanvas!.style.width = `${width}px`
            this.axisCanvas!.style.height = `${height}px`

        }
    }

    renderSVGContext(context: any, {deltaX, deltaY}: {deltaX: number, deltaY: number}): void {

        renderSVGAxis(context, this.track, this.axisCanvas, deltaX, deltaY)

        const {width: axisWidth} = this.axis.getBoundingClientRect()

        const {y} = this.viewports[0].viewportElement.getBoundingClientRect()

        let delta: {deltaX: number, deltaY: number} =
            {
                deltaX: axisWidth + deltaX,
                deltaY: y + deltaY
            }

        for (let viewport of this.viewports) {
            viewport.renderSVGContext(context, delta)
            const {width} = viewport.viewportElement.getBoundingClientRect()
            delta.deltaX += width
        }

        if (true === this.browser.sampleInfo.isInitialized() && true === this.browser.sampleInfoControl.showSampleInfo) {
            this.sampleInfoViewport.renderSVGContext(context, delta)
            const {width} = this.sampleInfoViewport.viewport.getBoundingClientRect()
            delta.deltaX += width
        }

        if (true === this.browser.showSampleNames) {
            this.sampleNameViewport.renderSVGContext(context, delta)
        }
    }

    presentColorPicker(colorSelection: string, event: Event): void {

        if (false === colorPickerExclusionTypes.has(this.track.type)) {

            let initialTrackColor: string

            if (colorSelection === 'color') {
                initialTrackColor = this.track._initialColor || this.track.constructor.defaultColor
            } else {
                initialTrackColor = this.track._initialAltColor || this.track.constructor.defaultColor
            }

            let colorHandlers: any
            const selected = this.browser.getSelectedTrackViews()
            if (selected.length > 0 && new Set(selected).has(this)) {

                colorHandlers =
                    {
                        color: (rgbString: string) => {
                            for (const trackView of selected) {
                                trackView.track.color = rgbString
                                trackView.repaintViews()
                            }
                        },
                        altColor: (rgbString: string) => {
                            for (const trackView of selected) {
                                trackView.track.altColor = rgbString
                                trackView.repaintViews()
                            }
                        },
                    }
            } else {
                colorHandlers =
                    {
                        color: (hex: string) => {
                            this.track.color = hexToRGB(hex)
                            this.repaintViews()
                        },
                        altColor: (hex: string) => {
                            this.track.altColor = hexToRGB(hex)
                            this.repaintViews()
                        }
                    }
            }

            const moreColorsPresentationColor = 'color' === colorSelection ? (this.track.color || this.track.constructor.defaultColor) : (this.track.altColor || this.track.constructor.defaultColor)
            this.browser.genericColorPicker.configure(initialTrackColor, colorHandlers[colorSelection], moreColorsPresentationColor)
            this.browser.genericColorPicker.present(event as MouseEvent)

        }

    }

    setTrackHeight(newHeight: number, force: boolean): void {

        if (!force) {
            if (this.track.minHeight) {
                newHeight = Math.max(this.track.minHeight, newHeight)
            }
            if (this.track.maxHeight) {
                newHeight = Math.min(this.track.maxHeight, newHeight)
            }
        }

        this.track.height = newHeight

        this.resizeAxisCanvas(this.axis.clientWidth, this.track.height)

        if (typeof this.track.paintAxis === 'function') {
            this.paintAxis()
        }

        for (let vp of this.viewports) {
            vp.setHeight(newHeight)
        }

        this.sampleInfoViewport.setHeight(newHeight)

        this.sampleNameViewport.viewport.style.height = `${newHeight}px`

        // If the track does not manage its own content height set it equal to the viewport height here
        if (typeof this.track.computePixelHeight !== "function") {
            for (let vp of this.viewports) {
                vp.setContentHeight(newHeight)
            }
        }

        this.repaintViews()

        this.updateScrollbar()

        this.dragHandle.style.height = `${newHeight}px`
        this.gearContainer.style.height = `${newHeight}px`

        this.browser.fireEvent("trackheightchange", this as any)
    }

    updateScrollbar(): void {

        const viewportHeight = this.viewports[0].viewportElement.clientHeight
        this.outerScroll.style.height = `${viewportHeight}px`

        if (false === scrollbarExclusionTypes.has(this.track.type)) {

            const viewportContentHeight = this.maxViewportContentHeight()
            const innerScrollHeight = Math.round((viewportHeight / viewportContentHeight) * viewportHeight)

            if (viewportContentHeight > viewportHeight) {
                this.innerScroll.style.display = 'block'
                this.innerScroll.style.height = `${innerScrollHeight}px`

            } else {
                this.innerScroll.style.display = 'none'
            }
        }
    }

    setTop(contentTop: number): void {
        for (let viewport of this.viewports) {
            viewport.setTop(contentTop)
        }
        this.sampleInfoViewport.setTop(contentTop)
        this.sampleNameViewport.setTop(contentTop)
    }

    moveScroller(delta: number): void {

        const y = this.innerScroll.offsetTop + delta
        const top = Math.min(Math.max(0, y), this.outerScroll.clientHeight - this.innerScroll.clientHeight)
        this.innerScroll.style.top = `${top}px`

        const contentHeight = this.maxViewportContentHeight()
        const contentTop = Math.round(top * (contentHeight / this.viewports[0].viewportElement.clientHeight))
        this.setTop(contentTop)
    }

    scrollByPixels(delta: number): void {


        const currentTop = this.viewports[0].getContentTop()  // Bit of a hack, contentTop is the same for all viewports

        const contentHeight = this.maxViewportContentHeight()
        const maxContentTop = contentHeight - this.viewports[0].viewportElement.clientHeight
        const newTop = Math.min(Math.max(0, currentTop + delta), maxContentTop)

        this.setTop(newTop)

        if (this.innerScroll) {
            const viewportHeight = this.viewports[0].viewportElement.clientHeight
            const top = Math.round(newTop * (viewportHeight / contentHeight))
            this.innerScroll.style.top = `${top}px`
        }
    }


    repaintViews(): void {

        for (let viewport of this.viewports) {
            if (viewport.isVisible()) {
                viewport.repaint()
            }
        }

        if (typeof this.track.paintAxis === 'function') {
            this.paintAxis()
        }

        this.repaintSampleInfo()

        this.repaintSamples()
    }

    repaintSampleInfo(): void {

        this.sampleInfoViewport.repaint()
    }

    repaintSamples(): void {

        if (typeof this.track.getSamples === 'function') {
            const samples = this.track.getSamples()
            if (samples.names && samples.names.length > 0) {
                this.sampleNameViewport.repaint(samples)
            }

        }
    }

    // track labels
    setTrackLabelName(name: string): void {
        this.viewports.forEach((viewport: any) => viewport.setTrackLabel(name))
    }

    resize(viewportWidth: number): void {
        for (let viewport of this.viewports) {
            viewport.setWidth(viewportWidth)
        }
    }

    async updateViews(): Promise<void> {

        if (!(this.browser && this.browser.referenceFrameList)) return

        const visibleViewports = this.viewports.filter((viewport: any) => viewport.isVisible() && viewport.checkZoomIn())

        // Shift viewports left/right to current genomic state (pans canvas)
        visibleViewports.forEach((viewport: any) => viewport.shift())

        // If dragging (panning) return
        if (this.browser.dragObject) {
            return
        }

        // Filter zoomed out views.  This has the side effect or turning off or no the zoomed out notice
        const viewportsToRepaint = visibleViewports.filter((vp: any) => vp.needsRepaint())

        // Get viewports that require a data load
        const viewportsToReload = visibleViewports.filter((viewport: any) => viewport.needsReload())

        // Trigger viewport to load features needed to cover current genomic range
        // NOTE: these must be loaded synchronously, do not user Promise.all,  not all file readers are thread safe
        for (let viewport of viewportsToReload) {
            await viewport.loadFeatures()
        }

        if (this.disposed) return   // Track was removed during load

        // Special case for variant tracks in multilocus view.  The # of rows to allocate to the variant (site)
        // section depends on data from all the views.  We only need to adjust this however if any data was loaded
        // (i.e. reloadableViewports.length > 0)
        if (this.track && typeof this.track.variantRowCount === 'function' && viewportsToReload.length > 0) {
            let maxRow = 0
            for (let viewport of this.viewports) {
                if (viewport.featureCache && viewport.featureCache.features) {
                    maxRow = Math.max(maxRow, viewport.featureCache.features.reduce((a: number, f: any) => Math.max(a, f.row || 0), 0))
                }
            }
            const current = this.track.nVariantRows
            if (current !== maxRow + 1) {
                this.track.variantRowCount(maxRow + 1)
                for (let viewport of this.viewports) {
                    viewport.checkContentHeight()
                }
            }
        }

        // Autoscale
        let mergeAutocale: any
        if ("merged" === this.track.type) {
            // Merged tracks handle their own scaling
            mergeAutocale = this.track.updateScales(visibleViewports)

        } else if (this.track.autoscale) {
            let allFeatures: any[] = []
            for (let visibleViewport of visibleViewports) {
                const referenceFrame = visibleViewport.referenceFrame
                const start = referenceFrame.start
                const end = start + referenceFrame.toBP(visibleViewport.getWidth())

                if (visibleViewport.featureCache && visibleViewport.featureCache.features) {

                    // If the "features" object has a getMax function use it.  Currently alignmentContainer
                    // implements this for coverage and Merged track for its wig tracks.
                    if (typeof visibleViewport.featureCache.features.getMax === 'function') {
                        const max = visibleViewport.featureCache.features.getMax(start, end)
                        allFeatures.push({value: max})

                        // If the "features" object also has a getMin function use it.  Currently Merged track implements
                        // this for its wig tracks.
                        if (typeof visibleViewport.featureCache.features.getMin === 'function') {
                            const min = visibleViewport.featureCache.features.getMin(start, end)
                            allFeatures.push({value: min})
                        }

                    } else {
                        const viewFeatures = FeatureUtils.findOverlapping(visibleViewport.featureCache.features, start, end)
                        for (let f of viewFeatures) {
                            allFeatures.push(f)
                        }
                    }
                }
            }


            if (typeof this.track.doAutoscale === 'function') {
                this.track.dataRange = this.track.doAutoscale(allFeatures)
            } else {
                this.track.dataRange = doAutoscale(allFeatures)
            }
        }

        const refreshView = (this.track.autoscale || this.track.autoscaleGroup || this.track.type === 'ruler' || mergeAutocale || this.track.groupBy)
        for (let vp of visibleViewports) {
            if (viewportsToRepaint.includes(vp)) {
                vp.repaint()
            } else if (refreshView) {
                vp.refresh()
            }
        }

        this.adjustTrackHeight()

        this.repaintSampleInfo()

        this.repaintSamples()

        this.updateRulerViewportLabels()
    }

    clearCachedFeatures(): void {
        for (let viewport of this.viewports) {
            viewport.clearCache()
        }
    }

    updateRulerViewportLabels(): void {

        const viewportWidth = this.browser.calculateViewportWidth(this.viewports.length)

        for (let viewport of this.viewports) {
            if ('ruler' === this.track.type) {
                if (this.viewports.length > 1) {
                    viewport.presentLocusLabel(viewportWidth)
                } else {
                    viewport.dismissLocusLabel()
                }
            }
        }

    }

    async getInViewFeatures(): Promise<any[]> {

        if (!(this.browser && this.browser.referenceFrameList)) {
            return []
        }

        let allFeatures: any[] = []
        const visibleViewports = this.viewports.filter((viewport: any) => viewport.isVisible())
        for (let vp of visibleViewports) {

            const referenceFrame = vp.referenceFrame
            const {chr, start, bpPerPixel} = vp.referenceFrame
            const end = start + referenceFrame.toBP(vp.getWidth())
            const needsReload = !vp.featureCache || !vp.featureCache.containsRange(chr, start, end, bpPerPixel)

            if (needsReload) {
                await vp.loadFeatures()
            }
            if (vp.featureCache && vp.featureCache.features) {

                if (typeof vp.featureCache.features.getMax === 'function') {
                    const max = vp.featureCache.features.getMax(start, end)
                    allFeatures.push({value: max})
                } else {
                    const vpFeatures = typeof vp.featureCache.queryFeatures === 'function' ?
                        vp.featureCache.queryFeatures(chr, start, end) :
                        FeatureUtils.findOverlapping(vp.featureCache.features, start, end)
                    allFeatures = allFeatures.concat(vpFeatures)
                }
            }
        }
        return allFeatures
    }

    checkContentHeight(): void {

        for (let viewport of this.viewports) {
            viewport.checkContentHeight()
        }
        this.adjustTrackHeight()

    }

    adjustTrackHeight(): void {

        var contentHeight = this.maxViewportContentHeight()
        if (this.track.autoHeight) {
            this.setTrackHeight(contentHeight, false)
        } else if (this.track.paintAxis) {   // Avoid duplication, paintAxis is already called in setTrackHeight
            this.paintAxis()
        }

        if (false === scrollbarExclusionTypes.has(this.track.type)) {

            // Adjust top, if needed, to insure content is in view
            const currentTop = this.viewports[0].getContentTop()
            const viewportHeight = this.viewports[0].viewportElement.clientHeight
            const minTop = Math.min(0, viewportHeight - contentHeight)
            if (currentTop < minTop) {
                this.setTop(minTop)
            }

            this.updateScrollbar()
            this.moveScroller(0)

        }

    }

    createTrackScrollbar(browser: any): void {

        const outerScroll = DOMUtils.div()
        browser.columnContainer.querySelector('.igv-scrollbar-column').appendChild(outerScroll)
        outerScroll.style.height = `${this.track.height}px`
        this.outerScroll = outerScroll

        if (false === scrollbarExclusionTypes.has(this.track.type)) {
            const innerScroll = DOMUtils.div()
            outerScroll.appendChild(innerScroll)
            this.innerScroll = innerScroll

            this.addTrackScrollMouseHandlers(browser)
        }

    }

    createTrackDragHandle(browser: any): void {

        if ('sequence' !== this.track.type && true === multiTrackSelectExclusionTypes.has(this.track.type)) {
            this.dragHandle = DOMUtils.div({class: 'igv-track-drag-shim'})
        } else {
            this.dragHandle = DOMUtils.div({class: 'igv-track-drag-handle'})
            this.dragHandle.classList.add('igv-track-drag-handle-color')
        }

        browser.columnContainer.querySelector('.igv-track-drag-column').appendChild(this.dragHandle)
        this.dragHandle.style.height = `${this.track.height}px`
        this.addTrackDragMouseHandlers(browser)
    }

    createTrackGearPopup(browser: any): void {

        this.gearContainer = DOMUtils.div()
        browser.columnContainer.querySelector('.igv-gear-menu-column').appendChild(this.gearContainer)
        this.gearContainer.style.height = `${this.track.height}px`

        if (true === this.track.ignoreTrackMenu) {
            // do nothing
        } else {

            this.gear = DOMUtils.div()
            this.gearContainer.appendChild(this.gear)
            const cog = createIcon('cog')
            if(false === browser.config.showGearColumn) {
                cog.style.color = 'white'
            }
            this.gear.appendChild(cog)

            this.trackGearPopup = new MenuPopup(this.gear)

            this.boundTrackGearClickHandler = trackGearClickHandler.bind(this)
            this.gear.addEventListener('click', this.boundTrackGearClickHandler)

            function trackGearClickHandler(this: TrackView, event: Event): void {
                event.preventDefault()
                event.stopPropagation()

                if ('none' === this.trackGearPopup.popover.style.display) {

                    for (const otherTrackView of browser.trackViews.filter((t: any) => t !== this && undefined !== t.trackGearPopup)) {
                        otherTrackView.trackGearPopup.popover.style.display = 'none'
                    }

                    this.trackGearPopup.presentMenuList(this, browser.menuUtils.trackMenuItemList(this), browser.config)
                } else {
                    this.trackGearPopup.popover.style.display = 'none'
                }
            }

        }

    }

    addTrackScrollMouseHandlers(browser: any): void {

        // Mouse Down
        this.boundTrackScrollMouseDownHandler = trackScrollMouseDownHandler.bind(this)
        this.innerScroll.addEventListener('mousedown', this.boundTrackScrollMouseDownHandler)

        function trackScrollMouseDownHandler(this: TrackView, event: MouseEvent): void {

            event.stopPropagation()

            const {y} = DOMUtils.pageCoordinates(event)

            this.innerScroll.dataset.yDown = y.toString()

            this.boundColumnContainerMouseMoveHandler = columnContainerMouseMoveHandler.bind(this)
            browser.columnContainer.addEventListener('mousemove', this.boundColumnContainerMouseMoveHandler)

            function columnContainerMouseMoveHandler(this: TrackView, event: MouseEvent): void {

                event.stopPropagation()

                const {y} = DOMUtils.pageCoordinates(event)

                this.moveScroller(y - parseInt(this.innerScroll.dataset.yDown))

                this.innerScroll.dataset.yDown = y.toString()


            }
        }

        this.boundColumnContainerMouseUpHandler = columnContainerMouseUpHandler.bind(this)
        browser.columnContainer.addEventListener('mouseup', this.boundColumnContainerMouseUpHandler)
        browser.columnContainer.addEventListener('mouseleave', this.boundColumnContainerMouseUpHandler)

        function columnContainerMouseUpHandler(this: TrackView, event: MouseEvent): void {
            browser.columnContainer.removeEventListener('mousemove', this.boundColumnContainerMouseMoveHandler)
        }

    }

    removeTrackScrollMouseHandlers(): void {
        if (false === scrollbarExclusionTypes.has(this.track.type)) {
            this.innerScroll.removeEventListener('mousedown', this.boundTrackScrollMouseDownHandler!)
            this.browser.columnContainer.removeEventListener('mouseup', this.boundColumnContainerMouseUpHandler!)
            this.browser.columnContainer.removeEventListener('mousemove', this.boundColumnContainerMouseMoveHandler!)
            this.browser.columnContainer.removeEventListener('mouseleave', this.boundColumnContainerMouseMoveHandler!)
        }
    }

    addTrackDragMouseHandlers(browser: any): void {

        if ('sequence' === this.track.type || false === multiTrackSelectExclusionTypes.has(this.track.type)) {

            let currentDragHandle: HTMLElement | undefined = undefined

            // Mouse Down
            this.boundTrackDragMouseDownHandler = trackDragMouseDownHandler.bind(this)
            this.dragHandle.addEventListener('mousedown', this.boundTrackDragMouseDownHandler)

            function trackDragMouseDownHandler(this: TrackView, event: MouseEvent): void {

                event.preventDefault()

                currentDragHandle = event.target as HTMLElement
                if (false === this.track.selected || 'sequence' === this.track.type) {
                    currentDragHandle.classList.remove('igv-track-drag-handle-color')
                    currentDragHandle.classList.add('igv-track-drag-handle-hover-color')
                }

                browser.startTrackDrag(this)

            }

            // Mouse Up
            this.boundDocumentTrackDragMouseUpHandler = documentTrackDragMouseUpHandler.bind(this)
            document.addEventListener('mouseup', this.boundDocumentTrackDragMouseUpHandler!)

            function documentTrackDragMouseUpHandler(this: TrackView, event: MouseEvent): void {

                browser.endTrackDrag()

                if (currentDragHandle && event.target !== currentDragHandle) {

                    if (false === this.track.selected || 'sequence' === this.track.type) {
                        currentDragHandle.classList.remove('igv-track-drag-handle-hover-color')
                        currentDragHandle.classList.add('igv-track-drag-handle-color')
                    }

                }

                currentDragHandle = undefined
            }

            // Mouse Enter
            this.boundTrackDragMouseEnterHandler = trackDragMouseEnterHandler.bind(this)
            this.dragHandle.addEventListener('mouseenter', this.boundTrackDragMouseEnterHandler)

            function trackDragMouseEnterHandler(this: TrackView, event: MouseEvent): void {
                event.preventDefault()

                if (undefined === currentDragHandle) {
                    if (false === this.track.selected || 'sequence' === this.track.type) {
                        (event.target as HTMLElement).classList.remove('igv-track-drag-handle-color');
                        (event.target as HTMLElement).classList.add('igv-track-drag-handle-hover-color')
                    }
                }

                browser.updateTrackDrag(this)

            }

            // Mouse Out
            this.dragHandle.addEventListener('mouseout', (event: MouseEvent) => {
                event.preventDefault()

                if (undefined === currentDragHandle) {
                    if (false === this.track.selected || 'sequence' === this.track.type) {
                        (event.target as HTMLElement).classList.remove('igv-track-drag-handle-hover-color');
                        (event.target as HTMLElement).classList.add('igv-track-drag-handle-color')
                    }
                }
            })

            this.boundTrackDragMouseOutHandler = trackDragMouseOutHandler.bind(this)
            this.dragHandle.addEventListener('mouseout', this.boundTrackDragMouseOutHandler)

            function trackDragMouseOutHandler(this: TrackView, event: MouseEvent): void {
                event.preventDefault()

                if (undefined === currentDragHandle) {
                    if (false === this.track.selected || 'sequence' === this.track.type) {
                        (event.target as HTMLElement).classList.remove('igv-track-drag-handle-hover-color');
                        (event.target as HTMLElement).classList.add('igv-track-drag-handle-color')
                    }
                }
            }

        }

    }

    removeTrackDragMouseHandlers(): void {

        if ('ideogram' === this.track.type || 'ruler' === this.track.type) {
            // do nothing
        } else {
            this.dragHandle.removeEventListener('mousedown', this.boundTrackDragMouseDownHandler)
            document.removeEventListener('mouseup', this.boundDocumentTrackDragMouseUpHandler!)
            this.dragHandle.removeEventListener('mouseup', this.boundTrackDragMouseEnterHandler)
            this.dragHandle.removeEventListener('mouseout', this.boundTrackDragMouseOutHandler)
        }

    }

    removeTrackGearMouseHandlers(): void {
        if (true === this.track.ignoreTrackMenu) {
            // do nothing
        } else {
            this.gear.removeEventListener('click', this.boundTrackGearClickHandler)
        }

    }

    removeDOMFromColumnContainer(): void {

        // Axis
        this.axis.remove()
        this.removeViewportsFromColumnContainer()

        // Sample Info Viewport
        this.sampleInfoViewport.dispose()

        // SampleName Viewport
        this.sampleNameViewport.dispose()

        // empty trackScrollbar Column
        this.removeTrackScrollMouseHandlers()
        this.outerScroll.remove()

        // empty trackDrag Column
        this.removeTrackDragMouseHandlers()
        this.dragHandle.remove()

        // empty trackGear Column
        this.removeTrackGearMouseHandlers()
        this.gearContainer.remove()

    }

    removeViewportsFromColumnContainer(): void {
        // Track Viewports
        for (let viewport of this.viewports) {
            viewport.viewportElement.remove()
        }
    }

    dispose(): void {

        this.axis.remove()

        for (let viewport of this.viewports) {
            viewport.dispose()
        }

        this.sampleInfoViewport.dispose()

        this.sampleNameViewport.dispose()

        this.removeTrackScrollMouseHandlers()
        this.outerScroll.remove()

        this.removeTrackDragMouseHandlers()
        this.dragHandle.remove()

        this.removeTrackGearMouseHandlers()
        this.gearContainer.remove()

        if (typeof this.track.dispose === "function") {
            this.track.dispose()
        }

        for (let key of Object.keys(this)) {
            this[key] = undefined
        }

        if (this.alert) {
            this.alert.container.remove()    // This is quite obviously a hack, need a "dispose" method on AlertDialog
        }

        this.disposed = true
    }

    paintAxis(): void {

        if (typeof this.track.paintAxis === 'function') {

            // Set the canvas buffer size, this is the resolution it is drawn at.  This is done here in case the browser
            // has been drug between screens at different dpi resolutions since the last repaint
            const {width, height} = this.axisCanvas!.getBoundingClientRect()
            const dpi = window.devicePixelRatio || 1
            this.axisCanvas!.height = dpi * height
            this.axisCanvas!.width = dpi * width

            // Get a scaled context to draw aon
            const axisCanvasContext = this.axisCanvas!.getContext('2d')!
            axisCanvasContext.scale(dpi, dpi)

            if (this.track.autoscaleGroup) {

                if (undefined === autoScaleGroupColorHash[this.track.autoscaleGroup]) {
                    const colorPalette = colorPalettes['Dark2']
                    const randomIndex = Math.floor(Math.random() * colorPalettes['Dark2'].length)
                    autoScaleGroupColorHash[this.track.autoscaleGroup] = colorPalette[randomIndex]
                }
                const rgba = IGVColor.addAlpha(autoScaleGroupColorHash[this.track.autoscaleGroup], 0.75)
                this.track.paintAxis(axisCanvasContext, width, height, rgba)
            } else {
                this.track.paintAxis(axisCanvasContext, width, height, undefined)
            }
        }
    }

    maxViewportContentHeight(): number {
        return Math.max(...this.viewports.map((viewport: any) => viewport.getContentHeight()))
    }

    enableTrackSelection(doEnableMultiSelection: boolean): void {

        const container = this.trackSelectionContainer

        if (!container || multiTrackSelectExclusionTypes.has(this.track.type)) {
            return
        }

        if (false !== doEnableMultiSelection) {
            container.style.display = 'grid'
        } else {
            // If disabling selection set track selection state to false
            this.track.selected = false

            const trackSelectInput = container.querySelector('[name=track-select]') as HTMLInputElement
            trackSelectInput.checked = this.track.selected

            if (this.dragHandle) {
                this.setDragHandleSelectionState(false)
            }

            container.style.display = 'none'
        }
    }

    setDragHandleSelectionState(isSelected: boolean): void {

        const dragHandle = this.dragHandle

        if (isSelected) {
            dragHandle.classList.remove('igv-track-drag-handle-color')
            dragHandle.classList.remove('igv-track-drag-handle-hover-color')
            dragHandle.classList.add('igv-track-drag-handle-selected-color')
        } else {
            dragHandle.classList.remove('igv-track-drag-handle-hover-color')
            dragHandle.classList.remove('igv-track-drag-handle-selected-color')
            dragHandle.classList.add('igv-track-drag-handle-color')
        }
    }

}

function renderSVGAxis(context: any, track: any, axisCanvas: HTMLCanvasElement | undefined, deltaX: number, deltaY: number): void {

    if (typeof track.paintAxis === 'function') {

        const {y, width, height} = axisCanvas!.getBoundingClientRect()

        const str = (track.name || track.id).replace(/\W/g, '')
        const id = `${str}_axis_guid_${DOMUtils.guid()}`

        context.saveWithTranslationAndClipRect(id, deltaX, y + deltaY, width, height, 0)

        track.paintAxis(context, width, height)

        context.restore()
    }

}

export {igv_axis_column_width}

export default TrackView
