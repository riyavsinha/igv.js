import {isSimpleType} from "./util/igvUtils.js"
import {FeatureUtils, FileUtils, StringUtils} from "../node_modules/igv-utils/src/index.js"
import {createCheckbox} from "./igv-icons.js"
import {findFeatureAfterCenter} from "./feature/featureUtils"
import {isLocalFile} from "./util/sessionResourceValidator.js"

const fixColor = (colorString: any): any => {
    if (StringUtils.isString(colorString)) {
        return (colorString.indexOf(",") > 0 && !(colorString.startsWith("rgb(") || colorString.startsWith("rgba("))) ?
            `rgb(${colorString})` : colorString
    } else {
        return colorString
    }
}

class TrackBase {

    // Index signature for dynamic property access from config merging and subclasses
    // Must be declared before static fields for TS 6.0 compatibility
    [key: string]: any

    static defaultColor: string = 'rgb(150,150,150)'

    static defaults: Record<string, any> = {
        height: 50,
        autoHeight: false,
        visibilityWindow: undefined,
        color: undefined,
        altColor: undefined,
        supportHiDPI: true,
        selected: false
    }

    // Explicit class field declarations
    declare browser: any
    declare config: any
    declare _name: string | undefined
    declare url: any
    declare type: string | undefined
    declare id: any
    declare order: any
    declare autoscaleGroup: any
    declare removable: boolean | undefined
    declare minHeight: number | undefined
    declare maxHeight: number | undefined
    declare autoHeight: boolean | undefined
    declare visibilityWindow: any
    declare altColor: any
    declare supportHiDPI: boolean | undefined
    declare selected: boolean | undefined
    declare onclick: any
    declare _initialColor: any
    declare _initialAltColor: any
    declare featureSource: any
    declare autoscale: any
    declare dataRange: any
    declare graphType: any
    declare displayMode: string | undefined
    declare disposed: boolean | undefined
    declare viewLimitMin: number | undefined
    declare viewLimitMax: number | undefined
    declare _filter: any

    constructor(config: any, browser: any) {
        this.browser = browser
        this.init(config)
    }

    init(config: any): void {

        this.config = config

        if (config.displayMode) {
            config.displayMode = config.displayMode.toUpperCase()
        }

        // Base default settings
        const defaults: Record<string, any> = Object.assign({}, TrackBase.defaults)

        // Overide with class specific default settings
        if ((this.constructor as any).defaults) {
            for (let key of Object.keys((this.constructor as any).defaults)) {
                defaults[key] = (this.constructor as any).defaults[key]
            }
        }

        for (let key of Object.keys(defaults)) {
            this[key] = config.hasOwnProperty(key) ? config[key] : defaults[key]
            if ((key === 'color' || key === 'altColor') && this[key]) {
                this[key] = fixColor(this[key])
            }
        }

        // this._initialColor = this.color || this.constructor.defaultColor
        // this._initialAltColor = this.altColor || this.constructor.defaultColor

        if (config.name || config.label) {
            this.name = config.name || config.label
        } else if (FileUtils.isFile(config.url)) {
            this.name = config.url.name
        } else if (StringUtils.isString(config.url) && !config.url.startsWith("data:")) {
            this.name = FileUtils.getFilename(config.url)
        }

        this.url = config.url
        if (this.config.type) this.type = this.config.type
        this.id = this.config.id === undefined ? this.name : this.config.id
        this.order = config.order
        this.autoscaleGroup = config.autoscaleGroup
        this.removable = config.removable === undefined ? true : config.removable      // Defaults to true
        this.minHeight = config.minHeight || Math.min(25, this.height)
        this.maxHeight = config.maxHeight || Math.max(1000, this.height)

        if (config.onclick) {
            this.onclick = config.onclick
            config.onclick = undefined   // functions cannot be saved in sessions, clear it here.
        }

        if (config.description) {
            // Override description -- displayed when clicking on track label.  Convert to function if neccessary
            if (typeof config.description === 'function') {
                this.description = config.description
            } else {
                this.description = () => config.description
            }
        }
    }

    async postInit(): Promise<TrackBase> {

        this._initialColor = this.color || (this.constructor as any).defaultColor
        this._initialAltColor = this.altColor || (this.constructor as any).defaultColor
        return this
    }

    get name(): string | undefined {
        return this._name
    }

    set name(name: string | undefined) {
        this._name = name
        if (this.trackView) {
            this.trackView.setTrackLabelName(name)
        }
    }

    clearCachedFeatures(): void {
        if (this.trackView) {
            this.trackView.clearCachedFeatures()
        }
    }

    updateViews(): void {
        if (this.trackView) {
            this.trackView.updateViews()
        }
    }

    repaintViews(): void {
        if (this.trackView) {
            this.trackView.repaintViews()
        }
    }

    getState(): Record<string, any> {

        const isJSONable = (item: any): boolean => !(item === undefined || typeof item === 'function' || item instanceof Promise)

        // Create copy of config, minus transient properties (convention is name starts with '_').  Also, all
        // function properties are transient as they cannot be saved in json
        const state: Record<string, any> = {}

        const jsonableConfigKeys = Object.keys(this.config).filter((key: string) => isJSONable(this.config[key]))

        for (const key of jsonableConfigKeys) {
            if (!key.startsWith("_")) {
                state[key] = this.config[key]
            }
        }

        // Update original config values with any changes
        for (let key of Object.keys(state)) {
            if (key.startsWith("_")) continue   // transient property
            const value = this[key]
            if (value !== undefined && (isSimpleType(value) || typeof value === "boolean" || key === "metadata")) {
                state[key] = value
            }
        }

        // If user has changed other properties from defaults update state.
        const defs: Record<string, any> = Object.assign({}, TrackBase.defaults)
        if ((this.constructor as any).defaults) {
            for (let key of Object.keys((this.constructor as any).defaults)) {
                defs[key] = (this.constructor as any).defaults[key]
            }
        }
        for (let key of Object.keys(defs)) {
            if (undefined !== this[key] && defs[key] !== this[key]) {
                state[key] = this[key]
            }
        }

        // Flatten dataRange if present
        if (!this.autoscale && this.dataRange) {
            state.min = this.dataRange.min
            state.max = this.dataRange.max
        }

        if (this.autoscaleGroup) {
            state.autoscaleGroup = this.autoscaleGroup
        }

        return state
    }

    get supportsWholeGenome(): boolean {
        return this.config.supportsWholeGenome === true
    }

    hasSamples(): boolean {
        return false
    }

    getGenomeId(): string | undefined {
        return this.browser.genome ? this.browser.genome.id : undefined
    }

    setTrackProperties(properties: Record<string, any>): void {

        if (this.disposed) return   // This track was removed during async load

        const tracklineConfg: Record<string, any> = {}
        let tokens: string[]
        for (let key of Object.keys(properties)) {
            switch (key.toLowerCase()) {
                case "usescore":
                    tracklineConfg.useScore = (
                        properties[key] === 1 || properties[key] === "1" || properties[key] === "on" || properties[key] === true)
                    break
                case "visibility":
                    //0 - hide, 1 - dense, 2 - full, 3 - pack, and 4 - squish
                    switch (properties[key]) {
                        case "2":
                        case "3":
                        case "pack":
                        case "full":
                            tracklineConfg.displayMode = "EXPANDED"
                            break
                        case "4":
                        case "squish":
                            tracklineConfg.displayMode = "SQUISHED"
                            break
                        case "1":
                        case "dense":
                            tracklineConfg.displayMode = "COLLAPSED"
                    }
                    break
                case "color":
                case "altcolor":
                    tracklineConfg[key] = properties[key].startsWith("rgb(") ? properties[key] : "rgb(" + properties[key] + ")"
                    break
                case "featurevisiblitywindow":
                case "visibilitywindow":
                    tracklineConfg.visibilityWindow = Number.parseInt(properties[key])
                    break
                case "maxheightpixels":
                    tokens = properties[key].split(":")
                    if (tokens.length === 3) {
                        tracklineConfg.minHeight = Number.parseInt(tokens[2])
                        tracklineConfg.height = Number.parseInt(tokens[1])
                        tracklineConfg.maxHeight = Number.parseInt(tokens[0])
                    }
                    break
                case "viewlimits":
                    if (!this.config.autoscale && !this.config.max) {   //config has precedence
                        tokens = properties[key].split(":")
                        let min = 0
                        let max: number
                        if (tokens.length == 1) {
                            max = Number(tokens[0])
                        } else if (tokens.length == 2) {
                            min = Number(tokens[0])
                            max = Number(tokens[1])
                        }
                        if (Number.isNaN(max!) || Number.isNaN(min)) {
                            console.warn(`Unexpected viewLimits value in track line: ${properties["viewLimits"]}`)
                        } else {
                            tracklineConfg.autoscale = false
                            tracklineConfg.dataRange = {min, max}
                            this.viewLimitMin = min
                            this.viewLimitMax = max
                        }
                    }
                case "name":
                    tracklineConfg[key] = properties[key]
                    break
                case "url":
                    tracklineConfg["infoURL"] = properties[key]
                    break
                case "type":
                    const v = properties[key]
                    if (UCSCTypeMappings.has(v)) {
                        tracklineConfg[key] = UCSCTypeMappings.get(v)
                    } else {
                        tracklineConfg[key] = v
                    }
                    break
                case "graphtype":
                    tracklineConfg["graphType"] = properties[key]
                    break
                default:
                    tracklineConfg[key] = properties[key]
            }
        }

        // Track configuration objects have precedence over track line properties in general.  The "name" property
        // is an exception if it was derived and not explicitly entered (that is derived from the web app from filename).
        for (let key of Object.keys(tracklineConfg)) {

            if (!this.config.hasOwnProperty(key) || (key === "name" && this.config._derivedName)) {
                let value = tracklineConfg[key]
                if ("true" === value) value = true
                if ("false" === value) value = false

                this[key] = value
                if (key === "height" && this.trackView) {
                    try {
                        const h = Number.parseInt(value)
                        this.trackView.setTrackHeight(h)
                    } catch (e) {
                        console.error(e)
                    }
                }
            }
        }
    }

    clickedFeatures(clickState: any): any[] {

        // We use the cached features rather than method to avoid async load.  If the
        // feature is not already loaded this won't work,  but the user wouldn't be mousing over it either.
        const features = clickState.viewport.cachedFeatures

        if (!features || !Array.isArray(features) || features.length === 0) {
            return []
        }

        const genomicLocation = clickState.genomicLocation

        // When zoomed out we need some tolerance around genomicLocation
        const tolerance = (clickState.referenceFrame.bpPerPixel > 0.2) ? 3 * clickState.referenceFrame.bpPerPixel : 0.2
        const ss = genomicLocation - tolerance
        const ee = genomicLocation + tolerance
        return (FeatureUtils.findOverlapping(features, ss, ee))
    }

    extractPopupData(feature: any, genomeId?: string): any[] {

        const filteredProperties = new Set(['row', 'color', 'chr', 'start', 'end', 'cdStart', 'cdEnd', 'strand', 'alpha'])
        const data: any[] = []

        let alleles: string | undefined, alleleFreqs: string | undefined
        for (let property in feature) {

            if (feature.hasOwnProperty(property) &&
                !filteredProperties.has(property) &&
                isSimpleType(feature[property])) {

                let value = feature[property]
                data.push({name: StringUtils.capitalize(property), value: value})

                if (property === "alleles") {
                    alleles = feature[property]
                } else if (property === "alleleFreqs") {
                    alleleFreqs = feature[property]
                }
            }
        }

        if (alleles && alleleFreqs) {

            if (alleles.endsWith(",")) {
                alleles = alleles.substr(0, alleles.length - 1)
            }
            if (alleleFreqs.endsWith(",")) {
                alleleFreqs = alleleFreqs.substr(0, alleleFreqs.length - 1)
            }

            let a = alleles.split(",")
            let af = alleleFreqs.split(",")
            if (af.length > 1) {
                let b: {a: string, af: number}[] = []
                for (let i = 0; i < af.length; i++) {
                    b.push({a: a[i], af: Number(af[i])})
                }
                b.sort(function (x, y) {
                    return x.af - y.af
                })

                let ref = b[b.length - 1].a
                if (ref.length === 1) {
                    for (let i = b.length - 2; i >= 0; i--) {
                        let alt = b[i].a
                        if (alt.length === 1) {
                            if (!genomeId) genomeId = this.getGenomeId()
                            const cravatLink = TrackBase.getCravatLink(feature.chr, feature.start + 1, ref, alt, genomeId)
                            console.log(cravatLink)
                            if (cravatLink) {
                                data.push('<hr/>')
                                data.push({html: cravatLink})
                                data.push('<hr/>')
                            }
                        }
                    }
                }
            }
        }

        if (feature.attributes) {
            for (let key of Object.keys(feature.attributes)) {
                data.push({name: key, value: feature.attributes[key]})
            }
        }

        // final chr position
        let posString = `${feature.chr}:${StringUtils.numberFormatter(feature.start + 1)}-${StringUtils.numberFormatter(feature.end)}`
        if (feature.strand) {
            posString += ` (${feature.strand})`
        }

        data.push({name: 'Location', value: posString})

        return data

    }


    description(): DocumentFragment {

        const createKeyValueRow = (key: string, value: string): HTMLDivElement => {
            const row = document.createElement('div')
            row.className = 'igv-track-label-popover__row'

            const keySpan = document.createElement('span')
            keySpan.className = 'igv-track-label-popover__key'
            keySpan.textContent = key + ':'

            const valueSpan = document.createElement('span')
            valueSpan.className = 'igv-track-label-popover__value'
            valueSpan.textContent = value

            row.appendChild(keySpan)
            row.appendChild(valueSpan)
            return row
        }

        const fragment = document.createDocumentFragment()

        if (this.url) {
            if (FileUtils.isFile(this.url)) {
                fragment.appendChild(createKeyValueRow('Filename', this.url.name))
            } else {
                fragment.appendChild(createKeyValueRow('URL', this.url))
            }
        } else {
            // If no URL, just return the name as a simple text node
            const nameDiv = document.createElement('div')
            nameDiv.className = 'igv-track-label-popover__row'
            nameDiv.textContent = this.name
            fragment.appendChild(nameDiv)
            return fragment
        }

        if (this.config) {
            if (this.config.metadata) {
                for (let key of Object.keys(this.config.metadata)) {
                    const value = this.config.metadata[key]
                    fragment.appendChild(createKeyValueRow(key, value))
                }
            }

            // Add any config properties that are capitalized
            for (let key of Object.keys(this.config)) {
                if (key.startsWith("_")) continue   // transient property
                let first = key.substr(0, 1)
                if (first !== first.toLowerCase()) {
                    const value = this.config[key]
                    if (value && isSimpleType(value)) {
                        fragment.appendChild(createKeyValueRow(key, value))
                    }
                }
            }
        }

        return fragment
    }

    getColorForFeature(f: any): any {
        return (typeof this.color === "function") ? this.color(f) : this.color
    }

    numericDataMenuItems(): any[] {

        const menuItems: any[] = []

        // Data range or color scale

        if ("heatmap" !== this.graphType) {

            menuItems.push('<hr/>')

            function dialogPresentationHandler(this: TrackBase, e: any): void {

                if (this.trackView.track.selected) {
                    this.browser.dataRangeDialog.configure(this.trackView.browser.getSelectedTrackViews())
                } else {
                    this.browser.dataRangeDialog.configure(this.trackView)
                }
                this.browser.dataRangeDialog.present(e)
            }

            menuItems.push({label: 'Set data range', dialog: dialogPresentationHandler})

            if (this.logScale !== undefined) {

                function logScaleHandler(this: TrackBase): void {
                    this.logScale = !this.logScale
                    this.trackView.repaintViews()
                }

                menuItems.push({element: createCheckbox("Log scale", this.logScale), click: logScaleHandler})
            }

            function autoScaleHandler(this: TrackBase): void {
                this.autoscaleGroup = undefined
                this.autoscale = !this.autoscale
                this.browser.updateViews()
            }

            menuItems.push({element: createCheckbox("Autoscale", this.autoscale), click: autoScaleHandler})
        }

        return menuItems
    }

    setDataRange({min, max}: {min: number, max: number}): void {

        this.dataRange = {min, max}
        this.autoscale = false
        this.autoscaleGroup = undefined
        this.trackView.repaintViews()
    }

    async nextFeatureAfter(chr: string, position: number, direction: boolean): Promise<any> {
        const viewport = this.trackView.viewports[0]
        let features = viewport.cachedFeatures
        if (features && Array.isArray(features) && features.length > 0) {
            // Check chromosome, all cached features will share a chromosome
            const chrName = this.browser.genome.getChromosomeName(features[0].chr)
            if (chrName === chr) {
                const next = findFeatureAfterCenter(features, position, direction)
                if (next) {
                    return next
                }
            }
        }

        if (typeof this.featureSource.nextFeature === 'function') {
            return this.featureSource.nextFeature(chr, position, direction, this.visibilityWindow)
        }
    }

    dispose(): void {

        this.disposed = true

        // This should not be neccessary, but in case there is some unknown reference holding onto this track object,
        // for example in client code, release any resources here.
        for (let key of Object.keys(this)) {
            this[key] = undefined
        }
    }

    static getCravatLink(chr: string, position: number, ref: string, alt: string, genomeID: string | undefined): string | undefined {

        if ("hg38" === genomeID || "GRCh38" === genomeID) {

            const cravatChr = chr.startsWith("chr") ? chr : "chr" + chr
            return `<a target="_blank" href="https://run.opencravat.org/result/nocache/variant.html` +
                `?chrom=${cravatChr}&pos=${position}&ref_base=${ref}&alt_base=${alt}"><b>Cravat ${ref}->${alt}</b></a>`

        } else {
            return undefined
        }
    }

    static prepareConfigForSession(config: Record<string, any>): Record<string, any> {

        const cooked: Record<string, any> = Object.assign({}, config)
        const lut: Record<string, string> =
            {
                url: 'file',
                indexURL: 'indexFile'
            }

        // Check for local File objects and convert to filename strings
        for (const key of ['url', 'indexURL']) {
            if (cooked[key] && isLocalFile(cooked[key])) {
                cooked[lut[key]] = cooked[key].name
                delete cooked[key]
            }
        }

        return cooked
    }

    // Methods to support filtering api
    set filter(f: any) {
        this._filter = f
        this.trackView.repaintViews()
    }

    getInViewFeatures(): any[] {
        const inViewFeatures: any[] = []
        for (let viewport of this.trackView.viewports) {
            if (viewport.isVisible()) {
                const referenceFrame = viewport.referenceFrame
                const chr = referenceFrame.chr
                const start = referenceFrame.start
                const end = start + referenceFrame.toBP(viewport.getWidth())

                // We use the cached features  to avoid async load.  If the
                // feature is not already loaded it is by definition not in view.
                if (viewport.cachedFeatures) {
                    const viewFeatures = FeatureUtils.findOverlapping(viewport.cachedFeatures, start, end)
                    for (let f of viewFeatures) {
                        if (!this._filter || this._filter(f)) {
                            inViewFeatures.push(f)
                        }
                    }
                }
            }
        }
        return inViewFeatures
    }

    getFilterableAttributes(): Record<string, any> {
        return {}
    }
}

const UCSCTypeMappings: Map<string, string> = new Map([
    ["wiggle_0", "wig"],
    ["bed", "bed"],
    ["bigBed", "bigBed"],
    ["bigWig", "bigWig"]
])
export default TrackBase
