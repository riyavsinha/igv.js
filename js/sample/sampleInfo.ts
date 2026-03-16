import {igvxhr, IGVMath} from '../../node_modules/igv-utils/src/index.js'
import {
    appleCrayonRGB,
    rgbaColor,
    rgbStringHeatMapLerp, rgbStringTokens
} from "../util/colorPalletes.js"
import {distinctColorsPalette} from './sampleInfoPaletteLibrary.js'
import TrackBase from "../trackBase.js"
import type Browser from "../browser.js"
import type {SampleInfoConfig} from "../types/config.js"
import type {Track} from "../types/ui.js"

type AttributeValue = string | number

class SampleInfo {

    static emptySpaceReplacement: string = '|'
    static colorForNA: string = appleCrayonRGB('magnesium')
    static sampleInfoFileHeaders: string[] = ['#sampleTable', '#sampleMapping', '#colors']

    sampleInfoFiles!: string[]
    attributeNames!: string[]
    sampleDictionary!: Record<string, Record<string, AttributeValue>>
    sampleMappingDictionary!: Record<string, string>
    colorDictionary!: Record<string, (value?: AttributeValue) => string>
    attributeRangeLUT!: Record<string, [number, number]>
    initialized!: boolean

    constructor(browser: Browser) {
        const found = browser.tracks.some((t: Track) => typeof t.getSamples === 'function')
        if (found) {
            browser.sampleInfoControl?.setButtonVisibility(true)
        }
        this.initialize()
    }

    initialize(): void {
        this.sampleInfoFiles = []
        this.attributeNames = []
        this.sampleDictionary = {}
        this.sampleMappingDictionary = {}
        this.colorDictionary = {}
        this.attributeRangeLUT = {}
        this.initialized = false
    }

    get attributeCount(): number {
        return this.attributeNames ? this.attributeNames.length : 0
    }

    isInitialized(): boolean {
        return this.initialized
    }

    hasAttributes(): boolean {
        return this.attributeCount > 0
    }

    getAttributes(sampleName: string): Record<string, AttributeValue> | undefined {

        const key: string = this.sampleMappingDictionary[sampleName] || sampleName
        return this.sampleDictionary[key]
    }

    getAttributeValue(sampleName: string, attribute: string): string | number | undefined {
        const attributes = this.getAttributes(sampleName)
        return attributes ? attributes[attribute] : undefined
    }

    async loadSampleInfo(config: SampleInfoConfig): Promise<void> {

        if (config.url) {
            await this.loadSampleInfoFile(config.url)
        } else {

            const samples: Record<string, Record<string, AttributeValue>> = {}
            for (const [key, record] of Object.entries(config)) {
                if (key !== 'url' && typeof record === 'object' && record !== null) {
                    samples[key] = SampleInfo.toNumericalRepresentation(record as Record<string, AttributeValue>)
                }
            }

            const [value] = Object.values(samples)
            const attributes: string[] = Object.keys(value)

            this.loadSampleInfoHelper(attributes, samples)

        }

        this.initialized = true
    }

    loadSampleInfoHelper(attributes: string[], samples: Record<string, Record<string, AttributeValue>>): void {

        // Establish the range of values for each attribute
        const lut: Record<string, [number, number]> = createAttributeRangeLUT(attributes, samples)
        accumulateDictionary(this.attributeRangeLUT, lut)

        // Ensure unique attribute names list
        const currentAttributeNameSet: Set<string> = new Set(this.attributeNames)
        for (const name of attributes) {
            if (!currentAttributeNameSet.has(name)) {
                this.attributeNames.push(name)
            }
        }

        accumulateDictionary(this.sampleDictionary, samples)

    }

    async loadSampleInfoFile(path: string): Promise<void> {
        const string: string = await igvxhr.loadString(path)
        this.#processSampleInfoFileAsString(string)
        this.sampleInfoFiles.push(path)
    }

    discard(): void {
        this.initialize()
    }

    getAttributeColor(attribute: string, value: string | number): string {

        let color: string

        if ('-' === value) {

            color = appleCrayonRGB('snow')

        } else if (typeof value === "string" && this.colorDictionary[value]) {

            color = this.colorDictionary[value]()

        } else if (this.colorDictionary[attribute]) {

            color = this.colorDictionary[attribute](value)

        } else if (typeof value === "string") {

            color = 'NA' === value ? SampleInfo.colorForNA : SampleInfo.stringToRGBString(value)

        } else {

            // if ('%|Tumor|Nuclei' === attribute) {
            //     console.log(`${ attribute } : ${ value }`)
            // }

            const [min, max] = this.attributeRangeLUT[attribute]

            const lowerAlphaThreshold: number = 2e-1
            const alpha: number = Math.max((value - min) / (max - min), lowerAlphaThreshold)

            const [r, g, b] = distinctColorsPalette[Object.keys(this.attributeRangeLUT).indexOf(attribute)]
            color = `rgba(${r},${g},${b},${alpha})`

        }

        return color

    }

    sortSampleKeysByAttribute(sampleKeys: string[], attribute: string, sortDirection: number): string[] {
        const numbers: string[] = sampleKeys.filter((key: string) => {
            const attributes = this.getAttributes(key)
            if (undefined === attributes) {
                return false
            }
            const value = attributes[attribute]
            return typeof value === 'number'
        })

        const strings: string[] = sampleKeys.filter((key: string) => {
            const attributes = this.getAttributes(key)
            if (undefined === attributes) {
                return false
            }
            const value = attributes[attribute]
            return typeof value === 'string'
        })

        const compare = (a: string, b: string): number => {
            const aa = this.getAttributes(a)![attribute]
            const bb = this.getAttributes(b)![attribute]

            if (typeof aa === 'string' && typeof bb === 'string') {
                return sortDirection * aa.localeCompare(bb)
            }

            if (typeof aa === 'number' && typeof bb === 'number') {
                return sortDirection * (aa - bb)
            }

            return 0
        }

        numbers.sort(compare)
        strings.sort(compare)

        return sortDirection === -1 ? [...numbers, ...strings] : [...strings, ...numbers]
    }

    #processSampleInfoFileAsString(string: string): void {

        const sectionDictionary: Record<string, string[]> = createSectionDictionary(string)

        for (const [header, value] of Object.entries(sectionDictionary)) {
            switch (header) {
                case '#sampleTable':
                    this.#accumulateSampleTableDictionary(value)
                    break
                case '#sampleMapping':
                    this.#accumulateSampleMappingDictionary(value)
                    break
                case '#colors':
                    this.#accumulateColorScheme(value)
                    break

            }
        }

    }

    #accumulateSampleTableDictionary(lines: string[]): void {

        // shift array with first item that is 'sample' or 'Linking_id'. Remaining items are attribute names
        const scratch: string[] = lines.shift()!.split('\t').filter((line: string) => line.length > 0)

        // discard 'sample' or 'Linking_id'
        scratch.shift()

        const attributes: string[] = scratch.map((label: string) => label.split(' ').join(SampleInfo.emptySpaceReplacement))

        const cooked: string[] = lines.filter((line: string) => line.length > 0)

        let samples: Record<string, Record<string, AttributeValue>> | undefined
        for (const line of cooked) {

            const record: string[] = line.split('\t')
            const _key_: string = record.shift()!

            if (undefined === samples) {
                samples = {}
            }

            samples[_key_] = {}

            for (let i = 0; i < record.length; i++) {
                const obj: Record<string, string> = {}

                if ("" === record[i]) {
                    obj[attributes[i]] = '-'
                } else {
                    obj[attributes[i]] = record[i]
                }

                Object.assign(samples[_key_], obj)
            }

        } // for (lines)

        for (const [key, record] of Object.entries(samples!)) {
            samples![key] = SampleInfo.toNumericalRepresentation(record)
        }

        this.loadSampleInfoHelper(attributes, samples!)

    }

    #accumulateSampleMappingDictionary(lines: string[]): void {

        for (const line of lines) {
            const [key, value] = line.split('\t')
            this.sampleMappingDictionary[key] = value
        }
    }

    #accumulateColorScheme(colorSettings: string[]): void {

        type ColorMappingItem = string | number[]
        type ColorMapping = ColorMappingItem[]

        const mappingfunction = (token: string, index: number, array: string[]): ColorMappingItem => {

            let result: ColorMappingItem
            switch (index) {
                case 0:
                    result = token.split(' ').join(SampleInfo.emptySpaceReplacement)
                    break
                case 1:
                    result = token.includes(':') ? token.split(':').map((str: string) => parseFloat(str)) : token
                    break
                case 2:
                    result = `rgb(${token})`
                    break
                case 3:
                    result = `rgb(${token})`
                    break
                default:
                    result = token
            }

            return result
        }

        const mappings: ColorMapping[] = colorSettings.map((setting: string) => {
            const list: string[] = setting.split('\t')
            const result: ColorMapping = list.map(mappingfunction)
            return result
        })

        const triplets: ColorMapping[] = mappings
            .filter((mapping: ColorMapping) => 3 === mapping.length && !mapping.includes('*'))
            .filter(([a, b, c]: ColorMappingItem[]) => !Array.isArray(b))

        const tmp: Record<string, Record<string, string>> = {}
        for (const triplet of triplets) {
            const attribute = triplet[0] as string
            const value = triplet[1] as string
            const rgb = triplet[2] as string
            if (undefined === tmp[attribute]) {
                tmp[attribute] = {}
            }
            tmp[attribute][value.toUpperCase()] = rgb
        }

        for (const [k, v] of Object.entries(tmp)) {
            const lut: Record<string, string> = Object.assign({}, v)
            this.colorDictionary[k] = (attributeValue?: AttributeValue): string => {

                const key: string = String(attributeValue).toUpperCase()
                const color: string = lut[key] || appleCrayonRGB('snow')
                return color
            }
        }

        const clamped: ColorMapping[] = mappings.filter((mapping: ColorMapping) => Array.isArray(mapping[1]))

        for (const cl of clamped) {
            const [a, b] = cl[1] as number[]
            const attribute = cl[0] as string

            if (3 === cl.length) {

                const [_r, _g, _b] = rgbStringTokens(cl[2] as string)!

                this.colorDictionary[attribute] = (attributeValue?: AttributeValue): string => {
                    const v = IGVMath.clamp(attributeValue as number, a, b)
                    const interpolant: number = (v - a) / (b - a)
                    return rgbaColor(_r, _g, _b, interpolant)
                }

            } else if (4 === cl.length) {

                const [a, b] = cl[1] as number[]
                const attribute = cl[0] as string
                const rgbA = cl[2] as string
                const rgbB = cl[3] as string

                this.colorDictionary[attribute] = (attributeValue?: AttributeValue): string => {
                    const v = IGVMath.clamp(attributeValue as number, a, b)
                    const interpolant: number = (v - a) / (b - a)
                    return rgbStringHeatMapLerp(rgbA, rgbB, interpolant)
                }
            }
        }

        const wildCards: ColorMapping[] = mappings.filter((mapping: ColorMapping) => 3 === mapping.length && mapping.includes('*'))

        for (const wildCard of wildCards) {

            if ('*' === wildCard[1]) {
                const attribute = wildCard[0] as string
                const rgb = wildCard[2] as string

                this.colorDictionary[attribute] = (attributeValue?: AttributeValue): string => {

                    if ('NA' === attributeValue) {
                        return SampleInfo.colorForNA
                    } else {
                        const [min, max] = this.attributeRangeLUT[attribute]
                        const interpolant: number = ((attributeValue as number) - min) / (max - min)

                        const [r, g, b] = rgbStringTokens(rgb)!
                        return rgbaColor(r, g, b, interpolant)
                    }

                }

            } else if ('*' === wildCard[0]) {
                const attributeValue = wildCard[1] as string
                const rgb = wildCard[2] as string
                this.colorDictionary[attributeValue] = (): string => rgb
            }

        }

    }

    static toNumericalRepresentation(obj: Record<string, AttributeValue>): Record<string, AttributeValue> {
        const result: Record<string, AttributeValue> = Object.assign({}, obj)

        for (const [key, value] of Object.entries(result)) {
            if (typeof value === 'string' && !isNaN(Number(value))) {
                result[key] = Number(value)
            }
        }

        return result
    }

    static stringToRGBString(str: string): string {
        let hash: number = 0
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash)
        }

        let color: number[] = []
        for (let i = 0; i < 3; i++) {
            const value: number = (hash >> (i * 8)) & 0xff
            color.push(value)
        }

        return `rgb(${color.join(', ')})`
    }

    export(): void {
        const sampleInfoObject: Record<string, Record<string, AttributeValue>> = {}
        const reverseSampleMappingDictionary: Record<string, string> = Object.fromEntries(
            Object.entries(this.sampleMappingDictionary).map(([key, value]: [string, string]) => [value, key])
        )
        for (const sampleName of Object.keys(this.sampleDictionary)) {
            const key: string = reverseSampleMappingDictionary[sampleName] || sampleName
            const attributes = this.getAttributes(sampleName)
            if (attributes) {
                sampleInfoObject[key] = attributes
            }
        }
        console.log(JSON.stringify(sampleInfoObject, null, 2))
    }

}

function createSectionDictionary(string: string): Record<string, string[]> {

    const dictionary: Record<string, string[]> = {}

    const lines: string[] = string.split(/\r?\n|\r/).map((line: string) => line.trim()).filter((line: string) => '' !== line)

    let currentHeader: string | undefined

    // If the first line does not start with a section header an initial #sampleTable is implied
    if (!SampleInfo.sampleInfoFileHeaders.includes(lines[0])) {
        currentHeader = '#sampleTable'
        dictionary[currentHeader] = []
    }

    for (const line of lines) {

        if (SampleInfo.sampleInfoFileHeaders.includes(line)) {
            currentHeader = line
            dictionary[currentHeader] = []
        } else if (currentHeader && false === line.startsWith('#')) {
            dictionary[currentHeader].push(line)
        }
    }

    return dictionary
}

function accumulateDictionary<T>(accumulator: Record<string, T>, dictionary: Record<string, T>): void {
    for (const [key, value] of Object.entries(dictionary)) {
        if (!(key in accumulator) || accumulator[key] !== value) {
            accumulator[key] = value
        }
    }
}

function createAttributeRangeLUT(names: string[], dictionary: Record<string, Record<string, AttributeValue>>): Record<string, [number, number]> {

    const lut: Record<string, AttributeValue[]> = {}
    for (const value of Object.values(dictionary)) {

        for (const attribute of names) {

            let item = value[attribute]

            if (undefined === lut[attribute]) {
                lut[attribute] = []
            }

            lut[attribute].push(item)

        } // for (attributeNames)

    } // for (Object.values(sampleDictionary))

    // clean up oddball cases.
    const isNumber = (element: AttributeValue): boolean => typeof element === 'number'
    const isString = (element: AttributeValue): boolean => typeof element === 'string'

    // remove duplicates
    for (const key of Object.keys(lut)) {
        const multiples = lut[key]
        const set = new Set(multiples)
        const list = Array.from(set)

        if (true === list.some(isString) && true === list.some(isNumber)) {
            lut[key] = list.filter((item: AttributeValue) => !isString(item))
        } else {
            lut[key] = list
        }

        if (!lut[key].some(isString)) {
            const clone = lut[key] as number[]
            lut[key] = [Math.min(...clone), Math.max(...clone)]
        }

    }

    return lut as unknown as Record<string, [number, number]>
}

export default SampleInfo
