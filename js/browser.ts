import {BGZip, FileUtils, igvxhr, StringUtils, URIUtils} from "../node_modules/igv-utils/src/index.js"
import * as DOMUtils from "./ui/utils/dom-utils.js"
import InputDialog from "./ui/components/inputDialog.js"
import GenericColorPicker from "./ui/components/genericColorPicker.js"
import Alert from './ui/alert.js'
import * as TrackUtils from './util/trackUtils.js'
import TrackView, {igv_axis_column_width} from "./trackView.js"
import C2S from "./canvas2svg.js"
import {getTrack, knownTrackTypes} from "./trackFactory.js"
import XMLSession from "./session/igvXmlSession.js"
import GenomeUtils from "./genome/genomeUtils.js"
import ReferenceFrame, {createReferenceFrameList} from "./referenceFrame"
import {createColumn, doAutoscale} from "./util/igvUtils.js"
import {createViewport} from "./util/viewportUtils.js"
import {bppSequenceThreshold, defaultSequenceTrackOrder} from './sequenceTrack.js'
import version from "./version.js"
import FeatureSource from "./feature/featureSource.js"
import {defaultNucleotideColors} from "./util/nucleotideColors.js"
import search from "./search"
import ResponsiveNavbar from "./responsiveNavbar.js"
import DataRangeDialog from "./ui/components/dataRangeDialog.js"
import HtsgetReader from "./htsget/htsgetReader"
import MenuPopup from "./ui/menuPopup.js"
import {viewportColumnManager} from './viewportColumnManager.js'
import ViewportCenterLine from './ui/viewportCenterLine.js'
import IdeogramTrack from "./ideogramTrack.js"
import RulerTrack from "./rulerTrack.js"
import CircularViewControl from "./ui/circularViewControl.js"
import {createCircularView, makeCircViewChromosomes} from "./jbrowse/circularViewUtils.js"
import ROIManager from './roi/ROIManager.js'
import TrackROISet from "./roi/trackROISet.js"
import SampleInfo from "./sample/sampleInfo.js"
import {translateSession} from "./hic/shoeboxUtils"
import MenuUtils from "./ui/menuUtils.js"
import Genome from "./genome/genome"
import {setDefaults} from "./util/defaultOptions.js"
import {trackViewportPopoverList} from './trackViewport.js'
import type TrackViewport from './trackViewport.js'
import TrackBase from "./trackBase.js"
import {loadGenbank} from "./gbk/genbankParser"
import igvCss from "./embedCss.js"
import {sampleInfoTileWidth, sampleInfoTileXShim} from "./sample/sampleInfoConstants.js"
import QTLSelections from "./qtl/qtlSelections.js"
import {inferFileFormat} from "./util/fileFormatUtils.js"
import {convertToHubURL} from "./ucsc/ucscUtils.js"
import CursorGuide from "./ui/cursorGuide.js"
import SliderDialog from "./ui/components/sliderDialog.js"
import {createBlatTrack} from "./blat/blatTrack.js"
import {loadHub} from "./ucsc/hub/hub.js"
import {EventEmitter} from "./events.js"
import Locus from "./locus.js"
import {isLocalFile, isGoogleDriveURL} from "./util/sessionResourceValidator.js"
import type {BrowserConfig, SearchConfig, SessionLoadOptions, SessionObject, TrackConfig, SampleInfoConfig, ROIConfig} from "./types/config"
import type {Track} from "./types/ui.js"
import type {VpMouseDown, DragObject} from "./types/browser"

// css - $igv-scrollbar-outer-width: 14px;
const igv_scrollbar_outer_width: number = 14

// css - $igv-track-drag-column-width: 12px;
const igv_track_manipulation_handle_width: number = 12

// css - $igv-track-gear-menu-column-width: 28px;
const igv_track_gear_menu_column_width: number = 28

// $igv-column-shim-width: 1px;
// $igv-column-shim-margin: 2px;
const column_multi_locus_shim_width: number = 2 + 1 + 2

class Browser {

    [key: string]: any

    qtlSelections: QTLSelections = new QTLSelections()
    config: BrowserConfig
    guid: string
    namespace: string
    parent: HTMLElement
    eventEmitter: EventEmitter
    root: HTMLElement
    alert: Alert
    spinnerElement: HTMLElement
    columnContainer: HTMLElement
    menuPopup: MenuPopup
    menuUtils: MenuUtils
    trackViews: TrackView[]
    constants: { dragThreshold: number; scrollThreshold: number; defaultColor: string; doubleClickDelay: number }
    sampleInfo: SampleInfo
    roiManager: ROIManager
    previousTrackColors: string[]
    flanking: number | undefined
    crossDomainProxy: string | undefined
    formats: Record<string, unknown> | undefined
    trackDefaults: Record<string, Record<string, unknown>> | undefined
    nucleotideColors!: Record<string, string>
    doShowTrackLabels: boolean | undefined
    doShowCenterLine: boolean | undefined
    doShowCursorGuide: boolean | undefined
    showSampleNames: boolean | undefined
    sampleNameViewportWidth: number | undefined
    searchConfig: SearchConfig | undefined
    navbar!: ResponsiveNavbar
    cursorGuide!: CursorGuide
    inputDialog!: InputDialog
    dataRangeDialog!: DataRangeDialog
    genericColorPicker!: GenericColorPicker
    sliderDialog!: SliderDialog
    referenceFrameList: ReferenceFrame[] = []
    genome!: Genome
    centerLineList: ViewportCenterLine[] = []
    circularView: any
    circularViewControl: CircularViewControl | undefined
    roiSets: TrackROISet[] = []
    vpMouseDown: VpMouseDown | undefined
    dragObject: DragObject | undefined
    isScrolling: boolean = false
    dragTrack: TrackView | undefined
    boundWindowResizeHandler!: () => Promise<void>
    boundRootMouseUpHandler!: (e: Event) => void
    boundRootMouseLeaveHandler!: (e: Event) => void
    boundColumnContainerMouseMoveHandler!: (e: Event) => void
    boundColumnContainerTouchMoveHandler!: (e: Event) => void
    boundColumnContainerMouseLeaveHandler!: (e: Event) => void
    boundColumnContainerMouseUpHandler!: (e: Event) => void
    boundColumnContainerTouchEndHandler!: (e: Event) => void
    keyUpHandler!: (event: KeyboardEvent) => void
    trackHeight: number | undefined

    constructor(config: BrowserConfig, parentDiv: HTMLElement) {

        this.config = config
        this.guid = DOMUtils.guid()
        this.namespace = '.browser_' + this.guid
        this.parent = parentDiv
        this.eventEmitter = new EventEmitter()

        let shadowRoot = parentDiv.shadowRoot
        if (!shadowRoot) {
            // Create the shadow root and attach the IGV CSS stylesheet.
            shadowRoot = parentDiv.attachShadow({mode: "open"})
            const sheet = new CSSStyleSheet()
            sheet.replaceSync(igvCss)
            shadowRoot.adoptedStyleSheets = [sheet]
        }

        this.root = DOMUtils.div({class: 'igv-container'})
        shadowRoot.appendChild(this.root)

        this.alert = new Alert(this.root)

        this.spinnerElement = document.createElement('div')
        this.spinnerElement.className = 'igv-loading-spinner-container'
        this.root.appendChild(this.spinnerElement)
        this.spinnerElement.appendChild(document.createElement('div'))

        this.columnContainer = DOMUtils.div({class: 'igv-column-container'})
        this.root.appendChild(this.columnContainer)

        this.menuPopup = new MenuPopup(this.columnContainer)

        this.menuUtils = new MenuUtils(this)

        this.initialize(config)

        this.trackViews = []

        this.constants = {
            dragThreshold: 3,
            scrollThreshold: 5,
            defaultColor: "rgb(0,0,150)",
            doubleClickDelay: config.doubleClickDelay || 500
        }

        if (config.listeners) {
            for (let evt of Object.keys(config.listeners)) {
                this.on(evt, config.listeners[evt])
            }
        }

        // Events

        this.on('trackremoved', () => {

            const found = this.findTracks((track: any) => typeof track.getSamples === 'function')

            if (0 === found.length) {

                // sample info
                this.sampleInfoControl.setButtonVisibility(false)

                // sample names
                this.sampleNameViewportWidth = undefined
                this.sampleNameControl.hide()

                this.layoutChange()
            }
        })

        this.on('columnlayoutchange', () => {
            if (trackViewportPopoverList.length > 0) {
                const len = trackViewportPopoverList.length
                for (let i = 0; i < len; i++) {
                    trackViewportPopoverList[i].dispose()
                }
                trackViewportPopoverList.length = 0
            }
        })

        this.addEventHandlers()

        this.sampleInfo = new SampleInfo(this)

        this.createStandardControls(config)

        // Region of interest
        this.roiManager = new ROIManager(this)

        // previous track colors for colorPicker
        this.previousTrackColors = []

    }

    get doShowROITable(): boolean {
        return this.roiManager.roiTableIsVisible()
    }

    initialize(config: BrowserConfig): void {

        this.flanking = config.flanking
        this.crossDomainProxy = config.crossDomainProxy
        this.formats = config.formats
        this.trackDefaults = config.trackDefaults
        this.nucleotideColors = (config.nucleotideColors || defaultNucleotideColors) as Record<string, string>
        for (let key of Object.keys(this.nucleotideColors)) {
            this.nucleotideColors[key.toLowerCase()] = this.nucleotideColors[key]
        }

        this.doShowTrackLabels = config.showTrackLabels

        this.doShowCenterLine = config.showCenterGuide

        this.doShowCursorGuide = config.showCursorGuide

        this.showSampleNames = config.showSampleNames

        this.sampleNameViewportWidth = undefined

        if (config.sampleNameViewportWidth) {
            this.sampleNameViewportWidth = config.sampleNameViewportWidth
        }

        if (config.search) {
            this.searchConfig = {
                type: "json",
                url: config.search.url,
                coords: config.search.coords === undefined ? 1 : config.search.coords,
                chromosomeField: config.search.chromosomeField || "chromosome",
                startField: config.search.startField || "start",
                endField: config.search.endField || "end",
                geneField: config.search.geneField || "gene",
                snpField: config.search.snpField || "snp",
                resultsField: config.search.resultsField
            }
        }
    }

    createStandardControls(config: BrowserConfig): void {

        this.setTrackLabelVisibility(config.showTrackLabels ?? true)

        this.navbar = new ResponsiveNavbar(config, this)

        this.columnContainer.parentNode!.insertBefore(this.navbar.navigation, this.columnContainer)

        if (false === config.showControls) {
            this.navbar.hide()
        }
        this.cursorGuide = new CursorGuide(this.columnContainer, this)

        this.inputDialog = new InputDialog(this.root)
        this.inputDialog.container.id = `igv-input-dialog-${DOMUtils.guid()}`

        this.dataRangeDialog = new DataRangeDialog(this, this.root)
        this.dataRangeDialog.container.id = `igv-data-range-dialog-${DOMUtils.guid()}`

        this.genericColorPicker = new GenericColorPicker({parent: this.root, width: 180})
        this.genericColorPicker.container.id = `igv-track-color-picker-${DOMUtils.guid()}`

        this.sliderDialog = new SliderDialog(this.root)
        this.sliderDialog.container.id = `igv-slider-dialog-${DOMUtils.guid()}`

    }

    getSampleNameViewportWidth(): number {

        if (false === this.showSampleNames || undefined === this.sampleNameViewportWidth) {
            return 0
        } else {
            return this.sampleNameViewportWidth
        }

    }

    getSampleInfoViewportWidth(): number {
        return this.getSampleInfoColumnWidth()
    }

    isMultiLocusMode(): boolean {
        return this.referenceFrameList && this.referenceFrameList.length > 1
    }

    isMultiLocusWholeGenomeView(): boolean {

        if (undefined === this.referenceFrameList || 1 === this.referenceFrameList.length) {
            return false
        }

        for (let referenceFrame of this.referenceFrameList) {
            if ('all' === referenceFrame.chr.toLowerCase()) {
                return true
            }
        }

        return false
    }

    currentLoci(): string | string[] {
        const noCommaLocusString = (rf: ReferenceFrame): string => `${rf.chr}:${rf.start + 1}-${rf.end}`
        if (undefined === this.referenceFrameList || 0 === this.referenceFrameList.length) {
            return ""
        } else if (1 === this.referenceFrameList.length) {
            return noCommaLocusString(this.referenceFrameList[0])
        } else {
            return this.referenceFrameList.map((rf: ReferenceFrame) => noCommaLocusString(rf))
        }
    }

    toSVG(): string {

        const {x, y, width, height} = this.columnContainer.getBoundingClientRect()

        const h_render = Number.MAX_SAFE_INTEGER      // <= DO NOT USE 'height' here

        const config =
            {
                width,
                height: h_render,
                backdropColor: 'white',
                multiLocusGap: 0,
                viewbox:
                    {
                        x: 0,
                        y: 0,
                        width,
                        height: h_render
                    }
            }

        const context = new C2S(config)

        // tracks -> SVG
        const delta: { deltaX: number; deltaY: number } = {deltaX: 0, deltaY: -y}
        for (let trackView of this.trackViews) {
            trackView.renderSVGContext(context, delta)
        }

        // ROI -> SVG
        delta.deltaX = x

        // reset height to trim away unneeded svg canvas real estate. Yes, a bit of a hack.
        context.setHeight(height)

        return context.getSerializedSvg(true)
    }

    saveSVGtoFile(filename: string, container?: HTMLElement): void {

        let svgString = this.toSVG()

        // Append svg t testing, not used in production
        if (container) {
            const svg = document.createElement("svg")
            svg.innerHTML = svgString
            container.appendChild(svg)
        }

        const path = filename || 'igvjs.svg'
        const data = URL.createObjectURL(new Blob([svgString], {type: "application/octet-stream"}))
        FileUtils.download(path, data)
        URL.revokeObjectURL(data)  // Important to prevent memory leak
    }

    savePNGtoFile(filename: string): void {

        const svgAsString = this.toSVG()

        const svgBlob = new Blob([svgAsString], {
            type: 'image/svg+xml'
        })
        const svgObjectUrl = URL.createObjectURL(svgBlob)

        const img = document.createElement('img')

        const onImageLoaded = (): void => {

            const dimensions = this.columnContainer.getBoundingClientRect()
            const devicePixelRatio = window.devicePixelRatio
            const w = dimensions.width * devicePixelRatio
            const h = dimensions.height * devicePixelRatio
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const context = canvas.getContext('2d')!
            context.scale(devicePixelRatio, devicePixelRatio)

            context.drawImage(img, 0, 0)
            const data = canvas.toDataURL("image/png")
            filename = filename || 'igvjs.png'
            FileUtils.download(filename, data)

            // Free temporary object URL
            URL.revokeObjectURL(svgObjectUrl)
        }
        img.addEventListener('load', onImageLoaded)
        img.src = svgObjectUrl
    }


    async loadSession(options: SessionLoadOptions): Promise<void> {

        this.sampleInfo.initialize()

        // TODO: deprecated
        this.roiSets = []

        let session: any
        if (options.url || options.file) {
            session = await Browser.loadSessionFile(options)
        } else {
            session = options
        }

        await this.loadSessionObject(session)
    }

    static async loadSessionFile(options: SessionLoadOptions): Promise<any> {

        const urlOrFile = options.url || options.file

        let config: any
        if (options.url && StringUtils.isString(options.url) && (options.url.startsWith("blob:") || options.url.startsWith("data:"))) {
            const json = Browser.uncompressSession(options.url)
            config = JSON.parse(json)
        } else {
            let filename = options.filename
            if (!filename) {
                filename = (options.url ? FileUtils.getFilename(options.url) : options.file!.name)
            }

            if (filename.endsWith(".xml")) {
                const knownGenomes = GenomeUtils.KNOWN_GENOMES
                const string = await igvxhr.loadString(urlOrFile as string)
                config = new XMLSession(string, knownGenomes!)

            } else if (filename.endsWith("hub.txt")) {
                const hub = await loadHub(urlOrFile as string, options)
                const genomeConfig = hub.getGenomeConfig()
                config = {
                    reference: genomeConfig
                }
            } else {
                config = await igvxhr.loadJson(urlOrFile as string)
            }
        }

        return config
    }

    async loadSessionObject(session: any): Promise<void> {

        // Capture current configuration options that might be missing from session
        setDefaults(session, this.config)

        // prepare to load a new session, discarding DOM and state
        this.cleanHouseForSession()
        this.config = session

        // Check for juicebox session
        if (session.browsers) {
            session = await translateSession(session)
        }

        this.navbar.sampleInfoControl.setButtonVisibility(false)

        this.showSampleNames = session.showSampleNames || false
        this.navbar.sampleNameControl.setState(this.showSampleNames === true)

        if (session.sampleNameViewportWidth) {
            this.sampleNameViewportWidth = session.sampleNameViewportWidth
        }

        // Track gear column
        if (this.config.gearColumnPosition === 'left') {
            const gearcolumn = createColumn(this.columnContainer, 'igv-gear-menu-column')
            if (false === this.config.showGearColumn) {
                gearcolumn.style.width = '0px'  // Don't use display none, need element to attach menu
            }
        }

        // axis column
        const axisColumn = createColumn(this.columnContainer, 'igv-axis-column')
        if (false === this.config.showAxis) {
            axisColumn.style.display = 'none'
        }
        if (this.config.axisWidth !== undefined) {
            axisColumn.style.width = this.config.axisWidth + 'px'
        }

        // sample info column
        createColumn(this.columnContainer, 'igv-sample-info-column')

        // SampleName column
        createColumn(this.columnContainer, 'igv-sample-name-column')

        // Track scrollbar column
        createColumn(this.columnContainer, 'igv-scrollbar-column')

        // Track drag/reorder column
        const dragColumn = createColumn(this.columnContainer, 'igv-track-drag-column')
        if (false === this.config.showTrackDragHandles) {
            dragColumn.style.display = 'none'
        }

        // Track gear column
        if (this.config.gearColumnPosition !== 'left') {
            const gearcolumn = createColumn(this.columnContainer, 'igv-gear-menu-column')
            if (false === this.config.showGearColumn) {
                gearcolumn.style.width = '0px'
            }
        }

        const genomeOrReference = session.reference || session.genome || session.genarkAccession
        if (!genomeOrReference) {
            console.warn("No genome or reference object specified")
            return
        }

        const genomeConfig = StringUtils.isString(genomeOrReference) ?
            await GenomeUtils.expandReference(this.alert, genomeOrReference) :
            genomeOrReference

        const genome = await this.loadReference(genomeConfig, genomeConfig.locus || session.locus)

        this.centerLineList = this.createCenterLineList(this.columnContainer)

        // Create ideogram and ruler track.  Really this belongs in browser initialization, but creation is
        // deferred because ideogram and ruler are treated as "tracks", and tracks require a reference frame
        if (false !== session.showIdeogram) {
            const track = new IdeogramTrack(this)
            const trackView = new TrackView(this, this.columnContainer, track as unknown as Track)
            this.trackViews.push(trackView)
        }

        if (false !== session.showRuler) {
            const track = new RulerTrack(this)
            const trackView = new TrackView(this, this.columnContainer, track as unknown as Track)
            this.trackViews.push(trackView)
        }

        if (session.qtlSelections) {
            this.qtlSelections = QTLSelections.fromJSON(session.qtlSelections)
        }

        // ROIs
        if (session.showROIOverlays !== undefined) {
            this.roiManager.showOverlays = session.showROIOverlays
        }
        this.roiManager.clearROIs()
        if (session.roi) {
            this.roiManager.loadROI(session.roi, genome)
        } else {
            // Reset is called by loadROI, if no ROIs are loaded we need to call it explicitly
            await this.roiManager.reset()
        }

        // Sample info
        const localSampleInfoFiles: any[] = []
        const googleDriveSampleInfoFiles: any[] = []
        if (session.sampleinfo) {
            const sampleInfoArray = Array.isArray(session.sampleinfo) ? session.sampleinfo : [session.sampleinfo]
            for (const sampleInfoConfig of sampleInfoArray) {
                if (sampleInfoConfig.file) {
                    localSampleInfoFiles.push(sampleInfoConfig.file)
                } else {
                    const googleDriveItem = this.#createGoogleDriveItemIfPresent(sampleInfoConfig, 'Sample info', 'url', 'filename', 'Google Drive file')
                    if (googleDriveItem) {
                        googleDriveSampleInfoFiles.push(googleDriveItem)
                    } else {
                        await this.sampleInfo.loadSampleInfo(sampleInfoConfig)
                    }
                }
            }
        }

        // Tracks.  Start with genome tracks, if any, then append session tracks
        const genomeTracks = genomeConfig.tracks || []
        const trackConfigurations = session.tracks ? genomeTracks.concat(session.tracks) : genomeTracks

        // Ensure that we always have a sequence track with no explicit URL (=> the reference genome sequence track)
        const pushSequenceTrack = trackConfigurations.filter((track: TrackConfig) => 'sequence' === track.type && !track.url && !track.fastaURL).length === 0
        if (pushSequenceTrack && false !== this.config.showSequence) {
            trackConfigurations.push({type: "sequence", order: defaultSequenceTrackOrder, removable: false})
        }

        // Extract problematic resources from track configurations
        const { localFileItems, googleDriveItems } = this.#extractProblematicResources(
            trackConfigurations,
            localSampleInfoFiles,
            googleDriveSampleInfoFiles
        )

        // Display warning if problematic resources are found
        if (localFileItems.length > 0 || googleDriveItems.length > 0) {
            let message = 'Local and Google Drive files cannot be loaded from a saved session. The following file(s) will not be restored with this session.\n\n'

            // Add local file items
            for (const item of localFileItems) {
                message += `Local file name: ${item.fileName}\n`
                message += `Track name: ${item.trackName}\n\n`
            }

            // Add Google Drive items
            for (const item of googleDriveItems) {
                message += `Google Drive file name: ${item.fileName}\n`
                message += `Track name: ${item.trackName}\n\n`

            }

            alert(message)
        }

        const nonLocalTrackConfigurations = trackConfigurations.filter((config: TrackConfig) =>
            undefined === config.file &&
            undefined === config.indexFile &&
            // Filter out tracks with Google Drive URLs in url/indexURL fields
            !(config.url && isGoogleDriveURL(config.url)) &&
            !(config.indexURL && isGoogleDriveURL(config.indexURL)))

        // Maintain track order unless explicitly set
        let trackOrder = 1
        for (let t of nonLocalTrackConfigurations) {
            if (undefined === t.order) {
                t.order = trackOrder++
            }
        }

        // Load a hidden track -- used to populate searchable database without creating a track
        const configHidden = nonLocalTrackConfigurations.filter((config: any) => true === config.hidden)
        for (const config of configHidden) {
            const featureSource = FeatureSource(config, this.genome)
            await featureSource.getFeatures({chr: "1", start: 0, end: Number.MAX_SAFE_INTEGER})
        }

        await this.loadTrackList(nonLocalTrackConfigurations)

        // If an initial locus is defined and represents a single basedo a "search" here.  This will force micro
        // adjustments after width of track column(s) is known.  This can be an issue when the center gide is shown
        // Without this adjustment the single base would be off center by a few pixels.
        if (session.locus && Locus.isSingleBaseLocusString(session.locus)) {
            await this.search(session.locus)
        }
    }

    cleanHouseForSession(): void {

        for (let trackView of this.trackViews) {
            // empty axis column, viewport columns, sampleName column, scroll column, drag column, gear column
            trackView.removeDOMFromColumnContainer()
        }

        // discard all columns   TODO - why do we do this?
        const elements = this.columnContainer.querySelectorAll('.igv-axis-column, .igv-column-shim, .igv-column, .igv-sample-info-column, .igv-sample-name-column, .igv-scrollbar-column, .igv-track-drag-column, .igv-gear-menu-column')
        elements.forEach((column: Element) => column.remove())

        this.trackViews = []

        if (this.circularView) {
            this.circularView.clearChords()
        }

    }

    async loadReference(genomeConfig: any, initialLocus?: any): Promise<any> {

        this.removeAllTracks()   // Do this first, before new genome is set
        this.roiManager.clearROIs()

        this.navbar.setEnableTrackSelection(false)

        let genome: any
        if (genomeConfig.gbkURL) {
            genome = await loadGenbank(genomeConfig.gbkURL)
        } else {
            genome = await Genome.createGenome(genomeConfig, this)
        }

        const genomeChange = undefined === this.genome || (this.genome.id !== genome.id)

        this.genome = genome

        this.navbar.updateGenome(genome)

        let locus = initialLocus || genome.initialLocus

        if (typeof (locus.chr) !== "undefined" && typeof (locus.start) !== "undefined") {

            // Locus explicitly an object, either {chr, start, end} or {chr, start, bpPerPixel), skip search,
            // bug must still ensure chromosome is loaded
            await this.genome.loadChromosome(locus.chr)
            await this.updateLoci([locus], true)

        } else {
            if (Array.isArray(locus)) {
                locus = locus.join(' ')
            }

            const locusFound = await this.search(locus, true)
            if (!locusFound) {
                console.error(`Cannot set initial locus ${locus}`)
                if (locus !== genome.initialLocus) {
                    await this.search(genome.initialLocus)
                }
            }
        }

        if (genomeChange) {

            this.fireEvent('genomechange', [{genome}])

            if (this.circularView) {
                this.circularView.setAssembly({
                    name: this.genome.id,
                    id: this.genome.id,
                    chromosomes: makeCircViewChromosomes(this.genome)
                })
            }
        }
        return genome
    }

    async expandGenarkAccession(genarkAccession: string): Promise<any> {

        const url = convertToHubURL(genarkAccession)!
        const hub = await loadHub(url)
        const genomeConfig = hub.getGenomeConfig()
        genomeConfig.nameSet = "ucsc"
        return genomeConfig
    }

    async loadGenome(idOrConfig: any): Promise<any> {

        let genomeConfig: any

        if (idOrConfig.genarkAccession) {
            genomeConfig = await this.expandGenarkAccession(idOrConfig.genarkAccession)
        } else {
            // Translate the generic "url" field, used by clients such as igv-webapp
            if (idOrConfig.url) {
                if (StringUtils.isString(idOrConfig.url) && idOrConfig.url.endsWith("/hub.txt")) {
                    idOrConfig.hubURL = idOrConfig.url
                    delete idOrConfig.url
                } else if ("gbk" === getFileExtension(idOrConfig.url)) {
                    idOrConfig.gbkURL = idOrConfig.url
                    delete idOrConfig.url
                }
            }


            const isHubGenome = idOrConfig.hubURL || (idOrConfig.url && StringUtils.isString(idOrConfig.url) && idOrConfig.url.endsWith("/hub.txt"))
            if (isHubGenome) {
                const hub = await loadHub(idOrConfig.hubURL || idOrConfig.url, idOrConfig)
                genomeConfig = hub.getGenomeConfig()
            } else if (StringUtils.isString(idOrConfig) || !(idOrConfig.url || idOrConfig.fastaURL || idOrConfig.twoBitURL || idOrConfig.gbkURL)) {
                // Either an ID, a json string, or an object missing required properties.
                genomeConfig = await GenomeUtils.expandReference(this.alert, idOrConfig)
            } else {
                genomeConfig = idOrConfig
            }
        }

        await this.loadReference(genomeConfig)

        let tracks: any[]
        if (genomeConfig.gbkURL || "gbk" === genomeConfig.format) {
            tracks = [{
                name: "Annotations",
                format: "gbk",
                url: genomeConfig.gbkURL
            }]
        } else {
            tracks = genomeConfig.tracks || []
        }

        // Insure that we always have a sequence track
        const pushSequenceTrack = tracks.filter((track: any) => track.type === 'sequence').length === 0
        if (pushSequenceTrack) {
            tracks.push({type: "sequence", order: defaultSequenceTrackOrder})
        }

        await this.loadTrackList(tracks)

        return this.genome
    }

    updateUIWithReferenceFrameList(): void {

        const referenceFrameList = this.referenceFrameList

        const isWGV = (this.isMultiLocusWholeGenomeView() || GenomeUtils.isWholeGenomeView(referenceFrameList[0].chr))

        this.navbar.navbarDidResize()

        toggleTrackLabels(this.trackViews, this.doShowTrackLabels ?? false)

        if (this.doShowCenterLine && GenomeUtils.isWholeGenomeView(referenceFrameList[0].chr)) {
            this.navbar.centerLineButton.boundMouseClickHandler()
        }

        if (this.doShowCursorGuide && GenomeUtils.isWholeGenomeView(referenceFrameList[0].chr)) {
            this.navbar.cursorGuideButton.boundMouseClickHandler()
        }

        this.setCenterLineAndCenterLineButtonVisibility(GenomeUtils.isWholeGenomeView(referenceFrameList[0].chr))

    }

    setCenterLineAndCenterLineButtonVisibility(isWholeGenomeView: boolean): void {

        if (isWholeGenomeView) {
            this.navbar.centerLineButton.setVisibility(false)
        } else {
            this.navbar.centerLineButton.setVisibility(this.config.showCenterGuideButton ?? true)
        }

        for (let centerLine of this.centerLineList) {
            if (isWholeGenomeView) {
                this.setCenterLineVisibility(!isWholeGenomeView)
            } else {
                this.setCenterLineVisibility(this.doShowCenterLine ?? false)
            }
        }

    }

    setTrackLabelVisibility(isVisible: boolean): void {
        toggleTrackLabels(this.trackViews, isVisible)
    }

    setROITableVisibility(isVisible: boolean): void {
        true === isVisible ? this.roiManager.presentTable() : this.roiManager.dismissTable()
    }

    // cursor guide
    setCursorGuideVisibility(doShowCursorGuide: boolean): void {

        if (doShowCursorGuide) {
            this.cursorGuide.show()
        } else {
            this.cursorGuide.hide()
        }
    }

    setCustomCursorGuideMouseHandler(mouseHandler: any): void {
        this.cursorGuide.customMouseHandler = mouseHandler
    }

    // center line
    setCenterLineVisibility(doShowCenterLine: boolean): void {
        for (let centerLine of this.centerLineList) {
            if (true === doShowCenterLine) {
                centerLine.show()
                centerLine.repaint()
            } else {
                centerLine.hide()
            }
        }
    }

    async loadTrackList(configList: any[]): Promise<any[]> {

        try {
            this.startSpinner()   // TODO this.startSpinner() when we have one

            // Impose an order if not specified
            let order = this.trackViews.length + 1
            for (let c of configList) {
                if (c.order === undefined) {
                    c.order = order++
                }
            }

            const promises: Promise<any>[] = []
            for (const config of configList) {
                promises.push(this.#loadTrackHelper(config))
            }

            const loadedTracks = await Promise.all(promises)

            // If any tracks are selected show the selection buttons
            if (this.trackViews.some(({track}: any) => track.selected)) {
                this.navbar.setEnableTrackSelection(true)
            }

            this.reorderTracks()

            await resize.call(this)

            this.fireEvent('trackorderchanged', [this.getTrackOrder()])

            return loadedTracks

        } finally {
            this.stopSpinner()   // TODO  this.stopSpinner()
        }
    }

    async loadTrack(config: any): Promise<any> {

        const loadedTracks = await this.loadTrackList([config])
        if (config.autoscaleGroup) {
            this.updateViews()
        }
        return loadedTracks[0]
    }

    async #loadTrackHelper(config: any): Promise<any> {

        // config might be json
        if (StringUtils.isString(config)) {
            config = JSON.parse(config)
        }

        if (config.format && config.format.toLowerCase() === 'sampleinfo') {
            return this.loadSampleInfo(config)
        }

        let track: any
        try {
            track = await this.createTrack(config)

        } catch (error: any) {

            let msg = error.message || error.error || error.toString()

            const httpMessages: { [key: string]: string } =
                {
                    "401": "Access unauthorized",
                    "403": "Access forbidden",
                    "404": "Not found"
                }

            if (httpMessages.hasOwnProperty(msg)) {
                msg = httpMessages[msg]
            }

            msg = `${msg} : ${FileUtils.isFile(config.url) ? config.url.name : config.url}`
            const err = new Error(msg)
            console.error(err)
            throw err
        }


        if (track) {
            return await this.addTrack(track)
        } else {
            return undefined
        }
    }

    async addTrack(track: any): Promise<any> {

        // Set order field of track here, otherwise track order might get shuffled during asynchronous load
        if (undefined === track.order) {
            track.order = this.trackViews.length
        }

        if (typeof track.postInit === 'function') {
            await track.postInit()
        }

        // Add track view AFTER postInit, to avoid adding a track that fails during postInit
        const trackView = new TrackView(this, this.columnContainer, track)
        this.trackViews.push(trackView)
        toggleTrackLabels(this.trackViews, this.doShowTrackLabels ?? false)

        if (typeof track.hasSamples === 'function' && track.hasSamples()) {

            if (this.sampleInfo.hasAttributes()) {
                this.sampleInfoControl.setButtonVisibility(true)
            }

            if (this.config.showSampleNameButton !== false) {
                this.sampleNameControl.show()
            }
        }

        track.trackView.enableTrackSelection(this.navbar.getEnableTrackSelection())

        return track

    }

    async loadROI(config: ROIConfig | ROIConfig[]): Promise<any> {
        return this.roiManager.loadROI(config, this.genome)
    }

    clearROIs(): void {
        this.roiManager.clearROIs()
    }

    async getUserDefinedROIs(): Promise<any[]> {

        if (this.roiManager) {

            const set = this.roiManager.getUserDefinedROISet()
            if (undefined === set) {
                return []
            }

            const featureHash = await set.getAllFeatures()
            const featureList: any[] = []
            for (let value of Object.values(featureHash)) {
                featureList.push(...(value as any[]))
            }

            return featureList

        } else {
            return []
        }
    }

    getRulerTrackView(): TrackView | undefined {
        const list = this.trackViews.filter(({track}) => 'ruler' === track.id)
        return list.length > 0 ? list[0] : undefined
    }

    async createTrack(config: any): Promise<any> {

        // Resolve function and promise urls
        let url = await URIUtils.resolveURL(config.url || config.fastaURL)
        if (StringUtils.isString(url)) {
            url = url.trim()
        }

        if (url) {
            if (config.format) {
                config.format = config.format.toLowerCase()
            } else if (config.fastaURL) {
                config.format = "fasta"  // by definition
            } else if (!config.sourceType) {
                // If not a webservice, see if we can infer a format from the URL
                const format = await inferFileFormat(config)
                if (format) {
                    config.format = format
                }
            } else if (config.sourceType === "htsget") {
                // Finally check for htsget URL.  This is a longshot
                await HtsgetReader.inferFormat(config)
            }
        }

        if (config.type) {
            TrackUtils.translateDeprecatedTypes(config)
        }

        let type: string | undefined = config.type ? config.type.toLowerCase() : undefined

        if (!type) {

            // If neither format nor type are known throw an error
            if (!config.format) {
                throw Error(`Unrecognized track:  ${JSON.stringify(config)}`)
            } else {
                type = TrackUtils.inferTrackType(config.format)
                if ("bedtype" === type) {
                    // Bed files must be read to determine track type
                    const featureSource = FeatureSource(config, this.genome)
                    config._featureSource = featureSource    // This is a temp variable, bit of a hack
                    const trackType = typeof featureSource.trackType === 'function' ? await featureSource.trackType() : featureSource.trackType
                    if (trackType && knownTrackTypes().has(trackType)) {
                        type = trackType
                    } else {
                        type = "annotation"
                    }
                }
            }
            // Record in config to make type persistent in session
            config.type = type
        }

        // Set defaults if specified
        if (this.trackDefaults && type) {
            const settings = this.trackDefaults[type]
            if (settings) {
                for (let property in settings) {
                    if (settings.hasOwnProperty(property) && config[property] === undefined) {
                        config[property] = settings[property]
                    }
                }
            }
        }

        const track = getTrack(type!, config, this)
        if (undefined === track) {
            this.alert.present(new Error(`Error creating track.  Could not determine track type for file: ${config.url || config}`), undefined)
        } else {

            if (config.roi && config.roi.length > 0 && track instanceof TrackBase) {
                track.roiSets = config.roi.map((r: ROIConfig) => new TrackROISet(r, this.genome))
            }

            return track
        }
    }

    reorderTracks(): void {

        this.trackViews.sort(function (a: TrackView, b: TrackView) {

            const firstSortOrder = (tv: TrackView): number => {
                return 'ideogram' === tv.track.id ? 1 :
                    'ruler' === tv.track.id ? 2 :
                        3
            }

            const aOrder1 = firstSortOrder(a)
            const bOrder1 = firstSortOrder(b)
            if (aOrder1 === bOrder1) {
                const aOrder2 = a.track.order || 0
                const bOrder2 = b.track.order || 0
                return aOrder2 - bOrder2
            } else {
                return aOrder1 - bOrder1
            }
        })

        // discard current track order
        for (let {
            axis,
            viewports,
            sampleInfoViewport,
            sampleNameViewport,
            outerScroll,
            dragHandle,
            gearContainer
        } of this.trackViews) {

            axis.remove()

            for (let {viewportElement} of viewports) {
                viewportElement.parentNode!.removeChild(viewportElement)
            }

            sampleInfoViewport.viewport.remove()

            sampleNameViewport.viewport.remove()

            outerScroll.remove()
            dragHandle.remove()
            gearContainer.remove()
        }

        // Reattach the divs to the dom in the correct order
        const viewportColumns = this.columnContainer.querySelectorAll('.igv-column')

        for (let {
            axis,
            viewports,
            sampleInfoViewport,
            sampleNameViewport,
            outerScroll,
            dragHandle,
            gearContainer
        } of this.trackViews) {

            this.columnContainer.querySelector('.igv-axis-column')!.appendChild(axis)

            for (let i = 0; i < viewportColumns.length; i++) {
                const {viewportElement} = viewports[i]
                viewportColumns[i].appendChild(viewportElement)
            }

            this.columnContainer.querySelector('.igv-sample-info-column')!.appendChild(sampleInfoViewport.viewport)

            this.columnContainer.querySelector('.igv-sample-name-column')!.appendChild(sampleNameViewport.viewport)

            this.columnContainer.querySelector('.igv-scrollbar-column')!.appendChild(outerScroll)

            this.columnContainer.querySelector('.igv-track-drag-column')!.appendChild(dragHandle)

            this.columnContainer.querySelector('.igv-gear-menu-column')!.appendChild(gearContainer)
        }

    }

    getTrackOrder(): string[] {
        return this.trackViews.filter((tv: TrackView) => tv.track && tv.track.name).map((tv: TrackView) => tv.track.name!)
    }

    getSelectedTrackViews(): TrackView[] {
        return this.trackViews.filter((trackView: TrackView) => true === trackView.track.selected)
    }

    removeTrackByName(name: string): void {
        const copy = this.trackViews.slice()
        for (let trackView of copy) {
            if (name === trackView.track.name) {
                this.removeTrack(trackView.track)
            }
        }
    }

    removeTrack(track: Track | TrackBase): void {
        for (let trackView of this.trackViews) {
            if (track === trackView.track) {
                this._removeTrack(trackView.track)
                break
            }
        }
    }

    _removeTrack(track: Track | TrackBase): void {
        if (track.disposed) return
        this.trackViews.splice(this.trackViews.indexOf(track.trackView), 1)
        this.fireEvent('trackremoved', [track])
        this.fireEvent('trackorderchanged', [this.getTrackOrder()])
        if (track.trackView) {
            track.trackView.dispose()
        }
    }

    removeAllTracks(): void {

        const currentTrackViews = this.trackViews
        this.trackViews = []

        for (let trackView of currentTrackViews) {

            if (trackView.track.id !== 'ruler' && trackView.track.id !== 'ideogram') {
                this.fireEvent('trackremoved', [trackView.track])
                trackView.dispose()
            } else {
                this.trackViews.push(trackView)
            }
        }
    }

    get ideogramTrackView(): TrackView | undefined {
        return this.trackViews[0]
    }

    get rulerTrackView(): TrackView | undefined {
        return this.trackViews[1]
    }

    findTracks(property: string | ((track: Track) => boolean), value?: unknown): Track[] {

        let f = typeof property === 'function' ?
            (trackView: TrackView) => property(trackView.track) :
            (trackView: TrackView) => value === trackView.track[property as string]

        return this.trackViews.filter(f).map((tv: TrackView) => tv.track)
    }

    get tracks(): Track[] {
        return this.trackViews.map((tv: TrackView) => tv.track).filter((t) => t !== undefined)
    }

    setTrackHeight(newHeight: number): void {

        this.trackHeight = newHeight

        this.trackViews.forEach(function (trackView: TrackView) {
            trackView.setTrackHeight(newHeight, false)
        })

    }

    async visibilityChange(): Promise<void> {
        this.layoutChange()
    }

    async layoutChange(): Promise<void> {

        const status = this.referenceFrameList.find((referenceFrame: ReferenceFrame) => referenceFrame.bpPerPixel < 0)

        if (status) {
            const viewportWidth = this.calculateViewportWidth(this.referenceFrameList.length)
            for (let referenceFrame of this.referenceFrameList) {
                referenceFrame.bpPerPixel = (referenceFrame.end - referenceFrame.start) / viewportWidth
            }
        }

        if (this.referenceFrameList) {
            this.navbar.navbarDidResize()
        }

        resize.call(this)

        this.roiManager.updateROIRegionPositions()

        await this.updateViews()
    }

    async updateViews(force?: boolean): Promise<void> {

        const trackViews = this.trackViews

        this.updateLocusSearchWidget()

        for (const {bpPerPixel, chr, start} of this.referenceFrameList) {
            if (bpPerPixel <= bppSequenceThreshold) {
                await this.genome.getSequence(chr, start, start + 1)
            }
        }

        for (const centerGuide of this.centerLineList) {
            centerGuide.repaint()
        }

        // Don't autoscale while dragging.
        if (this.dragObject) {
            for (const trackView of trackViews) {
                await trackView.updateViews()
            }
        } else {
            // Group autoscale is done here as it involves multiple tracks.  Individual track autoscale is done in TrackView
            const groupAutoscaleTrackViews: { [key: string]: TrackView[] } = {}
            const otherTrackViews: TrackView[] = []

            // Isolate group autoscale trackViews
            for (const trackView of trackViews) {
                if (trackView.track.autoscaleGroup) {
                    const autoscaleGroup = trackView.track.autoscaleGroup
                    if (!groupAutoscaleTrackViews[autoscaleGroup]) {
                        groupAutoscaleTrackViews[autoscaleGroup] = []
                    }
                    groupAutoscaleTrackViews[autoscaleGroup].push(trackView)
                } else {
                    otherTrackViews.push(trackView)
                }
            }

            // Calculate group autoscale dataRange
            if (Object.entries(groupAutoscaleTrackViews).length > 0) {
                for (const [group, trackViews] of Object.entries(groupAutoscaleTrackViews)) {
                    const inViewFeatures = await Promise.all(trackViews.map((trackView: TrackView) => trackView.getInViewFeatures()))
                    const dataRange = doAutoscale(inViewFeatures.flat())
                    for (const trackView of trackViews) {
                        trackView.track.dataRange = Object.assign({}, dataRange)
                        trackView.track.autoscale = false
                    }
                    await Promise.all(trackViews.map((trackView: TrackView) => trackView.updateViews()))
                }
            }

            await Promise.all(otherTrackViews.map((trackView: TrackView) => trackView.updateViews()))
        }

    }

    repaintViews(): void {
        for (let trackView of this.trackViews) {
            trackView.repaintViews()
        }
    }

    updateLocusSearchWidget(): void {

        if (!this.referenceFrameList) return
        const referenceFrameList = this.referenceFrameList

        // Update end position of reference frames based on pixel widths.  This is hacky, but its been done here
        // for a long time, although indirectly.
        const width = this.calculateViewportWidth(this.referenceFrameList.length)
        for (let referenceFrame of referenceFrameList) {
            referenceFrame.end = referenceFrame.start + referenceFrame.bpPerPixel * width
        }

        const loc = this.referenceFrameList.map((rf: ReferenceFrame) => rf.getLocusString()).join(' ')

        const chrName = referenceFrameList.length === 1 ? this.genome.getChromosomeDisplayName(this.referenceFrameList[0].chr) : ''

        this.navbar.updateLocus(loc, chrName)

        this.fireEvent('locuschange', [this.referenceFrameList])
    }

    calculateViewportWidth(columnCount: number): number {

        let {width} = this.columnContainer.getBoundingClientRect()

        const sampleInfoViewportWidth = this.getSampleInfoViewportWidth()
        const sampleNameViewportWidth = this.getSampleNameViewportWidth()

        width -=
            (this.config.showAxis === false ? 0 : igv_axis_column_width) +
            sampleInfoViewportWidth +
            sampleNameViewportWidth +
            igv_scrollbar_outer_width +
            (this.config.showTrackDragHandles === false ? 0 : igv_track_manipulation_handle_width) +
            (this.config.showGearColumn === false ? 0 : igv_track_gear_menu_column_width)

        width -= column_multi_locus_shim_width * (columnCount - 1)

        return Math.floor(width / columnCount)
    }

    updateReferenceFrames(viewportWidth: number): void {

        for (const referenceFrame of this.referenceFrameList) {
            referenceFrame.updateForViewportWidth(viewportWidth)
        }
    }

    updateViewportElements(viewportWidth: number): void {

        for (let i = 0; i < this.referenceFrameList.length; i++) {

            for (const {viewports} of this.trackViews) {
                viewports[i].setWidth(viewportWidth)
            }

            for (const {sampleInfoViewport} of this.trackViews) {
                sampleInfoViewport.setWidth(this.getSampleInfoColumnWidth())
                sampleInfoViewport.repaint()
            }

        }
    }

    async syncUIState(): Promise<void> {
        this.updateUIWithReferenceFrameList()
        await this.updateViews(true)
    }

    minimumBases(): number {
        return this.config.minimumBases ?? 40
    }

    // Zoom in by a factor of 2, keeping the same center location
    zoomIn(): void {
        this.zoomWithScaleFactor(0.5)
    }


    // Zoom out by a factor of 2, keeping the same center location if possible
    zoomOut(): void {
        this.zoomWithScaleFactor(2.0)
    }


    async zoomWithScaleFactor(scaleFactor: number, centerBPOrUndefined?: number, referenceFrameOrUndefined?: ReferenceFrame): Promise<void> {

        if (this.config.disableZoom === true) return   // Useful when an embedding application wants to control zooming

        if (!this.referenceFrameList) return

        const viewportWidth = this.calculateViewportWidth(this.referenceFrameList.length)

        let referenceFrames = referenceFrameOrUndefined ? [referenceFrameOrUndefined] : this.referenceFrameList

        for (let referenceFrame of referenceFrames) {
            referenceFrame.zoomWithScaleFactor(this, scaleFactor, viewportWidth, centerBPOrUndefined)
        }

        this.fireEvent("zoom", [referenceFrames])
    }

    async addMultiLocusPanel(chr: string, start: number, end: number, referenceFrameLeft?: ReferenceFrame): Promise<void> {

        if (!this.referenceFrameList) return

        // account for reduced viewport width as a result of adding right mate pair panel
        const viewportWidth = this.calculateViewportWidth(1 + this.referenceFrameList.length)
        const scaleFactor = this.calculateViewportWidth(this.referenceFrameList.length) / this.calculateViewportWidth(1 + this.referenceFrameList.length)
        for (let refFrame of this.referenceFrameList) {
            refFrame.bpPerPixel *= scaleFactor
        }

        const bpp = (end - start) / viewportWidth
        const newReferenceFrame = new ReferenceFrame(this.genome, chr, start, end, bpp)
        const indexLeft = referenceFrameLeft ? this.referenceFrameList.indexOf(referenceFrameLeft) : this.referenceFrameList.length - 1
        const indexRight = 1 + indexLeft

        // TODO -- this is really ugly
        const {viewportElement} = this.trackViews[0].viewports[indexLeft]
        const viewportColumn = viewportColumnManager.insertAfter(viewportElement.parentElement!)
        this.fireEvent('columnlayoutchange')

        if (indexRight === this.referenceFrameList.length) {
            this.referenceFrameList.push(newReferenceFrame)
            for (let trackView of this.trackViews) {
                const viewport = createViewport(trackView, viewportColumn, newReferenceFrame)
                trackView.viewports.push(viewport)
            }
        } else {
            this.referenceFrameList.splice(indexRight, 0, newReferenceFrame)
            for (let trackView of this.trackViews) {
                const viewport = createViewport(trackView, viewportColumn, newReferenceFrame)
                trackView.viewports.splice(indexRight, 0, viewport)
            }
        }


        this.centerLineList = this.createCenterLineList(this.columnContainer)

        resize.call(this)
        await this.updateViews(true)
    }

    createCenterLineList(columnContainer: HTMLElement): ViewportCenterLine[] {

        const centerLines = columnContainer.querySelectorAll('.igv-center-line')
        for (let i = 0; i < centerLines.length; i++) {
            centerLines[i].remove()
        }

        const centerLineList: ViewportCenterLine[] = []
        const viewportColumns = columnContainer.querySelectorAll('.igv-column')
        for (let i = 0; i < viewportColumns.length; i++) {
            centerLineList.push(new ViewportCenterLine(this, this.referenceFrameList[i], viewportColumns[i] as HTMLElement))
        }

        return centerLineList
    }

    async removeMultiLocusPanel(referenceFrame: ReferenceFrame): Promise<void> {

        // find the $column corresponding to this referenceFrame and remove it
        const index = this.referenceFrameList.indexOf(referenceFrame)
        const {viewportElement} = this.trackViews[0].viewports[index]

        viewportColumnManager.removeColumnAtIndex(index, viewportElement.parentElement!)
        this.fireEvent('columnlayoutchange')

        for (let {viewports} of this.trackViews) {
            viewports[index].dispose()
            viewports.splice(index, 1)
        }

        this.referenceFrameList.splice(index, 1)

        const rulerTV = this.getRulerTrackView()
        if (1 === this.referenceFrameList.length && rulerTV) {
            for (let rulerViewport of rulerTV.viewports) {
                ;(rulerViewport as import("./rulerViewport.js").default).dismissLocusLabel()
            }
        }

        const scaleFactor = this.calculateViewportWidth(1 + this.referenceFrameList.length) / this.calculateViewportWidth(this.referenceFrameList.length)

        await this.rescaleForMultiLocus(scaleFactor)

    }

    async gotoMultilocusPanel(referenceFrame: ReferenceFrame): Promise<void> {

        const referenceFrameIndex = this.referenceFrameList.indexOf(referenceFrame)

        // Remove columns for unselected panels
        this.columnContainer.querySelectorAll('.igv-column').forEach((column: Element, c: number) => {
            if (c === referenceFrameIndex) {
                // do nothing
            } else {
                column.remove()
            }
        })

        // Remove all column shims
        this.columnContainer.querySelectorAll('.igv-column-shim').forEach((shim: Element) => shim.remove())

        // Discard viewports
        for (let trackView of this.trackViews) {
            const retain = trackView.viewports[referenceFrameIndex]
            trackView.viewports.filter((viewport, i: number) => i !== referenceFrameIndex).forEach((viewport) => viewport.dispose())
            trackView.viewports = [retain]
        }

        const viewportWidth = this.calculateViewportWidth(1)
        referenceFrame.bpPerPixel = (referenceFrame.end - referenceFrame.start) / viewportWidth
        this.referenceFrameList = [referenceFrame]

        this.trackViews.forEach(({viewports}: TrackView) => viewports.forEach((viewport) => viewport.setWidth(viewportWidth)))

        this.centerLineList = this.createCenterLineList(this.columnContainer)

        this.updateUIWithReferenceFrameList()

        await this.updateViews(true)

    }

    async rescaleForMultiLocus(scaleFactor: number): Promise<void> {

        const viewportWidth = this.calculateViewportWidth(this.referenceFrameList.length)

        for (let referenceFrame of this.referenceFrameList) {
            referenceFrame.bpPerPixel *= scaleFactor
        }

        for (let {viewports} of this.trackViews) {

            for (let viewport of viewports) {
                viewport.setWidth(viewportWidth)
            }
        }

        this.centerLineList = this.createCenterLineList(this.columnContainer)

        this.updateUIWithReferenceFrameList()

        await this.updateViews()

    }

    async goto(chr: string, start: number, end: number): Promise<void> {
        await this.search(chr + ":" + start + "-" + end)
    }


    async search(stringOrArray: string | string[], init?: boolean): Promise<boolean> {

        const loci = await search(this, stringOrArray as string)
        return this.updateLoci(loci ?? [], init)
    }

    async updateLoci(loci: any[], init?: boolean): Promise<boolean> {

        if (loci && loci.length > 0) {

            // create reference frame list based on search loci
            this.referenceFrameList = createReferenceFrameList(loci, this.genome, this.flanking ?? 0, this.minimumBases(), this.calculateViewportWidth(loci.length), this.isSoftclipped())

            // discard track viewport DOM elements
            for (let trackView of this.trackViews) {
                trackView.removeViewportsFromColumnContainer()
            }

            // discard ONLY viewport columns
            this.columnContainer.querySelectorAll('.igv-column-shim, .igv-column').forEach((el: Element) => el.remove())

            // Insert viewport columns preceding the sample info column
            viewportColumnManager.insertBefore(this.columnContainer.querySelector('.igv-sample-info-column')!, this.referenceFrameList.length)
            this.fireEvent('columnlayoutchange')

            // Create the viewport objects -- TODO -- this is done for every search, which is insane
            for (let trackView of this.trackViews) {
                trackView.createViewports(this, this.columnContainer, this.referenceFrameList)
            }

            this.centerLineList = this.createCenterLineList(this.columnContainer)

            this.updateUIWithReferenceFrameList()

            if (!init) {
                await this.updateViews()
            }
            return true
        } else {
            return false
        }
    }

    async loadSampleInfo(sampleInfoConfig: SampleInfoConfig): Promise<void> {


        await this.sampleInfo.loadSampleInfo(sampleInfoConfig)

        if (this.config.sampleinfo) {
            this.config.sampleinfo.push(sampleInfoConfig)
        } else {
            this.config.sampleinfo = [sampleInfoConfig]
        }

        for (const {sampleInfoViewport} of this.trackViews) {
            sampleInfoViewport.setWidth(this.getSampleInfoColumnWidth())
        }

        const found = this.findTracks((t: Track) => typeof t.getSamples === 'function')
        if (found.length > 0) {
            this.sampleInfoControl.performClickWithState(this, true)
            this.sampleInfoControl.setButtonVisibility(true)
        }

        for (const {sampleInfoViewport} of this.trackViews) {
            sampleInfoViewport.repaint()
        }

        // await this.layoutChange()
    }

    async discardSampleInfo(): Promise<void> {

        this.sampleInfo.discard()

        for (const {sampleInfoViewport} of this.trackViews) {
            sampleInfoViewport.setWidth(this.getSampleInfoColumnWidth())
        }

        const found = this.findTracks((t: Track) => typeof t.getSamples === 'function')
        if (found.length > 0) {
            this.sampleInfoControl.performClickWithState(this, false)
            this.sampleInfoControl.setButtonVisibility(false)
        }

        for (const {sampleInfoViewport} of this.trackViews) {
            sampleInfoViewport.repaint()
        }

        await this.layoutChange()
    }

    getSampleInfoColumnWidth(): number {

        if (!this.sampleInfo.attributeCount) {
            return 0
        } else {

            const found = this.findTracks((t: Track) => typeof t.getSamples === 'function')
            const isFound = found.length > 0
            const hasAttributes = this.sampleInfo.hasAttributes()
            const doShowSampleInfo = this.sampleInfoControl.showSampleInfo
            const status = isFound && hasAttributes && doShowSampleInfo

            if (status) {
                return this.sampleInfo.attributeCount * sampleInfoTileWidth + sampleInfoTileXShim
            } else {
                return 0
            }
        }
    }


    // IGV events (not DOM events)

    on(eventName: string, fn: (...args: unknown[]) => void): void {
        this.eventEmitter.on(eventName, fn)
    }

    un(eventName: string, fn: (...args: unknown[]) => void): void {
        this.eventEmitter.off(eventName, fn)
    }


    off(eventName: string, fn: (...args: unknown[]) => void): void {
        this.eventEmitter.off(eventName, fn)
    }

    fireEvent(eventName: string, args?: unknown[], thisObj?: unknown): unknown {
        return this.eventEmitter.emit(eventName, args, thisObj)
    }

    dispose(): void {
        this.removeEventHandlers()
        for (let trackView of this.trackViews) {
            trackView.dispose()
        }
        if (this.roiManager) {
            this.roiManager.dispose()
        }
    }

    toJSON(): SessionObject {

        const json: SessionObject = {
            "version": version()
        }

        if (this.showSampleNames !== undefined) {
            json['showSampleNames'] = this.showSampleNames
        }

        if (this.sampleNameViewportWidth) {
            json['sampleNameViewportWidth'] = this.sampleNameViewportWidth
        }

        json["reference"] = this.genome.toJSON()

        // Build locus array (multi-locus view).  Use the first track to extract the loci, any track could be used.
        const locus: string[] = []
        let anyTrackView = this.trackViews[0]
        for (let {referenceFrame} of anyTrackView.viewports) {
            const locusString = referenceFrame.getLocusString()
            locus.push(locusString)
        }
        json["locus"] = locus.length === 1 ? locus[0] : locus

        const roiSets = this.roiManager.toJSON()
        if (roiSets) {
            json["roi"] = roiSets
            if (!this.roiManager.showOverlays) {
                json["showROIOverlays"] = false   // true is the default
            }
        }

        if (!this.qtlSelections.isEmpty()) {
            json["qtlSelections"] = this.qtlSelections.toJSON()
        }

        // Filter configurations
        // REMOVED: Filter configurations are now saved as part of individual track configurations
        // if (this.filterConfigurations.size > 0) {
        //     const filterConfigs = {}
        //     for (const [trackType, filters] of this.filterConfigurations) {
        //         filterConfigs[trackType] = filters
        //     }
        //     json["filterConfigurations"] = filterConfigs
        // }

        // Tracks
        const trackJson: TrackConfig[] = []
        const errors: string[] = []
        for (const {track} of this.trackViews) {
            try {

                let config: any
                if (typeof track.getState === "function") {
                    config = TrackBase.prepareConfigForSession(track.getState())
                } else if (track.config) {
                    config = TrackBase.prepareConfigForSession(track.config)
                }

                if (config) {
                    // null backpointer to browser
                    if (config.browser) {
                        delete config.browser
                    }

                    config.order = track.order

                    trackJson.push(config)
                }
            } catch (e: any) {
                const str = `Track: ${track.name}: ${e}`
                console.error(str)
                errors.push(str)
            }
        }

        if (errors.length > 0) {
            let n = 1
            let message = 'Errors encountered saving session: </br>'
            for (let e of errors) {
                message += ` (${n++}) ${e.toString()} <br/>`
            }
            throw Error(message)
        }

        json["tracks"] = trackJson

        // Sample info
        if (this.config.sampleinfo) {
            json["sampleinfo"] = this.config.sampleinfo
        }

        // Validate reference genome and warn about problematic resources
        this._validateAndWarnResources(json)

        return json
    }

    #getGoogleDriveDisplayName(filename: string | undefined, defaultFallback: string = 'Google Drive file'): string {
        return filename || defaultFallback
    }

    #createGoogleDriveItemIfPresent(config: TrackConfig, trackName: string, urlField: string, filenameField: string, defaultFileName: string): { trackName: string; fileName: string } | null {
        const url = config[urlField]
        if (url && isGoogleDriveURL(url)) {
            const fileName = this.#getGoogleDriveDisplayName(config[filenameField], defaultFileName)
            return {
                trackName: trackName,
                fileName: fileName
            }
        }
        return null
    }

    #extractGoogleDriveItemsFromConfig(config: TrackConfig): { trackName: string; fileName: string }[] {
        const items: { trackName: string; fileName: string }[] = []
        const trackName = config.name || 'Unnamed track'

        // Check main file URL
        const mainItem = this.#createGoogleDriveItemIfPresent(config, trackName, 'url', 'filename', 'Google Drive file')
        if (mainItem) {
            items.push(mainItem)
        }

        // Check index file URL
        const indexItem = this.#createGoogleDriveItemIfPresent(config, `${trackName} index`, 'indexURL', 'indexFilename', 'Google Drive index file')
        if (indexItem) {
            items.push(indexItem)
        }

        return items
    }

    #extractProblematicResources(trackConfigurations: TrackConfig[], localSampleInfoFiles: string[] = [], googleDriveSampleInfoFiles: { trackName: string; fileName: string }[] = []): { localFileItems: { trackName: string; fileName: string }[]; googleDriveItems: { trackName: string; fileName: string }[] } {
        const localFileItems: { trackName: string; fileName: string }[] = []
        const googleDriveItems: { trackName: string; fileName: string }[] = []

        // Collect local files from track configurations
        for (const config of trackConfigurations) {
            const trackName = config.name || 'Unnamed track'
            if (config.file) {
                localFileItems.push({
                    trackName: trackName,
                    fileName: config.file
                })
            }
            if (config.indexFile) {
                localFileItems.push({
                    trackName: `${trackName} index`,
                    fileName: config.indexFile
                })
            }
        }

        // Add sample info local files
        for (const fileName of localSampleInfoFiles) {
            localFileItems.push({
                trackName: 'Sample info',
                fileName: fileName
            })
        }

        // Collect Google Drive files by checking if url/indexURL fields contain Google Drive URLs
        for (const config of trackConfigurations) {
            const items = this.#extractGoogleDriveItemsFromConfig(config)
            googleDriveItems.push(...items)
        }

        // Add sample info Google Drive files
        googleDriveItems.push(...googleDriveSampleInfoFiles)

        return { localFileItems, googleDriveItems }
    }

    _validateAndWarnResources(json: SessionObject): void {
        // 1. Validate reference genome (blocking errors)
        const refErrors: string[] = []
        const reference = json.reference as Record<string, any> | undefined

        if (reference?.fastaURL) {
            if (isLocalFile(reference.fastaURL)) {
                refErrors.push(`Local file: ${reference.fastaURL.name}`)
            } else if (isGoogleDriveURL(reference.fastaURL)) {
                refErrors.push(`Google Drive URL: ${reference.fastaURL}`)
            }
        }

        if (reference?.indexURL) {
            if (isLocalFile(reference.indexURL)) {
                refErrors.push(`Local file: ${reference.indexURL.name}`)
            } else if (isGoogleDriveURL(reference.indexURL)) {
                refErrors.push(`Google Drive URL: ${reference.indexURL}`)
            }
        }

        if (refErrors.length > 0) {
            throw new Error(
                `Error: Sessions cannot include the following resources in the reference genome:\n` +
                refErrors.map(err => `  - ${err}`).join('\n') + '\n' +
                `These resources require local access or authentication and will not work when the session is shared.`
            )
        }

        // 2. Collect warnings from tracks and sample info
        const localSampleInfoFiles: string[] = []
        const googleDriveSampleInfoFiles: { trackName: string; fileName: string }[] = []

        // Check sample info
        if (this.config.sampleinfo) {
            for (const path of this.sampleInfo.sampleInfoFiles) {
                const config = TrackBase.prepareConfigForSession({url: path})
                if (config.file) {
                    localSampleInfoFiles.push(config.file)
                }
                // Check if the url field contains a Google Drive URL
                const googleDriveItem = this.#createGoogleDriveItemIfPresent(config, 'Sample info', 'url', 'filename', 'Google Drive file')
                if (googleDriveItem) {
                    googleDriveSampleInfoFiles.push(googleDriveItem)
                }
            }
        }

        // Extract problematic resources from tracks
        const { localFileItems, googleDriveItems } = this.#extractProblematicResources(
            json.tracks || [],
            localSampleInfoFiles,
            googleDriveSampleInfoFiles
        )

        // 3. Display consolidated warning if any issues found
        if (localFileItems.length > 0 || googleDriveItems.length > 0) {
            let message = 'Local and Google Drive files cannot be loaded automatically when a saved session is restored. This session saves references to the following file(s) that will not be restored.\n\n'

            // Add local file items
            for (const item of localFileItems) {
                message += `Local file name: ${item.fileName}\n`
                message += `Track name: ${item.trackName}\n\n`
            }

            // Add Google Drive items
            for (const item of googleDriveItems) {
                message += `Google Drive file name: ${item.fileName}\n`
                message += `Track name: ${item.trackName}\n\n`
            }

            alert(message)
        }
    }

    compressedSession(): string {
        const json = JSON.stringify(this.toJSON())
        return BGZip.compressString(json)
    }

    sessionURL(): string {
        const path = window.location.href.slice()
        const idx = path.indexOf("?")
        const surl = (idx > 0 ? path.substring(0, idx) : path) + "?sessionURL=blob:" + this.compressedSession()
        return surl
    }

    mouseDownOnViewport(e: MouseEvent | TouchEvent, viewport: TrackViewport): void {

        var coords: { x: number; y: number }
        coords = DOMUtils.pageCoordinates(e)
        this.vpMouseDown = {
            viewport,
            lastMouseX: coords.x,
            mouseDownX: coords.x,
            lastMouseY: coords.y,
            mouseDownY: coords.y,
            referenceFrame: viewport.referenceFrame
        }
    }


    cancelTrackPan(): void {

        const dragObject = this.dragObject
        this.dragObject = undefined
        this.isScrolling = false
        this.vpMouseDown = undefined

        if (dragObject && dragObject.viewport.referenceFrame.start !== dragObject.start) {
            this.updateViews()
            this.fireEvent('trackdragend', [dragObject.viewport])
        }
    }

    isTrackPanning(): DragObject | undefined {
        return this.dragObject
    }

    isSoftclipped(): boolean {
        const result = this.trackViews.find((tv: TrackView) => tv.track.showSoftClips === true)
        return result !== undefined
    }


    startTrackDrag(trackView: TrackView): void {

        this.dragTrack = trackView

    }

    updateTrackDrag(dragDestination: TrackView): void {

        if (dragDestination && this.dragTrack) {

            const dragged = this.dragTrack
            const indexDestination = this.trackViews.indexOf(dragDestination)
            const indexDragged = this.trackViews.indexOf(dragged)
            const trackViews = this.trackViews

            trackViews[indexDestination] = dragged
            trackViews[indexDragged] = dragDestination

            const newOrder = this.trackViews[indexDestination].track.order
            this.trackViews[indexDragged].track.order = newOrder

            const nTracks = trackViews.length
            let lastOrder = newOrder

            if (indexDestination < indexDragged) {
                // Displace tracks below

                for (let i = indexDestination + 1; i < nTracks; i++) {
                    const track = trackViews[i].track
                    if (track.order! <= lastOrder!) {
                        track.order = Math.min(Number.MAX_SAFE_INTEGER, lastOrder! + 1)
                        lastOrder = track.order
                    } else {
                        break
                    }
                }
            } else {
                // Displace tracks above.  First track (index 0) is "ruler"
                for (let i = indexDestination - 1; i > 0; i--) {
                    const track = trackViews[i].track
                    if (track.order! >= lastOrder!) {
                        track.order = Math.max(-Number.MAX_SAFE_INTEGER, lastOrder! - 1)
                        lastOrder = track.order
                    } else {
                        break
                    }
                }
            }
            this.reorderTracks()
        }
    }

    endTrackDrag(): void {
        if (this.dragTrack) {
            this.dragTrack = undefined
            this.fireEvent('trackorderchanged', [this.getTrackOrder()])
        } else {
            this.dragTrack = undefined
        }
    }

    addEventHandlers(): void {
        this.addWindowResizeHandler()
        this.addRootMouseUpHandler()
        this.addRootMouseLeaveHandler()
        this.addColumnContainerEventHandlers()
        this.addKeyboardHandler()
    }

    removeEventHandlers(): void {
        this.removeWindowResizeHandler()
        this.removeRootMouseUpHandler()
        this.removeRootMouseLeaveHandler()
        this.removeColumnContainerEventHandlers()
        this.removeKeyboardHandler()
    }

    addWindowResizeHandler(): void {
        // Create a copy of the prototype "resize" function bound to this instance.  Neccessary to support removing.
        this.boundWindowResizeHandler = resize.bind(this)
        window.addEventListener('resize', this.boundWindowResizeHandler)
    }

    removeWindowResizeHandler(): void {
        window.removeEventListener('resize', this.boundWindowResizeHandler)
    }

    addRootMouseUpHandler(): void {
        this.boundRootMouseUpHandler = mouseUpOrLeave.bind(this)
        this.root.addEventListener('mouseup', this.boundRootMouseUpHandler)
    }

    removeRootMouseUpHandler(): void {
        this.root.removeEventListener('mouseup', this.boundRootMouseUpHandler)
    }

    addRootMouseLeaveHandler(): void {
        this.boundRootMouseLeaveHandler = mouseUpOrLeave.bind(this)
        this.root.addEventListener('mouseleave', this.boundRootMouseLeaveHandler)
    }

    removeRootMouseLeaveHandler(): void {
        this.root.removeEventListener('mouseleave', this.boundRootMouseLeaveHandler)
    }

    addColumnContainerEventHandlers(): void {
        this.boundColumnContainerMouseMoveHandler = handleMouseMove.bind(this)
        this.boundColumnContainerTouchMoveHandler = handleMouseMove.bind(this)
        this.boundColumnContainerMouseLeaveHandler = mouseUpOrLeave.bind(this)
        this.boundColumnContainerMouseUpHandler = mouseUpOrLeave.bind(this)
        this.boundColumnContainerTouchEndHandler = mouseUpOrLeave.bind(this)

        this.columnContainer.addEventListener('mousemove', this.boundColumnContainerMouseMoveHandler)
        this.columnContainer.addEventListener('touchmove', this.boundColumnContainerTouchMoveHandler)

        this.columnContainer.addEventListener('mouseleave', this.boundColumnContainerMouseLeaveHandler)

        this.columnContainer.addEventListener('mouseup', this.boundColumnContainerMouseUpHandler)
        this.columnContainer.addEventListener('touchend', this.boundColumnContainerTouchEndHandler)
    }

    removeColumnContainerEventHandlers(): void {
        this.columnContainer.removeEventListener('mousemove', this.boundColumnContainerMouseMoveHandler)
        this.columnContainer.removeEventListener('touchmove', this.boundColumnContainerTouchMoveHandler)

        this.columnContainer.removeEventListener('mouseleave', this.boundColumnContainerMouseLeaveHandler)

        this.columnContainer.removeEventListener('mouseup', this.boundColumnContainerMouseUpHandler)
        this.columnContainer.removeEventListener('touchend', this.boundColumnContainerTouchEndHandler)
    }

    addKeyboardHandler(): void {
        this.keyUpHandler = keyUpHandler.bind(this)
        document.addEventListener("keyup", this.keyUpHandler)
    }

    removeKeyboardHandler(): void {
        console.log("Remove handler")
        document.addEventListener("keyup", this.keyUpHandler)
    }


    static uncompressSession(url: string): string {

        let bytes: any
        if (url.indexOf('/gzip;base64') > 0) {
            //Proper dataURI
            bytes = BGZip.decodeDataURI(url)
            let json = ''
            for (let b of bytes) {
                json += String.fromCharCode(b)
            }
            return json
        } else {

            let enc = url.substring(5)
            return BGZip.uncompressString(enc)
        }
    }

    createCircularView(container: HTMLElement, show?: boolean): any {
        show = show === true   // convert undefined to boolean
        this.circularView = createCircularView(container, this)
        this.circularViewControl = new CircularViewControl(this.navbar.toggleButtonContainer, this)
        this.circularView.setAssembly({
            name: this.genome.id,
            id: this.genome.id,
            chromosomes: makeCircViewChromosomes(this.genome)
        })
        this.circularViewVisible = show
        return this.circularView
    }

    get circularViewVisible(): boolean {
        return this.circularView !== undefined && this.circularView.visible
    }

    set circularViewVisible(isVisible: boolean) {
        if (this.circularView) {
            this.circularView.visible = isVisible
            this.circularViewControl?.setState(isVisible)
        }
    }

    // Navbar delegates
    get overlayTrackButton(): any {
        return this.navbar.overlayTrackButton
    }

    get roiTableControl(): any {
        return this.navbar.roiTableControl
    }

    get sampleNameControl(): any {
        return this.navbar.sampleNameControl
    }

    get sampleInfoControl(): any {
        return this.navbar.sampleInfoControl
    }

    async blat(sequence: string): Promise<any> {
        return createBlatTrack({sequence, browser: this, name: 'Blat', title: 'Blat'})
    }

    startSpinner(): void {
        if (this.spinnerElement) {
            this.spinnerElement.style.display = 'flex'
        }
    }

    stopSpinner(): void {
        if (this.spinnerElement) {
            this.spinnerElement.style.display = 'none'
        }
    }

}

function

getFileExtension(input: File | string): string {
    let fileName: string

    // Check if input is a File object or a URL string
    if (input instanceof File) {
        fileName = input.name
    } else if (typeof input === 'string') {
        fileName = input
    } else {
        throw new Error('Input must be a File object or a URL string')
    }

    // Extract the file extension
    const fileExtension = fileName.split('.').pop()!

    // If the URL is from Dropbox, the extension may be followed by a query string
    // Remove the query string, if present
    const cleanFileExtension = fileExtension.split('?')[0]

    return cleanFileExtension
}

async function

resize(this: Browser, event?: Event): Promise<void> {

    if (undefined === this.referenceFrameList || 0 === this.referenceFrameList.length) {
        return
    }

    const viewportWidth = this.calculateViewportWidth(this.referenceFrameList.length)
    this.updateReferenceFrames(viewportWidth)
    this.updateViewportElements(viewportWidth)
    await this.syncUIState()
}


function

handleMouseMove(this: Browser, e: Event): void {

    e.preventDefault()

    const {x, y} = DOMUtils.pageCoordinates(e as MouseEvent | TouchEvent)

    if (this.vpMouseDown) {

        const {viewport, referenceFrame} = this.vpMouseDown

        // Determine direction,  true == horizontal
        const horizontal = Math.abs((x - this.vpMouseDown.mouseDownX)) > Math.abs((y - this.vpMouseDown.mouseDownY))

        if (!this.dragObject && !this.isScrolling) {
            if (horizontal) {
                if (this.vpMouseDown.mouseDownX && Math.abs(x - this.vpMouseDown.mouseDownX) > this.constants.dragThreshold) {
                    this.dragObject = {viewport, start: referenceFrame.start}
                }
            } else {
                if (this.vpMouseDown.mouseDownY &&
                    Math.abs(y - this.vpMouseDown.mouseDownY) > this.constants.scrollThreshold) {
                    // Scrolling => dragging track vertically
                    this.isScrolling = true
                    const viewportHeight = viewport.viewportElement.clientHeight
                    const contentHeight = viewport.trackView.maxViewportContentHeight()
                    this.vpMouseDown.r = viewportHeight / contentHeight
                }
            }
        }

        if (this.dragObject) {
            const clampDrag = !this.isSoftclipped()
            let deltaX = this.vpMouseDown.lastMouseX - x
            const viewChanged = referenceFrame.shiftPixels(deltaX, viewport.viewportElement.clientWidth, clampDrag)
            if (viewChanged) {
                this.updateViews()
            }
            this.fireEvent('trackdrag', [e])
        }


        if (this.isScrolling) {
            const delta = (this.vpMouseDown.lastMouseY - y)
            viewport.trackView.scrollByPixels(delta)
        }


        this.vpMouseDown.lastMouseX = x
        this.vpMouseDown.lastMouseY = y
    }
}

function

mouseUpOrLeave(this: Browser, e: Event): void {
    this.cancelTrackPan()
    this.endTrackDrag()
}

async function

keyUpHandler(this: Browser, event: KeyboardEvent): Promise<void> {

    // Feature jumping disabled in multi-locus view
    if (!this.referenceFrameList || this.referenceFrameList.length > 1) return

    if (event.code === 'KeyF' || event.code === 'KeyB') {

        const selectedTrackViews = this.getSelectedTrackViews()

        if (selectedTrackViews.length > 0) {

            const track = selectedTrackViews[0].track

            if (typeof track.nextFeatureAfter === 'function') {

                const referenceFrame = this.referenceFrameList[0]
                const viewportWidth = referenceFrame.viewport ? referenceFrame.viewport.getWidth() : this.calculateViewportWidth(this.referenceFrameList.length)


                // Check visibility window
                const isWGV = 'all' === referenceFrame.chr.toLowerCase()
                const vizWindow = track.visibilityWindow
                if (isWGV || (vizWindow && vizWindow > 0 && referenceFrame.bpPerPixel * viewportWidth > vizWindow)) {
                    return
                }


                const direction = 'KeyF' === event.code
                const chr = referenceFrame.chr
                const center = referenceFrame.center
                const nextFeature = await track.nextFeatureAfter(chr, center, direction)
                if (nextFeature) {
                    const nextChr = await this.genome.getChromosomeName(nextFeature.chr)
                    if (chr === nextChr) {

                        // On same chromoeoms
                        const newCenter = (nextFeature.start + nextFeature.end) / 2
                        if (event.shiftKey) {

                            // Zoom to next feature with 10% buffer
                            const minimumBases = this.config.minimumBases || 40
                            const extent = Math.max(minimumBases, 1.1 * (nextFeature.end - nextFeature.start))
                            referenceFrame.start = Math.max(0, newCenter - extent / 2)
                            referenceFrame.end = newCenter + extent / 2
                            referenceFrame.bpPerPixel = (referenceFrame.end - referenceFrame.start) / viewportWidth
                        } else {

                            // Center next feature leaving resolution unchanged
                            referenceFrame.shift(newCenter - center)
                        }
                        this.updateViews()
                    } else {

                        // Change in chromosome
                        referenceFrame.chr = nextChr
                        const newCenter = (nextFeature.start + nextFeature.end) / 2
                        if (event.shiftKey) {

                            // Zoom to next feature with 10% buffer
                            const minimumBases = this.config.minimumBases || 40
                            const extent = Math.max(minimumBases, 1.1 * (nextFeature.end - nextFeature.start))
                            referenceFrame.start = Math.max(0, newCenter - extent / 2)
                            referenceFrame.end = referenceFrame.start + extent
                            referenceFrame.bpPerPixel = (referenceFrame.end - referenceFrame.start) / viewportWidth
                        } else {

                            // Center next feature leaving resolution unchanged
                            referenceFrame.start = newCenter - (viewportWidth * referenceFrame.bpPerPixel) / 2
                            referenceFrame.end = referenceFrame.start + viewportWidth * referenceFrame.bpPerPixel
                        }
                        this.updateViews()
                    }
                }
            }
        }
    }
}

function

toggleTrackLabels(trackViews: TrackView[], isVisible: boolean): void {

    for (let {viewports} of trackViews) {
        for (let viewport of viewports) {
            const tvp = viewport as TrackViewport
            if (tvp.trackLabelElement) {
                if (0 === viewports.indexOf(viewport) && true === isVisible) {
                    tvp.trackLabelElement.style.display = 'block'
                } else {
                    tvp.trackLabelElement.style.display = 'none'
                }
            }
        }
    }
}

export default Browser
