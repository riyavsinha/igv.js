import paintAxis from "../util/paintAxis.js"
import {IGVColor, StringUtils} from "../../node_modules/igv-utils/src/index.js"
import IGVGraphics from "../igv-canvas.js"
import {drawModifications} from "./mods/baseModificationCoverageRenderer.js"
import {HGVS} from "../genome/hgvs.js"
import {ClinVar} from "../genome/clinVar"

const DEFAULT_COVERAGE_COLOR: string = "rgb(150, 150, 150)"

interface DataRange {
    min: number
    max: number
}

class CoverageTrack {

    featureType: string
    parent: any
    featureSource: any
    paintAxis: any
    top: number
    autoscale: boolean
    color: string | undefined
    dataRange: DataRange | undefined
    logScale: boolean | undefined

    constructor(config: any, parent: any) {
        this.featureType = 'numeric'
        this.parent = parent
        this.featureSource = parent.featureSource

        this.paintAxis = paintAxis
        this.top = 0

        this.autoscale = config.autoscale || config.max === undefined
        if (config.coverageColor) {
            this.color = config.coverageColor
        }

        if (!this.autoscale) {
            this.dataRange = {
                min: config.min || 0,
                max: config.max
            }
        }

    }

    get height(): number {
        return this.parent.coverageTrackHeight
    }

    get browser(): any {
        return this.parent.browser
    }

    draw(options: any): void {

        const pixelTop: number = options.pixelTop
        const pixelBottom: number = pixelTop + options.pixelHeight
        const nucleotideColors: any = this.browser.nucleotideColors

        if (pixelTop > this.height) {
            return //scrolled out of view
        }

        const ctx: CanvasRenderingContext2D = options.context
        const alignmentContainer: any = options.features
        const coverageMap: any = alignmentContainer.coverageMap

        let sequence: string | undefined
        if (coverageMap.refSeq) {
            sequence = coverageMap.refSeq.toUpperCase()
        }

        const bpPerPixel: number = options.bpPerPixel
        const bpStart: number = options.bpStart
        const pixelWidth: number = options.pixelWidth
        const bpEnd: number = bpStart + pixelWidth * bpPerPixel + 1

        // paint for all coverage buckets
        // If alignment track color is != default, use it
        let color: string
        if (this.color) {
            color = this.color
        } else if (this.parent.color && typeof this.parent.color !== "function") {
            color = IGVColor.darkenLighten(this.parent.color, -35)
        } else {
            color = DEFAULT_COVERAGE_COLOR
        }
        IGVGraphics.setProperties(ctx, {
            fillStyle: color,
            strokeStyle: color
        })

        const w: number = Math.max(1, 1.0 / bpPerPixel)
        for (let i = 0, len = coverageMap.coverage.length; i < len; i++) {

            const bp: number = (coverageMap.bpStart + i)
            if (bp < bpStart) continue
            if (bp > bpEnd) break

            const item: any = coverageMap.coverage[i]
            if (!item) continue

            const h: number = (item.total / this.dataRange!.max) * this.height
            const y: number = this.height - h
            const x: number = (bp - bpStart) / bpPerPixel


            // IGVGraphics.setProperties(ctx, {fillStyle: "rgba(0, 200, 0, 0.25)", strokeStyle: "rgba(0, 200, 0, 0.25)" });
            IGVGraphics.fillRect(ctx, x, y, w, h)
        }

        // coverage mismatch coloring -- don't try to do this in above loop, color bar will be overwritten when w<1
        if (sequence) {
            for (let i = 0, len = coverageMap.coverage.length; i < len; i++) {

                const bp: number = (coverageMap.bpStart + i)
                if (bp < bpStart) continue
                if (bp > bpEnd) break

                const item: any = coverageMap.coverage[i]
                if (!item) continue

                const h: number = (item.total / this.dataRange!.max) * this.height
                let y: number = this.height - h
                const x: number = Math.floor((bp - bpStart) / bpPerPixel)

                const refBase: string = sequence[i]

                if (this.parent.colorBy && this.parent.colorBy.startsWith("basemod")) {
                    drawModifications(ctx, x, this.height, w, h, bp, alignmentContainer, this.parent.colorBy, this.parent.baseModificationThreshold)

                } else if (item.isMismatch(refBase)) {
                    IGVGraphics.setProperties(ctx, {fillStyle: nucleotideColors[refBase]})
                    IGVGraphics.fillRect(ctx, x, y, w, h)

                    let accumulatedHeight: number = 0.0
                    for (let nucleotide of ["A", "C", "T", "G"]) {

                        const count: number = item["pos" + nucleotide] + item["neg" + nucleotide]

                        // non-logoritmic
                        const hh: number = (count / this.dataRange!.max) * this.height
                        y = (this.height - hh) - accumulatedHeight
                        accumulatedHeight += hh
                        IGVGraphics.setProperties(ctx, {fillStyle: nucleotideColors[nucleotide]})
                        IGVGraphics.fillRect(ctx, x, y, w, hh)
                    }
                }
            }
        }
    }

    getClickedObject(clickState: any): any {

        let features: any = clickState.viewport.cachedFeatures
        if (!features || features.length === 0) return

        const genomicLocation: number = Math.floor(clickState.genomicLocation)
        const coverageMap: any = features.coverageMap
        const coverageMapIndex: number = Math.floor(genomicLocation - coverageMap.bpStart)
        const coverage: any = coverageMap.coverage[coverageMapIndex]
        if (coverage) {
            return {
                reference: coverageMap.refSeq ? coverageMap.refSeq.charAt(coverageMapIndex).toUpperCase() : undefined,
                coverage: coverage,
                baseModCounts: features.baseModCounts,
                hoverText: () => coverageMap.coverage[coverageMapIndex].hoverText()
            }
        }
    }

    async popupData(clickState: any): Promise<any[] | undefined> {

        const nameValues: any[] = []

        const {reference, coverage, baseModCounts} = this.getClickedObject(clickState)
        if (coverage) {
            const genomicLocation: number = Math.floor(clickState.genomicLocation)
            const referenceFrame: any = clickState.viewport.referenceFrame

            nameValues.push(referenceFrame.chr + ":" + StringUtils.numberFormatter(1 + genomicLocation))
            nameValues.push({name: 'Total Count', value: coverage.total})
            nameValues.push('<HR/>')

            // A
            for (let b of ['A', 'C', 'G', 'T', 'N']) {
                let tmp: any = coverage[`pos${b}`] + coverage[`neg${b}`]
                tmp = tmp.toString() + " (" + Math.round((tmp / coverage.total) * 100.0) + "%, " + coverage[`pos${b}`] + "+, " + coverage[`neg${b}`] + "- )"
                nameValues.push({name: b, value: tmp})
            }

            if (coverage.del > 0) nameValues.push({name: 'DEL', value: coverage.del.toString()})
            if (coverage.ins > 0) nameValues.push({name: 'INS', value: coverage.ins.toString()})

            if (baseModCounts) {
                nameValues.push('<hr/>')
                nameValues.push(...baseModCounts.popupData(genomicLocation, this.parent.colorBy))

            }

            // HGVS annotations for variants, and ClinVar links if available
            if (reference) {
                let first: boolean = true
                for (let b of ['A', 'C', 'G', 'T']) {
                    let count: number = coverage[`pos${b}`] + coverage[`neg${b}`]
                    if (count > 0 && reference !== b) {
                        if (first) {
                            nameValues.push('<hr/>')
                            first = false
                        }
                        const hgvsNotation: string = await HGVS.createHGVSAnnotation(this.browser.genome, referenceFrame.chr, genomicLocation, reference, b)
                        const clinVarURL: string | undefined = await ClinVar.getClinVarURL(hgvsNotation)
                        if (clinVarURL) {
                            nameValues.push({
                                name: 'ClinVar',
                                value: `<a href='${clinVarURL}' target='_blank'>${hgvsNotation}</a>`
                            })
                        } else {
                            nameValues.push({name: 'HGVS', value: hgvsNotation})
                        }
                    }
                }
            }


            return nameValues

        }
    }
}

export default CoverageTrack
