import {StringUtils} from "../../../node_modules/igv-utils/src/index.js"
import {isCoding, isIntron, isUTR} from "./so"
import {parseAttributeString} from "./parseAttributeString"

const filterPopupProperties: Set<string> = new Set(["id", "parent", "name"])

interface PopupDataItem {
    name?: string
    value?: string
    html?: string
}

interface GFFProperties {
    phase?: string | number
    chr?: string
    start?: number
    end?: number
    name?: string
    type?: string
    source?: string
    score?: number
    strand?: string
    attributeString?: string
    delim?: string
    [key: string]: any
}

interface Exon {
    start: number
    end: number
    cdStart?: number
    cdEnd?: number
    readingFrame?: number
    utr?: boolean
    pseudo?: boolean
    psuedo?: boolean  // NOTE: Typo in original code ("psuedo" instead of "pseudo")
    popupData?: (genomicLocation: number) => (PopupDataItem | string)[]
    [key: string]: any
}

class GFFFeature {

    chr!: string
    start!: number
    end!: number
    name: string | undefined
    type!: string
    source!: string
    score: number | undefined
    phase: string | undefined
    strand: string | undefined
    attributeString: string | undefined
    delim: string | undefined
    readingFrame: number | undefined
    geneObject: any
    private _attributeCache: Map<string, string | undefined> | undefined;

    [key: string]: any

    constructor(properties: GFFProperties) {

        Object.assign(this, properties)

        if (properties.phase !== undefined && "." !== properties.phase) {
            this.readingFrame = (3 - parseInt(String(properties.phase))) % 3
        }

    }


    popupData(genomicLocation?: number): (PopupDataItem | string)[] {

        const pd: (PopupDataItem | string)[] = this.geneObject ? this.geneObject.popupData() : []

        if (this.geneObject) {
            pd.push('<hr/>')
        }

        if (this.name) {
            pd.push({name: 'Name', value: this.name})
        }

        pd.push({name: 'Type', value: this.type})
        pd.push({name: 'Source', value: this.source})
        if (this.score !== undefined) {
            pd.push({name: 'Score', value: String(this.score)})
        }
        pd.push({name: 'Phase', value: this.phase})

        if (this.attributeString) {
            const atts: [string, string][] = parseAttributeString(this.attributeString, this.delim!)
            for (let [key, value] of atts) {
                if (value !== undefined && value.length > 0 && !filterPopupProperties.has(key.toLowerCase())) {
                    pd.push({name: key + ":", value: value})
                }
            }
        }
        pd.push({
            name: 'Location',
            value: `${this.chr}:${StringUtils.numberFormatter(this.start + 1)}-${StringUtils.numberFormatter(this.end)}`
        })
        return pd
    }

    getAttributeValue(attributeName: string): any {
        if (this.hasOwnProperty(attributeName)) {
            return this[attributeName]
        } else {
            // TODO -- fetch from attribute string and cache
            if (!this._attributeCache) {
                this._attributeCache = new Map()
            }
            if (this._attributeCache.has(attributeName)) {
                return this._attributeCache.get(attributeName)
            } else {
                const atts: [string, string][] = parseAttributeString(this.attributeString!, this.delim!)
                let v: string | undefined
                for (let [key, value] of atts) {
                    if (key === attributeName) {
                        v = value
                        break
                    }
                }
                this._attributeCache.set(attributeName, v)
                return v
            }
        }
    }
}

class GFFTranscript extends GFFFeature {

    exons: Exon[]
    parts: GFFFeature[]
    cdStart: number | undefined
    cdEnd: number | undefined

    constructor(feature: GFFProperties) {
        super(feature)
        this.exons = []
        this.parts = []
    }

    addExon(feature: Exon): void {

        this.exons.push(feature)

        // Expand feature --  for transcripts not explicitly represented in the file (gtf)
        this.start = Math.min(this.start, feature.start)
        this.end = Math.max(this.end, feature.end)
    }

    addPart(feature: GFFFeature): void {
        this.parts.push(feature)
    }

    assembleParts(): void {

        if (this.parts.length === 0) return

        this.parts.sort(function (a: GFFFeature, b: GFFFeature) {
            return a.start - b.start
        })

        // Create exons, if necessary
        let lastStart: number = this.parts[0].start
        let lastEnd: number = this.parts[0].end
        for (let i = 1; i < this.parts.length; i++) {
            const part: GFFFeature = this.parts[i]
            if (isIntron(part.type)) {
                continue
            }
            if (part.start <= lastEnd) {
                lastEnd = Math.max(lastEnd, part.end)
            } else {
                let exon: Exon | undefined = this.findExonContaining({start: lastStart, end: lastEnd})
                if (!exon) {
                    this.exons.push({start: lastStart, end: lastEnd, psuedo: true})
                }
                lastStart = part.start
                lastEnd = part.end
            }
        }
        let exon: Exon | undefined = this.findExonContaining({start: lastStart, end: lastEnd})
        if (!exon) {
            this.exons.push({start: lastStart, end: lastEnd, psuedo: true})
            this.start = Math.min(this.start, lastStart)
            this.end = Math.max(this.end, lastEnd)
        }


        for (let part of this.parts) {
            const type: string = part.type
            if (isCoding(type)) {
                this.addCDS(part)
            } else if (isUTR(type)) {
                this.addUTR(part)
            }
        }
    }

    findExonContaining({start, end}: { start: number, end: number }): Exon | undefined {
        for (let exon of this.exons) {
            if (exon.end >= end && exon.start <= start) {
                return exon
            }
        }
        return undefined
    }

    addCDS(cds: { start: number, end: number, readingFrame?: number }): void {

        let exon: Exon | undefined
        const exons: Exon[] = this.exons

        for (let e of exons) {
            if (e.start <= cds.start && e.end >= cds.end) {
                exon = e
                break
            }
        }

        if (exon) {
            exon.cdStart = exon.cdStart ? Math.min(cds.start, exon.cdStart) : cds.start
            exon.cdEnd = exon.cdEnd ? Math.max(cds.end, exon.cdEnd) : cds.end
            if (cds.readingFrame !== undefined) {
                if (exon.readingFrame === undefined) {
                    exon.readingFrame = cds.readingFrame
                } else {
                    // Keep reading frame of first CDS in direction of transcription
                    if (this.strand === '+') {
                        // TODO -- could check that cds.readingFrame is 0
                    } else {
                        exon.readingFrame = cds.readingFrame
                    }
                }
            }
        } else {
            console.error("No exon found spanning " + cds.start + "-" + cds.end)
        }

        // Expand feature --  for transcripts not explicitly represented in the file (gtf files)
        // this.start = Math.min(this.start, cds.start);
        // this.end = Math.max(this.end, cds.end);

        this.cdStart = this.cdStart ? Math.min(cds.start, this.cdStart) : cds.start
        this.cdEnd = this.cdEnd ? Math.max(cds.end, this.cdEnd) : cds.end
    }

    addTerminalCodon(codon: { start: number, end: number, readingFrame?: number }): void {
        // Treat terminal codons as CDS
        this.addCDS(codon)
    }

    addUTR(utr: { start: number, end: number }): void {

        let exon: Exon | undefined
        const exons: Exon[] = this.exons

        // Find exon containing CDS
        for (let i = 0; i < exons.length; i++) {
            if (exons[i].start <= utr.start && exons[i].end >= utr.end) {
                exon = exons[i]
                break
            }
        }

        if (exon) {
            if (utr.start === exon.start && utr.end === exon.end) {
                exon.utr = true
            } else {
                if (utr.end < exon.end) {
                    exon.cdStart = utr.end
                }
                // Do not "backup" the cdEnd based on a UTR record.  A stop_codon might extend cdEnd into the UTR, and we
                // don't want to quash that with the UTR. Although stop codons are not translated, visually
                // they appear as part exonic coding sequence. This is a long established convention,
                if (exon.cdEnd === undefined || utr.start > exon.cdEnd) {
                    exon.cdEnd = utr.start
                }
            }

        } else {
            // BUG: Original code references `cds` variable which doesn't exist in this scope - should be `utr`
            console.error("No exon found spanning " + utr.start + "-" + utr.end)
        }

        // Expand feature --  for transcripts not explicitly represented in the file
        // this.start = Math.min(this.start, utr.start);
        // this.end = Math.max(this.end, utr.end);

    }

    finish(): void {

        this.assembleParts()

        var cdStart: number | undefined = this.cdStart
        var cdEnd: number | undefined = this.cdEnd

        this.exons.sort(function (a: Exon, b: Exon) {
            return a.start - b.start
        })

        // Search for UTR exons that were not explicitly tagged
        if (cdStart) {
            this.exons.forEach(function (exon: Exon) {
                if (exon.end < cdStart! || exon.start > cdEnd!) exon.utr = true
            })
        }
    }

    popupData(genomicLocation?: number): (PopupDataItem | string)[] {

        const pd: (PopupDataItem | string)[] = super.popupData(genomicLocation)

        // If clicked over an exon add its attributes
        for (let exon of this.exons) {
            if (exon.pseudo) continue  // An implicit exon
            if (genomicLocation !== undefined && genomicLocation >= exon.start && genomicLocation < exon.end && typeof exon.popupData === 'function') {
                pd.push('<hr/>')
                const exonData = exon.popupData(genomicLocation)
                for (let att of exonData) {
                    pd.push(att)
                }
            }
        }

        for (let part of this.parts) {
            if (genomicLocation !== undefined && genomicLocation >= part.start && genomicLocation < part.end && typeof part.popupData === 'function') {
                pd.push('<hr/>')
                const partData = part.popupData(genomicLocation)
                for (let att of partData) {
                    pd.push(att)
                }
            }
        }


        return pd
    }
}

export {GFFFeature, GFFTranscript}
