import {igvxhr, StringUtils} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions} from "../util/igvUtils.js"

const splitLines: (text: string) => string[] = StringUtils.splitLines

interface PlinkAttributes {
    familyId: string
    fatherId: string
    motherId: string
    sex: string
    phenotype: string
}

class PlinkSampleInformation {
    attributes: Record<string, PlinkAttributes>

    constructor() {
        this.attributes = {}
    }

    async loadPlinkFile(url: string, config?: any): Promise<PlinkSampleInformation> {

        if (!config) config = {}

        var options = buildOptions(config)    // Add oauth token, if any
        const data: string = await igvxhr.loadString(url, options)
        var lines: string[] = splitLines(data)

        for (let line of lines) {
            var line_arr: string[] = line.split(' ')
            this.attributes[line_arr[1]] = {
                familyId: line_arr[0],
                fatherId: line_arr[2],
                motherId: line_arr[3],
                sex: line_arr[4],
                phenotype: line_arr[5]
            }
        }
        return this
    }

    getAttributes(sample: string): PlinkAttributes | undefined {
        return this.attributes[sample]
    };

    getAttributeNames(): string[] {

        if (this.hasAttributes()) {
            return Object.keys(this.attributes[Object.keys(this.attributes)[0]])
        } else return []
    };

    hasAttributes(): boolean {
        return Object.keys(this.attributes).length > 0
    }

    get attributeCount(): number {
        return Object.keys(this.attributes).length
    }
}

function loadPlinkFile(url: string, config?: any): Promise<PlinkSampleInformation> {
    const si = new PlinkSampleInformation()
    return si.loadPlinkFile(url, config)
}

export default loadPlinkFile


