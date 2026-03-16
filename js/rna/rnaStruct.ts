import getDataWrapper from "../feature/dataWrapper"
import TrackBase from "../trackBase.js"
import IGVGraphics from "../igv-canvas.js"
import {igvxhr} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions} from "../util/igvUtils.js"
import TextFeatureSource from "../feature/textFeatureSource.js"
import ChromAliasManager from "../feature/chromAliasManager"
import FeatureCache from "../feature/featureCache"
import type {TrackConfig} from "../types/config.js"
import type Browser from "../browser.js"
import type {DrawConfiguration, ClickState} from "../types/ui.js"
import type Genome from "../genome/genome.js"
import type TrackView from "../trackView.js"

interface RnaFeature {
    chr: string
    start: number
    end: number
    startLeft?: number
    startRight?: number
    endLeft?: number
    endRight?: number
    color: string
    score: number
    description?: string
    drawState?: {
        x1: number
        y1: number
        r1: number
        x2?: number
        y2?: number
        r2?: number
        sa: number
        ea: number
    }
}

class RnaStructTrack extends TrackBase {
    // Dynamic properties set via TrackBase.init() config merging
    [key: string]: unknown

    static defaults = {
        height: 300,
        theta: Math.PI / 2,
        arcOrientation: "UP",

    }

    constructor(config: TrackConfig, browser: Browser) {

        super(config, browser)

        // Backward compatibility hack, arcOrientation was previously a boolean, now a string
        if (config.arcOrientation === false) {
            this.arcOrientation = "DOWN"
        } else if (config.arcOrientation === true) {
            this.arcOrientation = "UP"
        } else if (config.arcOrientation) {
            this.arcOrientation = (config.arcOrientation as string).toUpperCase()
        } else {
            this.arcOrientation = "UP"
        }

        if ("bp" === config.format) {
            this.featureSource = new RNAFeatureSource(config, browser.genome)
        } else {
            this.featureSource = new TextFeatureSource(config, browser.genome)
        }
    }

    async getFeatures(chr: string, start: number, end: number): Promise<RnaFeature[]> {
        const visibilityWindow = this.visibilityWindow
        return this.featureSource!.getFeatures({chr, start, end, visibilityWindow}) as Promise<RnaFeature[]>
    }

    draw(options: DrawConfiguration) {

        const ctx = options.context

        const theta = Math.PI / 2
        const pixelWidth = options.pixelWidth
        const pixelHeight = options.pixelHeight
        const bpPerPixel = options.bpPerPixel
        const bpStart = options.bpStart
        const xScale = bpPerPixel
        const orientation = "UP" === this.arcOrientation
        const trackHeight = this.height as number

        IGVGraphics.fillRect(ctx, 0, options.pixelTop, pixelWidth, pixelHeight, {'fillStyle': "rgb(255, 255, 255)"})

        const featureList = options.features as RnaFeature[] | undefined

        if (featureList) {

            // Sort by score -- draw lowest scored features first
            sortByScore(featureList, 1)

            for (let feature of featureList) {

                if (feature.startLeft) {

                    let sl = Math.round((feature.startLeft - bpStart) / xScale)
                    let sr = Math.round((feature.startRight! - bpStart) / xScale)
                    let el = Math.round((feature.endLeft! - bpStart) / xScale)
                    let er = Math.round((feature.endRight! - bpStart) / xScale)

                    ctx.fillStyle = feature.color
                    ctx.strokeStyle = feature.color
                    ctx.beginPath()

                    // First arc
                    let x1 = (sl + er) / 2
                    let r1 = (er - sl) / 2
                    let y1 = trackHeight
                    let sa = Math.PI + (Math.PI / 2 - theta)
                    let ea = 2 * Math.PI - (Math.PI / 2 - theta)

                    if (orientation) {
                        ctx.arc(x1, y1, r1, sa, ea)
                        ctx.lineTo(el, y1)
                    } else {
                        y1 = 0
                        ctx.arc(x1, y1, r1, ea, sa)
                        ctx.lineTo(er, y1)
                    }

                    // Second arc
                    const x2 = (sr + el) / 2
                    const r2 = (el - sr) / 2
                    const y2 = y1                        // Only for theta == pi/2

                    if (orientation) {
                        ctx.arc(x2, y2, r2, ea, sa, true)
                        ctx.lineTo(sl, y2)
                    } else {
                        ctx.arc(x2, y2, r2, sa, ea, true)
                        ctx.lineTo(el, y2)
                    }

                    ctx.stroke()
                    ctx.fill()

                    feature.drawState = {x1: x1, y1: y1, r1: r1, x2: x2, y2: y2, r2: r2, sa: sa, ea: ea}
                } else {
                    let s = Math.round((feature.start - bpStart) / xScale)
                    let e = Math.round((feature.end - bpStart) / xScale)

                    ctx.strokeStyle = feature.color

                    ctx.beginPath()

                    // First arc
                    let x = (s + e) / 2
                    let r = (e - s) / 2
                    let y = trackHeight
                    let sa = Math.PI + (Math.PI / 2 - theta)
                    let ea = 2 * Math.PI - (Math.PI / 2 - theta)

                    if (orientation) {
                        ctx.arc(x, y, r, sa, ea)
                    } else {
                        y = 0
                        ctx.arc(x, y, r, ea, sa)
                    }

                    ctx.stroke()

                    feature.drawState = {x1: x, y1: y, r1: r, sa: sa, ea: ea}

                }

            }
        }
    }

    clickedFeatures(clickState: ClickState): RnaFeature[] {

        const features = super.clickedFeatures(clickState) as RnaFeature[]

        const clicked: RnaFeature[] = []

        // Sort by score in descending order   (opposite order than drawn)
        sortByScore(features, -1)

        for (let f of features) {
            const ds = f.drawState!

            // Distance from arc radius, or outer arc for type ".bp"
            const dx1 = (clickState.canvasX - ds.x1)
            const dy1 = (clickState.canvasY - ds.y1)
            const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
            const outerLim = ds.r1 + 3


            let d2
            let innerLim
            if (ds.x2 === undefined) {
                d2 = d1
                innerLim = ds.r1 - 3

            } else {
                const dx2 = (clickState.canvasX - ds.x2)
                const dy2 = (clickState.canvasY - ds.y2!)
                d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
                innerLim = ds.r2! - 3
            }


            // Between outer and inner arcs, with some tolerance
            if (d1 < outerLim && d2 > innerLim) {
                clicked.push(f)
                break
            }
        }
        return clicked
    }

    popupData(clickState: ClickState, features?: RnaFeature[]) {

        if (features === undefined) features = this.clickedFeatures(clickState)

        if (features && features.length > 0) {

            return this.extractPopupData(features[0], this.getGenomeId())

        }
    }

    menuItemList() {
        return [
            {
                name: "Toggle arc direction",
                click: function toggleArcDirectionHandler(this: RnaStructTrack) {
                    this.arcOrientation = "UP" === this.arcOrientation ? "DOWN" : "UP"
                    ;(this.trackView as TrackView).repaintViews()
                }
            }
        ]
    }
}

function sortByScore(featureList: RnaFeature[], direction: number): void {

    featureList.sort(function (a, b) {
        const s1 = a.score === undefined ? -Number.MAX_VALUE : a.score
        const s2 = b.score === undefined ? -Number.MAX_VALUE : b.score
        const d = direction === undefined ? 1 : direction

        return d * (s1 - s2)
    })
}


class RNAFeatureSource {
    config: TrackConfig
    genome: Genome
    chromAliasManager?: ChromAliasManager
    featureCache?: FeatureCache

    constructor(config: TrackConfig, genome: Genome) {
        this.config = config
        this.genome = genome
    }

    async getFeatures({chr, start, end}: { chr: string, start: number, end: number, bpPerPixel?: number, visibilityWindow?: number }): Promise<RnaFeature[] | null> {

        if (!this.featureCache) {

            const options = buildOptions(this.config)

            const data = await igvxhr.loadByteArray(this.config.url as string, options)

            if (!data) return null

            const dataWrapper = getDataWrapper(data)

            let header = true
            let line
            const colors: string[] = []
            const descriptors: string[] = []
            const features: RnaFeature[] = []
            const chrNames = new Set<string>()

            while ((line = dataWrapper.nextLine()) !== undefined) {

                const tokens = line.split('\t')

                if (header && line.startsWith("color:")) {
                    const color = "rgb(" + tokens[1] + "," + tokens[2] + "," + tokens[3] + ")"
                    colors.push(color)
                    if (tokens.length > 4) {
                        descriptors.push(tokens[4])
                    }
                    // TODO - use label
                } else {
                    header = false

                    const chr = tokens[0]
                    const startLeftNuc = Number.parseInt(tokens[1]) - 1
                    const startRightNuc = Number.parseInt(tokens[2]) - 1
                    const endLeftNuc = Number.parseInt(tokens[3])
                    const endRightNuc = Number.parseInt(tokens[4])
                    const colorIdx = Number.parseInt(tokens[5])
                    const color = colors[colorIdx]

                    let startLeft: number, startRight: number, endLeft: number, endRight: number
                    if (startLeftNuc <= endRightNuc) {
                        startLeft = Math.min(startLeftNuc, startRightNuc)
                        startRight = Math.max(startLeftNuc, startRightNuc)
                        endLeft = Math.min(endLeftNuc, endRightNuc)
                        endRight = Math.max(endLeftNuc, endRightNuc)
                    } else {
                        startLeft = Math.min(endLeftNuc, endRightNuc)
                        startRight = Math.max(endLeftNuc, endRightNuc)
                        endLeft = Math.min(startLeftNuc, startRightNuc)
                        endRight = Math.max(startLeftNuc, startRightNuc)
                    }

                    const feature: RnaFeature = {
                        chr,
                        start: startLeft,
                        end: endRight,
                        startLeft,
                        startRight,
                        endLeft,
                        endRight,
                        color,
                        score: colorIdx,
                        description: descriptors.length > colorIdx ? descriptors[colorIdx] : undefined
                    }

                    chrNames.add(chr)
                    features.push(feature)
                }
            }

            this.chromAliasManager = new ChromAliasManager(Array.from(chrNames), this.genome)

            this.featureCache = new FeatureCache(features)

        }

        const queryChr = this.chromAliasManager ? await this.chromAliasManager.getAliasName(chr) : chr

        return this.featureCache.queryFeatures(queryChr, start, end) as RnaFeature[]


    }
}

export default RnaStructTrack
