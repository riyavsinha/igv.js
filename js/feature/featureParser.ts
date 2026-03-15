import {decodeBedpe, decodeBedpeDomain, fixBedPE} from './decode/bedpe'
import {decodeInteract} from "./decode/interact"
import {
    decodeBed,
    decodeBedGraph,
    decodeBedmethyl,
    decodeGappedPeak,
    decodeGenePred,
    decodeGenePredExt,
    decodeNarrowPeak,
    decodePeak,
    decodeReflat,
    decodeRepeatMasker,
    decodeSNP,
    decodeWig
} from "./decode/ucsc"
import {decodeGFF3, decodeGTF} from "./gff/gff"
import {decodeFusionJuncSpan} from "./decode/fusionJuncSpan"
import {decodeGtexGWAS} from "./decode/gtexGWAS"
import {decodeCustom} from "./decode/custom"
import {decodeGcnv} from "../gcnv/gcnvDecoder.js"
import decodeShoebox from "../shoebox/decodeShoebox.js"
import DecodeError from "./decode/decodeError"
import GFFHelper from "./gff/gffHelper"

import {getFormat, type FileFormat} from "../util/fileFormats.js"
import {decodeLongrange} from "./decode/longrange"
import type {DataWrapper} from "./dataWrapper"
import type {GenomicFeature} from "../types/feature"

// Header param is intentionally `any` — decoders use varying header subtypes (BedHeader, GFFHeader, etc.)
// Return is intentionally `any` — decoders return varying feature types (UCSCBedFeature, Record<string, any>, etc.)
type DecoderFunction = (tokens: string[], header: any) => any

interface FeatureParserConfig {
    nameField?: string
    decode?: DecoderFunction
    delimiter?: string | RegExp
    format?: string
    assembleGFF?: boolean
    [key: string]: any
}

interface FeatureHeader {
    nameField?: string
    format?: string
    gffTags?: boolean
    wig?: WigDirective
    firstFeature?: GenomicFeature
    columnNames?: string[]
    colorColumn?: number
    thicknessColumn?: number
    customFormat?: FileFormat
    shift?: number
    [key: string]: any
}

interface WigDirective {
    format: string
    chrom: string
    start?: number
    step?: number
    span: number
    index?: number
}

interface ColumnsDirectiveResult {
    colorColumn?: number
    thicknessColumn?: number
}

class FeatureParser {

    config: FeatureParserConfig
    header: FeatureHeader
    skipRows: number
    decode!: DecoderFunction
    delimiter: string | RegExp = "\t"
    headerLine: boolean | undefined

    constructor(config: FeatureParserConfig) {

        this.config = config
        this.header = {}
        if (config.nameField) {
            this.header.nameField = config.nameField
        }

        this.skipRows = 0   // The number of fixed header rows to skip.  Override for specific types as needed

        if (config.decode) {
            this.decode = config.decode
            this.delimiter = config.delimiter || "\t"
        } else if (config.format) {
            this.header.format = config.format.toLowerCase()
            this.setDecoder(this.header.format)
        }

    }

    async parseHeader(dataWrapper: DataWrapper): Promise<FeatureHeader> {

        let header: FeatureHeader = this.header
        let columnNames: string[] | undefined
        let line: string | undefined
        while ((line = await dataWrapper.nextLine()) !== undefined) {
            if (line.startsWith("track") || line.startsWith("#track")) {
                let h = parseTrackLine(line)
                Object.assign(header, h)
            } else if (line.startsWith("browser")) {
                // UCSC line, currently ignored
            } else if (line.startsWith("#columns")) {
                let h = parseColumnsDirective(line)
                Object.assign(header, h)
            } else if (line.startsWith("##gff-version 3")) {
                header.format = "gff3"
            } else if (line.startsWith("#gffTags")) {
                header.gffTags = true
            } else if (line.startsWith("fixedStep") || line.startsWith("variableStep")) {
                // Wig directives -- we are in the data section
                break
            } else if (line.startsWith("#")) {
                const tokens: string[] = line.split(this.delimiter || "\t")
                if (tokens.length > 1) {
                    columnNames = tokens   // Possible column names
                }
            } else {
                // All directives that could change the format, and thus decoder, should have been read by now.
                // Set the decoder, unless it is explicitly set in the track configuration (not common)
                if (!this.config.decode) {
                    this.setDecoder(header.format)
                }

                // If the line can be parsed as a feature assume we are beyond the header, if any
                const tokens: string[] = line.split(this.delimiter || "\t")
                try {
                    const tmpHeader = Object.assign({columnNames}, header)
                    let firstFeature: GenomicFeature | null | undefined
                    if (firstFeature = this.decode(tokens, tmpHeader)) {
                        header.firstFeature = firstFeature
                        break
                    } else {
                        if (tokens.length > 1) {
                            columnNames = tokens // possible column names
                        }
                    }
                } catch (e) {
                    // Not a feature
                    if (tokens.length > 1) {
                        columnNames = tokens // possible column names
                    }
                }
            }
        }

        if (columnNames) {
            header.columnNames = columnNames
            for (let n = 0; n < columnNames.length; n++) {
                if (columnNames[n] === "color" || columnNames[n] === "colour") {
                    header.colorColumn = n
                } else if (columnNames[n] === "thickness") {
                    header.thicknessColumn = n
                }
            }
        }

        this.header = header    // Directives might be needed for parsing lines
        return header
    }

    async parseFeatures(dataWrapper: DataWrapper): Promise<GenomicFeature[]> {

        const allFeatures: GenomicFeature[] = []
        const decode: DecoderFunction = this.decode
        const format: string | undefined = this.header.format
        const delimiter: string | RegExp = this.delimiter || "\t"
        let i: number = 0
        let errorCount: number = 0
        let line: string | undefined
        while ((line = await dataWrapper.nextLine()) !== undefined) {
            i++
            if (i <= this.skipRows) continue

            if (!line || line.startsWith("track") || line.startsWith("#") || line.startsWith("browser")) {
                continue
            } else if (format === "wig" && line.startsWith("fixedStep")) {
                this.header.wig = parseFixedStep(line)
                continue
            } else if (format === "wig" && line.startsWith("variableStep")) {
                this.header.wig = parseVariableStep(line)
                continue
            }

            const tokens: string[] = line.split(delimiter)
            if (tokens.length < 1) {
                continue
            }

            const feature = decode(tokens, this.header)

            if (feature instanceof DecodeError) {
                errorCount++
                if (errorCount > 0) {
                    console.error(`Error parsing line '${line}': ${feature.message}`)
                }
                continue
            }

            if (feature) {
                allFeatures.push(feature)
            }
        }

        // Special hack for bedPE
        if (decode === decodeBedpe) {
            fixBedPE(allFeatures)
        }

        if (("gtf" === this.config.format || "gff3" === this.config.format || "gff" === this.config.format) &&
            this.config.assembleGFF !== false) {
            return (new GFFHelper(this.config as ConstructorParameters<typeof GFFHelper>[0])).combineFeatures(allFeatures as Parameters<GFFHelper["combineFeatures"]>[0])
        } else {
            return allFeatures
        }

    }

    setDecoder(format: string | undefined): void {

        switch (format) {
            case "broadpeak":
            case "regionpeak":
            case "peaks":
                this.decode = decodePeak
                this.delimiter = this.config.delimiter || /\s+/
                break
            case "narrowpeak":
                this.decode = decodeNarrowPeak
                this.delimiter = this.config.delimiter || /\s+/
                break
            case "bedgraph":
                this.decode = decodeBedGraph
                this.delimiter = /\s+/
                break
            case "wig":
                this.decode = decodeWig
                this.delimiter = this.config.delimiter || /\s+/
                break
            case "gff3" :
            case "gff":
                this.decode = decodeGFF3
                this.delimiter = "\t"
                break
            case "gtf" :
                this.decode = decodeGTF
                this.delimiter = "\t"
                break
            case "fusionjuncspan":
                // bhaas, needed for FusionInspector view
                this.decode = decodeFusionJuncSpan
                this.delimiter = this.config.delimiter || /\s+/
                break
            case "gtexgwas":
                this.skipRows = 1
                this.decode = decodeGtexGWAS
                this.delimiter = "\t"
                break
            case "refflat":
                this.decode = decodeReflat
                this.delimiter = this.config.delimiter || /\s+/
                break
            case "genepred":
                this.decode = decodeGenePred
                this.delimiter = this.config.delimiter || /\s+/
                break
            case "genepredext":
                this.decode = decodeGenePredExt
                this.delimiter = this.config.delimiter || /\s+/
                break
            case "ensgene":
                this.decode = decodeGenePred
                this.header.shift = 1
                this.delimiter = this.config.delimiter || /\s+/
                break
            case "refgene":
                this.decode = decodeGenePredExt
                this.delimiter = this.config.delimiter || /\s+/
                this.header.shift = 1
                break
            case "bed":
                this.decode = decodeBed
                this.delimiter = this.config.delimiter || /\s+/
                break
            case "gappedpeak":
                this.decode = decodeGappedPeak
                this.delimiter = this.config.delimiter || /\s+/
                break
            case "bedmethyl":
                this.decode = decodeBedmethyl
                this.delimiter = this.config.delimiter || /\s+/
                break
            case "bedpe":
            case "hiccups":
                this.decode = decodeBedpe
                this.delimiter = this.config.delimiter || "\t"
                break
            case "bedpe-domain":
                this.decode = decodeBedpeDomain
                this.headerLine = true
                this.delimiter = this.config.delimiter || "\t"
                break
            case "bedpe-loop":
                this.decode = decodeBedpe
                this.delimiter = this.config.delimiter || "\t"
                this.header = {colorColumn: 7}
                break
            case "interact":
                this.decode = decodeInteract
                this.delimiter = this.config.delimiter || /\s+/
                break
            case "longrange":
                this.decode = decodeLongrange
                this.delimiter = "\t"
                break
            case "snp":
                this.decode = decodeSNP
                this.delimiter = "\t"
                break
            case "rmsk":
                this.decode = decodeRepeatMasker
                this.delimiter = "\t"
                break
            case "gcnv":
                this.decode = decodeGcnv
                this.delimiter = "\t"
                break
            case "shoebox":
                this.decode = decodeShoebox
                this.delimiter = "\t"
                break
            default:
                const customFormat = getFormat(format!)
                if (customFormat !== undefined) {
                    this.decode = decodeCustom
                    this.header.customFormat = customFormat
                    this.delimiter = customFormat.delimiter || "\t"
                } else {
                    this.decode = decodeBed
                    this.delimiter = this.config.delimiter || /\s+/
                }
        }

    }
}

function parseTrackLine(line: string): Record<string, string | string[]> {

    const properties: Record<string, string | string[]> = {}
    const tokens: string[] = line.split(/(?:")([^"]+)(?:")|([^\s"]+)(?=\s+|$)/g)

    // Clean up tokens array
    let curr: string | undefined
    const tmp: string[] = []
    for (let tk of tokens) {
        if (!tk || tk.trim().length === 0) continue
        if (tk.endsWith("=")) {
            curr = tk
        } else if (curr) {
            tmp.push(curr + tk)
            curr = undefined
        } else {
            tmp.push(tk)
        }
    }

    for (let str of tmp) {
        if (!str) return properties
        var kv = str.split('=', 2)
        if (kv.length === 2) {
            const key: string = kv[0].trim()
            const value: string = kv[1].trim()
            if (properties.hasOwnProperty(key)) {
                let currentValue = properties[key]
                if (Array.isArray(currentValue)) {
                    currentValue.push(value)
                } else {
                    properties[key] = [currentValue, value]
                }
            } else {
                properties[key] = value
            }
        }
    }
    if ("interact" == properties["type"]) {
        properties["format"] = "interact"
    } else if ("longrange" == properties["longrange"]) {
        properties["format"] = "longrange"
    } else if ("gcnv" === properties["type"]) {
        properties["format"] = "gcnv"
    }
    return properties
}

function parseColumnsDirective(line: string): ColumnsDirectiveResult {

    let properties: ColumnsDirectiveResult = {}
    let t1: string[] = line.split(/\s+/)

    if (t1.length === 2) {
        let t2: string[] = t1[1].split(";")
        t2.forEach(function (keyValue: string) {
            let t: string[] = keyValue.split("=")
            if (t[0] === "color") {
                properties.colorColumn = Number.parseInt(t[1]) - 1
            } else if (t[0] === "thickness") {
                properties.thicknessColumn = Number.parseInt(t[1]) - 1
            }
        })
    }

    return properties
}

function parseFixedStep(line: string): WigDirective {
    const tokens: string[] = line.split(/\s+/)
    const chrom: string = tokens[1].split("=")[1]
    const start: number = parseInt(tokens[2].split("=")[1], 10) - 1
    const step: number = parseInt(tokens[3].split("=")[1], 10)
    const span: number = (tokens.length > 4) ? parseInt(tokens[4].split("=")[1], 10) : 1
    return {format: "fixedStep", chrom, start, step, span, index: 0}
}

function parseVariableStep(line: string): WigDirective {
    const tokens: string[] = line.split(/\s+/)
    const chrom: string = tokens[1].split("=")[1]
    const span: number = tokens.length > 2 ? parseInt(tokens[2].split("=")[1], 10) : 1
    return {format: "variableStep", chrom, span}
}


export default FeatureParser
