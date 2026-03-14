import {igvxhr, IGVMath} from '../../node_modules/igv-utils/src/index.js'
import {
    appleCrayonRGB,
    rgbaColor,
    rgbStringHeatMapLerp, rgbStringTokens
} from "../util/colorPalletes.js"
import {distinctColorsPalette} from './sampleInfoPaletteLibrary.js'
import TrackBase from "../trackBase.js"

class SampleInfo {

    static emptySpaceReplacement: string = '|'
    static colorForNA: string = appleCrayonRGB('magnesium')
    static sampleInfoFileHeaders: string[] = ['#sampleTable', '#sampleMapping', '#colors']

    sampleInfoFiles: string[]
    attributeNames: string[]
    sampleDictionary: Record<string, any>
    sampleMappingDictionary: Record<string, string>
    colorDictionary: Record<string, any>
    attributeRangeLUT: Record<string, any>
    initialized: boolean

    constructor(browser: any) {
        const found = browser.tracks.some((t: any) => typeof t.getSamples === 'function')
        if (found.length > 0) {
            browser.sampleInfoControl.setButtonVisibility(true)
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

    getAttributes(sampleName: string): Record<string, any> | undefined {

        const key: string = this.sampleMappingDictionary[sampleName] || sampleName
        return this.sampleDictionary[key]
    }

    getAttributeValue(sampleName: string, attribute: string): any {
        const attributes = this.getAttributes(sampleName)
        return attributes ? attributes[attribute] : undefined
    }

    async loadSampleInfo(config: any): Promise<void> {

        if (config.url) {
            await this.loadSampleInfoFile(config.url)
        } else {

            const samples: Record<string, any> = {...config}
            for (const [key, record] of Object.entries(samples)) {
                samples[key] = SampleInfo.toNumericalRepresentation(record as Record<string, any>)
            }

            const [value] = Object.values(samples)
            const attributes: string[] = Object.keys(value)

            this.loadSampleInfoHelper(attributes, samples)

        }

        this.initialized = true
    }

    loadSampleInfoHelper(attributes: string[], samples: Record<string, any>): void {

        // Establish the range of values for each attribute
        const lut: Record<string, any> = createAttributeRangeLUT(attributes, samples)
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

        const compare = (a: string, b: string): number | undefined => {
            const aa = this.getAttributes(a)![attribute]
            const bb = this.getAttributes(b)![attribute]

            if (typeof aa === 'string' && typeof bb === 'string') {
                return sortDirection * aa.localeCompare(bb)
            }

            if (typeof aa === 'number' && typeof bb === 'number') {
                return sortDirection * (aa - bb)
            }
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

        let samples: Record<string, Record<string, string>> | undefined
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
            (samples as any)[key] = SampleInfo.toNumericalRepresentation(record)
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

        const mappingfunction = (token: string, index: number, array: string[]): any => {

            let result: any
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
            }

            return result
        }

        const mappings: any[][] = colorSettings.map((setting: string) => {
            const list: string[] = setting.split('\t')
            const result: any[] = list.map(mappingfunction)
            return result
        })

        const triplets: any[][] = mappings
            .filter((mapping: any[]) => 3 === mapping.length && !mapping.includes('*'))
            .filter(([a, b, c]: any[]) => !Array.isArray(b))

        const tmp: Record<string, Record<string, string>> = {}
        for (const triplet of triplets) {
            const [attribute, value, rgb] = triplet
            if (undefined === tmp[attribute]) {
                tmp[attribute] = {}
            }
            tmp[attribute][value.toUpperCase()] = rgb
        }

        for (const [k, v] of Object.entries(tmp)) {
            const lut: Record<string, string> = Object.assign({}, v)
            this.colorDictionary[k] = (attributeValue: string): string => {

                const key: string = attributeValue.toUpperCase()
                const color: string = lut[key] || appleCrayonRGB('snow')
                return color
            }
        }

        const clamped: any[][] = mappings.filter((mapping: any[]) => Array.isArray(mapping[1]))

        for (const cl of clamped) {
            const [a, b] = cl[1]
            const attribute: string = cl[0]

            if (3 === cl.length) {

                const [_r, _g, _b] = rgbStringTokens(cl[2])

                this.colorDictionary[attribute] = (attributeValue: number): string => {
                    attributeValue = IGVMath.clamp(attributeValue, a, b)
                    const interpolant: number = (attributeValue - a) / (b - a)
                    return rgbaColor(_r, _g, _b, interpolant)
                }

            } else if (4 === cl.length) {

                const [a, b] = cl[1]
                const [attribute, ignore, rgbA, rgbB] = cl

                this.colorDictionary[attribute] = (attributeValue: number): string => {
                    attributeValue = IGVMath.clamp(attributeValue, a, b)
                    const interpolant: number = (attributeValue - a) / (b - a)
                    return rgbStringHeatMapLerp(rgbA, rgbB, interpolant)
                }
            }
        }

        const wildCards: any[][] = mappings.filter((mapping: any[]) => 3 === mapping.length && mapping.includes('*'))

        for (const wildCard of wildCards) {

            if ('*' === wildCard[1]) {
                const [attribute, star, rgb] = wildCard

                this.colorDictionary[attribute] = (attributeValue: any): string => {

                    if ('NA' === attributeValue) {
                        return SampleInfo.colorForNA
                    } else {
                        const [min, max] = this.attributeRangeLUT[attribute]
                        const interpolant: number = (attributeValue - min) / (max - min)

                        const [r, g, b] = rgbStringTokens(rgb)
                        return rgbaColor(r, g, b, interpolant)
                    }

                }

            } else if ('*' === wildCard[0]) {
                const [star, attributeValue, rgb] = wildCard
                this.colorDictionary[attributeValue] = (): string => rgb
            }

        }

    }

    static toNumericalRepresentation(obj: Record<string, any>): Record<string, any> {
        const result: Record<string, any> = Object.assign({}, obj)

        for (const [key, value] of Object.entries(result)) {
            if (typeof value === 'string' && !isNaN(value as any)) {
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
        const sampleInfoObject: Record<string, any> = {}
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

function accumulateDictionary(accumulator: Record<string, any>, dictionary: Record<string, any>): void {
    for (const [key, value] of Object.entries(dictionary)) {
        if (!(key in accumulator) || accumulator[key] !== value) {
            accumulator[key] = value
        }
    }
}

function createAttributeRangeLUT(names: string[], dictionary: Record<string, any>): Record<string, any> {

    const lut: Record<string, any[]> = {}
    for (const value of Object.values(dictionary)) {

        for (const attribute of names) {

            let item = (value as any)[attribute]

            if (undefined === lut[attribute]) {
                lut[attribute] = []
            }

            lut[attribute].push(item)

        } // for (attributeNames)

    } // for (Object.values(sampleDictionary))

    // clean up oddball cases.
    const isNumber = (element: any): boolean => typeof element === 'number'
    const isString = (element: any): boolean => typeof element === 'string'

    // remove duplicates
    for (const key of Object.keys(lut)) {
        const multiples = lut[key]
        const set = new Set(multiples)
        const list = Array.from(set)

        if (true === list.some(isString) && true === list.some(isNumber)) {
            lut[key] = list.filter((item: any) => !isString(item))
        } else {
            lut[key] = list
        }

        if (!lut[key].some(isString)) {
            const clone = lut[key].slice()
            lut[key] = [Math.min(...clone), Math.max(...clone)]
        }

    }

    return lut
}

export default SampleInfo
