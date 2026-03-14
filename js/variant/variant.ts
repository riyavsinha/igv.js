import TrackBase from "../trackBase.js"
import {StringUtils} from "../../node_modules/igv-utils/src/index.js"

/**
 * Create a variant from an array of tokens representing a line in a "VCF" file
 * @param tokens
 */

const STANDARD_FIELDS: Map<string, string> = new Map([["REF", "referenceBases"], ["ALT", "alternateBases"], ["QUAL", "quality"], ["FILTER", "filter"]])

interface PopupDataItem {
    name?: string
    value?: string
    html?: string
}

interface FormatFields {
    genotypeIndex: number
    fields: string[]
}

class Variant {

    chr: string
    pos: number
    names: string
    referenceBases: string
    alternateBases: string
    quality: string
    filter: string
    info: { [key: string]: string }
    type: string | undefined
    start: number
    end: number
    alleles: string[] | undefined
    calls: any

    constructor(tokens: string[]) {
        this.chr = tokens[0] // TODO -- use genome aliases
        this.pos = parseInt(tokens[1])
        this.names = tokens[2]    // id in VCF
        this.referenceBases = tokens[3]
        this.alternateBases = tokens[4]
        this.quality = tokens[5]
        this.filter = tokens[6]
        this.info = {}
        const infoStr: string = tokens[7]
        if (infoStr && infoStr !== '.') {
            for (let elem of infoStr.split(';')) {
                var element = elem.split('=')
                this.info[element[0]] = element[1]
            }
        }
        this.init()
    }


    getAttributeValue(key: string): any {
        if (STANDARD_FIELDS.has(key)) {
            key = STANDARD_FIELDS.get(key)!
        }
        return this.hasOwnProperty(key) ? (this as any)[key] : this.info[key]
    }


    init(): void {

        const ref: string = this.referenceBases
        const altBases: string = this.alternateBases

        if (this.info) {
            if (this.info["VT"]) {
                this.type = this.info["VT"]
            } else if (this.info["SVTYPE"]) {
                this.type = "SV"
            } else if (this.info["PERIOD"]) {
                this.type = "STR"
            }
        }
        if (this.type === undefined) {
            this.type = determineType(ref, altBases)
        }

        // Determine start/end coordinates -- these are the coordinates representing the actual variant,
        // not the leading or trailing reference
        if (this.info["END"]) {
            this.start = this.pos - 1
            if (this.info["CHR2"] && this.info["CHR2"] !== this.chr) {
                this.end = this.start + 1
            } else {
                this.end = Number.parseInt(this.info["END"])
            }
        } else {
            if (this.type === "NONVARIANT") {
                this.start = this.pos - 1      // convert to 0-based coordinate convention
                this.end = this.start + ref.length
            } else {

                const altTokens: string[] = altBases.split(",").filter(token => token.length > 0)
                this.alleles = []
                this.start = undefined as any
                this.end = undefined as any

                for (let alt of altTokens) {

                    this.alleles.push(alt)

                    // We don't yet handle  SV and other special alt representations
                    if ("SV" !== this.type && isKnownAlt(alt)) {

                        let altLength: number = alt.length
                        let lengthOnRef: number = ref.length
                        const lmin: number = Math.min(altLength, lengthOnRef)

                        // Trim off matching bases.  Try first match, then right -> left,  then any remaining left -> right
                        let s: number = 0

                        while (s < lmin && (ref.charCodeAt(s) === alt.charCodeAt(s))) {
                            s++
                            altLength--
                            lengthOnRef--
                        }

                        // right -> left from end
                        while (altLength > 0 && lengthOnRef > 0) {
                            const altIdx: number = s + altLength - 1
                            const refIdx: number = s + lengthOnRef - 1
                            if (alt.charCodeAt(altIdx) === ref.charCodeAt(refIdx)) {
                                altLength--
                                lengthOnRef--
                            } else {
                                break
                            }
                        }

                        // if any remaining, left -> right
                        while (altLength > 0 && lengthOnRef > 0) {
                            const altIdx: number = s
                            const refIdx: number = s
                            if (alt.charCodeAt(altIdx) === ref.charCodeAt(refIdx)) {
                                s++
                                altLength--
                                lengthOnRef--
                            } else {
                                break
                            }
                        }

                        const alleleStart: number = this.pos + s - 1      // -1 for zero based coordinates
                        const alleleEnd: number = alleleStart + lengthOnRef
                        this.start = this.start === undefined ? alleleStart : Math.min(this.start, alleleStart)
                        this.end = this.end === undefined ? alleleEnd : Math.max(this.end, alleleEnd)
                    }
                }

                // Default to single base representation @ position for variant types not otherwise handled
                if (this.start === undefined) {
                    this.start = this.pos - 1
                    this.end = this.pos
                }

                // Infer an insertion from start === end
                if (this.start === this.end) {
                    this.start -= 0.5
                    this.end += 0.5
                }
            }
        }
    }

    popupData(genomicLocation: number, genomeId: string): (PopupDataItem | string)[] {

        const posString: string = `${StringUtils.numberFormatter(this.pos)}`
        const locString: string = this.start === this.end ?
            `${StringUtils.numberFormatter(this.start)} | ${StringUtils.numberFormatter(this.start + 1)}` :
            `${StringUtils.numberFormatter(this.start + 1)}-${StringUtils.numberFormatter(this.end)}`
        const fields: (PopupDataItem | string)[] = [
            {name: "Chr", value: this.chr},
            {name: "Pos", value: posString},
            {name: "Loc", value: locString},
            {name: "ID", value: this.names ? this.names : ""},
            {name: "Ref", value: this.referenceBases},
            {name: "Alt", value: this.alternateBases.replace("<", "&lt;")},
            {name: "Qual", value: this.quality},
            {name: "Filter", value: this.filter}
        ]

        if (this.type) {
            fields.push({name: "Type", value: this.type})
        }

        if ("SNP" === this.type) {
            let ref: string = this.referenceBases
            if (ref.length === 1) {
                let altArray: string[] = this.alternateBases.split(",")
                for (let alt of altArray) {
                    if (alt.length === 1) {
                        let l = TrackBase.getCravatLink(this.chr, this.pos, ref, alt, genomeId)
                        if (l) {
                            fields.push('<hr/>')
                            fields.push({html: l})
                        }
                    }
                }
            }
        }

        const infoKeys: string[] = Object.keys(this.info)
        if (this.info && infoKeys.length > 0) {
            fields.push({html: '<hr style="border-top: dotted 1px;border-color: #c9c3ba" />'})
            for (let key of infoKeys) {
                fields.push({name: key, value: arrayToString(decodeURIComponent(this.info[key]))})
            }
        }

        return fields
    }

    getInfo(tag: string): string | undefined {
        return this.info ? this.info[tag] : undefined
    }

    isRefBlock(): boolean {
        return "NONVARIANT" === this.type
    }

    isFiltered(): boolean {
        return !("." === this.filter || "PASS" === this.filter)
    }

    alleleFreq(): string | undefined {
        return this.info ? this.info["AF"] : undefined
    }
}

/**
 * Represents the "other end" of an SV which specifies the breakpoint as CHR2 and END info fields.
 */
class SVComplement {

    mate: Variant
    chr: string
    pos: number
    start: number
    end: number

    constructor(v: Variant) {
        this.mate = v
        this.chr = v.info.CHR2
        this.pos = Number.parseInt(v.info.END)
        this.start = this.pos - 1
        this.end = this.pos
    }

    get info(): { [key: string]: string } {
        return this.mate.info
    }

    get names(): string {
        return this.mate.names
    }

    get referenceBases(): string {
        return this.mate.referenceBases
    }

    get alternateBases(): string {
        return this.mate.alternateBases
    }

    get quality(): string {
        return this.mate.quality
    }

    get filter(): string {
        return this.mate.filter
    }

    get calls(): any {
        return this.mate.calls
    }

    getAttributeValue(key: string): any {
        return this.mate.getAttributeValue(key)
    }

    // BUG FIX: Original was missing return statement
    getInfo(tag: string): string | undefined {
        return this.mate.getInfo(tag)
    }

    isFiltered(): boolean {
        return this.mate.isFiltered()
    }

    alleleFreq(): string | undefined {
        return this.mate.alleleFreq()
    }

    popupData(genomicLocation: number, genomeId: string): (PopupDataItem | string)[] {
        const popupData: (PopupDataItem | string)[] = []

        popupData.push("SV Breakpoint")
        popupData.push({name: 'Chr', value: this.chr})
        popupData.push({name: 'Pos', value: `${StringUtils.numberFormatter(this.pos)}`})
        popupData.push({html: '<hr style="border-top: dotted 1px;border-color: #c9c3ba" />'})
        popupData.push("SV")
        popupData.push(...this.mate.popupData(genomicLocation, genomeId))

        return popupData
    }
}


class Call {

    info: { [key: string]: string }
    sample: string
    genotype: (string | number)[] | undefined
    genotypeString: string | undefined
    private _zygosity: string | undefined

    constructor({formatFields, sample, token}: { formatFields: FormatFields, sample: string, token: string }) {

        this.info = {}
        this.sample = sample
        const ct: string[] = token.split(":")
        for (let idx = 0; idx < ct.length; idx++) {
            const callToken: string = ct[idx]
            if (idx == formatFields.genotypeIndex) {
                this.genotype = []
                for (let s of callToken.split(/[\|\/]/)) {
                    this.genotype.push('.' === s ? s : parseInt(s))
                }
            } else {
                this.info[formatFields.fields[idx]] = callToken
            }
        }

    }


    get zygosity(): string {
        if (!this._zygosity) {
            if (!this.genotype) {
                this._zygosity = 'unknown'
            } else {
                let allVar: boolean = true  // until proven otherwise
                let allRef: boolean = true
                let noCall: boolean = false

                for (let g of this.genotype) {
                    if ('.' === g) {
                        noCall = true
                        break
                    } else {
                        if (g !== 0) allRef = false
                        if (g === 0) allVar = false
                    }
                }
                if (noCall) {
                    this._zygosity = 'nocall'
                } else if (allRef) {
                    this._zygosity = 'homref'
                } else if (allVar) {
                    this._zygosity = 'homvar'
                } else {
                    this._zygosity = 'hetvar'
                }
            }
        }
        return this._zygosity!
    }

    /**
     * Used in sorting
     */
    zygosityScore(): number {
        const zygosity: string = this.zygosity
        switch (zygosity) {
            case 'homvar':
                return 4
            case 'hetvar':
                return 3
            case 'homref':
                return 2
            case 'nocall':
                return 1
            default:
                return 0
        }
    }

    private zygosityLabel(): string {
        const zygosity: string = this.zygosity
        switch (zygosity) {
            case 'homref':
                return 'Homozygous reference'
            case 'homvar':
                return 'Homozygous variant'
            case 'hetvar':
                return 'Heterozygous'
            default:
                return ''
        }
    }


    popupData(genomicLocation: number, genomeID: string): (PopupDataItem | string)[] {

        const popupData: (PopupDataItem | string)[] = []

        if (this.sample !== undefined) {
            popupData.push({name: 'Sample', value: this.sample})
        }

        // Genotype string is set in VariantTrack when call is clicked -- this is for memory efficiency, very few
        // calls will get clicked
        if (this.genotypeString) {
            popupData.push({name: 'Genotype', value: this.genotypeString})
        }

        const zygosity: string = this.zygosityLabel()
        if (zygosity) {
            popupData.push({name: 'Zygosity', value: zygosity})
        }


        var infoKeys: string[] = Object.keys(this.info)
        if (infoKeys.length) {
            popupData.push('<hr/>')
        }
        for (let key of infoKeys) {
            popupData.push({name: key, value: decodeURIComponent(this.info[key])})
        }

        return popupData
    }
}

const knownAltBases: Set<number> = new Set(["A", "C", "T", "G"].map(c => c.charCodeAt(0)))

function isKnownAlt(alt: string): boolean {
    for (let i = 0; i < alt.length; i++) {
        if (!knownAltBases.has(alt.charCodeAt(i))) {
            return false
        }
    }
    return true
}


function determineType(ref: string, altAlleles: string | undefined): string {
    const refLength: number = ref.length
    if (altAlleles === undefined) {
        return "UNKNOWN"
    } else if (altAlleles.trim().length === 0 ||
        altAlleles === "<NON_REF>" ||
        altAlleles === "<*>" ||
        altAlleles === ".") {
        return "NONVARIANT"
    } else {
        const alleles: string[] = altAlleles.split(",")
        const types: string[] = alleles.map(function (a: string) {
            if (refLength === 1 && a.length === 1) {
                return "SNP"
            } else if ("<NON_REF>" === a) {
                return "NONVARIANT"
            } else if (a.length > refLength && isKnownAlt(a)) {
                return "INSERTION"
            } else if (a.length < refLength && isKnownAlt(a)) {
                return "DELETION"
            } else {
                return "OTHER"
            }
        })
        let type: string = types[0]
        for (let t of types) {
            if (t !== type) {
                return "MIXED"
            }
        }
        return type
    }
}

function arrayToString(value: any, delim?: string): string {

    if (delim === undefined) delim = ","

    if (!(Array.isArray(value))) {
        return value
    }
    return value.join(delim)
}


export {Variant, Call, SVComplement}
