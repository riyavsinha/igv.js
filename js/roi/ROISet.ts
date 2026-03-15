import FeatureSource from '../feature/featureSource.js'
import {appleCrayonRGBA, rgbaStringTokens} from '../util/colorPalletes.js'
import {computeWGFeatures} from "../feature/featureUtils"
import {IGVColor} from "../../node_modules/igv-utils/src/index.js"
import type {ROIConfig} from "../types/config.js"
import type Genome from "../genome/genome.js"
import type {GenomicFeature} from "../types/feature.js"

const appleCrayonColorName = 'nickel'

const ROI_DEFAULT_ALPHA = 1 / 16

const ROI_DEFAULT_COLOR = appleCrayonRGBA(appleCrayonColorName, ROI_DEFAULT_ALPHA)
const ROI_DEFAULT_HEADER_COLOR = 'rgb(190,190,190)'

const ROI_USER_HEADER_DEFINED_COLOR = 'rgba(155,185,129)'
const ROI_USER_DEFINED_COLOR = ROI_DEFAULT_COLOR

class ROISet {

    url: string | undefined
    name: string | undefined
    isUserDefined: boolean | undefined
    isVisible: boolean | undefined
    featureSource: any
    color: string
    headerColor: string;
    [key: string]: any

    constructor(config: ROIConfig, genome: Genome) {

        this.url = config.url

        if (config.name) {
            this.name = config.name
        }

        this.isUserDefined = config.isUserDefined

        if (config.featureSource) {
            // This is unusual, but permitted
            this.featureSource = config.featureSource
        } else if (config.features) {
            // Normalize features: use "description" as "name" if name is not already set
            for (let feature of config.features) {
                if (feature.description && !feature.name) {
                    feature.name = feature.description
                }
            }
            this.featureSource = new DynamicFeatureSource(config.features, genome)
        } else if (config.format) {
            this.featureSource = FeatureSource(config, genome)
        } else {
            throw Error('ROI configuration must define either features or file format')
        }

        if(config.color && !config.color.startsWith("rgba")) {
            config.color = IGVColor.addAlpha(config.color, ROI_DEFAULT_ALPHA)
        }

        if (true === this.isUserDefined) {
            this.color = config.color || ROI_USER_DEFINED_COLOR
            this.headerColor = ROI_USER_HEADER_DEFINED_COLOR

        } else {
            this.color = config.color || ROI_DEFAULT_COLOR
            this.headerColor = ROI_DEFAULT_HEADER_COLOR

            // Use body color with alpha pinned to 1
             const [ r, g, b, discard ] = rgbaStringTokens(this.color)!
             this.headerColor = `rgba(${ r },${ g },${ b },${ 1.0 })`
        }

        delete config.isVisible  // Deprecated

    }

    async getFeatures(chr: string, start: number, end: number): Promise<GenomicFeature[]> {
        return this.featureSource.getFeatures({chr, start, end})
    }

    async getAllFeatures(): Promise<Record<string, GenomicFeature[]>> {
        return typeof this.featureSource.getAllFeatures === 'function' ? await this.featureSource.getAllFeatures() : {}
    }

    addFeature(feature: GenomicFeature): void {
        this.featureSource.addFeature(feature)
    }

    removeFeature(feature: GenomicFeature): void {
        this.featureSource.removeFeature(feature)
    }

    toJSON(): ROIConfig {
        if (this.url) {
            return {
                name: this.name,
                color: this.color,
                url: this.url,
                isUserDefined: this.isUserDefined,
                isVisible: this.isVisible
            }
        } else {
            const featureMap = this.featureSource.getAllFeatures()
            const features: GenomicFeature[] = []
            for (let chr of Object.keys(featureMap)) {
                for (let f of featureMap[chr]) {
                    features.push(f)
                }
            }
            return {
                name: this.name,
                color: this.color,
                features: features,
                isUserDefined: this.isUserDefined,
                isVisible: this.isVisible
            }
        }
    }

    dispose(): void {
        for (let key of Object.keys(this)) {
            this[key] = undefined
        }
    }

}

const SCREEN_COORDS_WIDTH_THRESHOLD = 3

function screenCoordinates(regionStartBP: number, regionEndBP: number, bpStart: number, bpp: number): { x: number, width: number } {

    let xStart = Math.round((regionStartBP - bpStart) / bpp)
    const xEnd = Math.round((regionEndBP - bpStart) / bpp)

    let width = xEnd - xStart

    if (width < SCREEN_COORDS_WIDTH_THRESHOLD) {
        width = SCREEN_COORDS_WIDTH_THRESHOLD
        xStart -= 1
    }

    return {x: xStart, width}
}


class DynamicFeatureSource {

    featureMap: Record<string, GenomicFeature[]>
    genome: any

    constructor(features: GenomicFeature[], genome: any) {
        this.featureMap = {}
        this.genome = genome

        for (let feature of features) {

            // Store as canonical chr name (i.e. translate aliases)
            const chrKey = genome ? genome.getChromosomeName(feature.chr) : feature.chr

            let featureList = this.featureMap[chrKey]
            if (!featureList) {
                featureList = []
                this.featureMap[chrKey] = featureList
            }
            featureList.push(feature)
        }

        for (let key of Object.keys(this.featureMap)) {
            this.featureMap[key].sort((a: GenomicFeature, b: GenomicFeature) => a.start - b.start)
        }
    }

    async getFeatures({chr, start, end}: { chr: string, start: number, end: number }): Promise<GenomicFeature[]> {
        if (chr.toLowerCase() === 'all') {
            return await computeWGFeatures(this.featureMap, this.genome, undefined)
        } else {
            // TODO -- this use of filter is O(N), and might not scale well for large feature lists.
            const featureList = this.featureMap[chr]
            return featureList ? featureList.filter(feature => feature.end > start && feature.start < end) : []
        }
    }

    getAllFeatures(): Record<string, GenomicFeature[]> {
        return this.featureMap
    }

    supportsWholeGenome(): boolean {
        return true
    }

    addFeature(feature: GenomicFeature): void {
        let featureList = this.featureMap[feature.chr]
        if (!featureList) {
            featureList = []
            this.featureMap[feature.chr] = featureList
        }
        featureList.push(feature)
        featureList.sort((a: GenomicFeature, b: GenomicFeature) => a.start - b.start)
    }

    removeFeature({chr, start, end}: { chr: string, start: number, end: number }): void {

        if (this.featureMap[chr]) {
            const match = `${chr}-${start}-${end}`
            this.featureMap[chr] = this.featureMap[chr].filter(feature => match !== `${feature.chr}-${feature.start}-${feature.end}`)
            // Check if featureMap for a specific chromosome is empty now and delete it if yes
            if (this.featureMap[chr].length === 0) {
                delete this.featureMap[chr];
            }
        }
    }
}


export {ROI_DEFAULT_COLOR, ROI_USER_DEFINED_COLOR, screenCoordinates}

export default ROISet
