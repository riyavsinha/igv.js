import {igvxhr} from "../../node_modules/igv-utils/src/index.js"
import getDataWrapper from "../feature/dataWrapper"
import Genbank from "./genbank"

const wsRegex: RegExp = /\s+/

const genbankCache: Map<string, any> = new Map()

async function loadGenbank(url: string): Promise<any> {
    let genbank = genbankCache.get(url)

    if (!genbank) {
        const data: string = await igvxhr.loadString(url, {})
        genbank = parseGenbank(data)
        genbank.url = url
        genbankCache.set(url, genbank)
    }

    return genbank
}


function parseGenbank(data: string): any {

    if (!data) return null

    const dataWrapper = getDataWrapper(data)

    // Read locus
    let line: string = dataWrapper.nextLine()
    const tokens = line.split(/\s+/)
    if (tokens[0].toUpperCase() !== "LOCUS") {
        throw Error("Expected `LOCUS` line.  Found: " + line)
    }
    const locus: string = tokens[1].trim()

    // Loop until FEATURES section
    let accession: string | undefined, aliases: string[] | undefined
    do {
        line = dataWrapper.nextLine()
        if (line.startsWith("ACCESSION")) {
            const tokens = line.split(wsRegex)
            if (tokens.length < 2) {
                throw Error("Genbank file missing ACCESSION number.")
            } else {
                accession = tokens[1].trim()
            }
        } else if (line.startsWith("ALIASES")) {
            // NOTE - this is an IGV extension
            const tokens = line.split(wsRegex)
            if (tokens.length > 1) {
                aliases = tokens[1].split(",")
            }

        }
    }
    while (line && !line.startsWith("FEATURES"))

    const chr: string = accession || locus
    const features = parseFeatures(chr, dataWrapper)
    const sequence: string = parseSequence(dataWrapper)

    return new Genbank({chr, locus, accession, aliases, features, sequence})
}


/**
 * Read the origin section.
 */
function parseSequence(dataWrapper: any): string {

    let nextLine: string
    let sequence = ""

    while ((nextLine = dataWrapper.nextLine()) && !nextLine.startsWith("//")) {
        nextLine = nextLine.trim()
        const tokens = nextLine.split(/\s+/)
        for (let i = 1; i < tokens.length; i++) {
            sequence += tokens[i]
        }
    }
    return sequence
}

interface GenbankFeature {
    chr: string
    type: string
    attributes: Record<string, string>
    getAttributeValue: (key: string) => string
    start?: number
    end?: number
    strand?: string
    exons?: Array<{ chr: string; start: number; end: number; strand: string }>
}

/**
 * Parse genbank FEATURES section
 */
function parseFeatures(chr: string, dataWrapper: any): GenbankFeature[] {

    //Process features until "ORIGIN" or end of file
    const features: GenbankFeature[] = []
    let currentLocQualifier: string
    let nextLine: string
    let errorCount = 0
    let f: GenbankFeature

    do {
        nextLine = dataWrapper.nextLine()

        if (nextLine === "") {
            continue  // Not sure this is legal in a gbk file
        }

        if (!nextLine || nextLine.startsWith("ORIGIN")) {
            break
        }

        if (nextLine.length < 6) {
            if (errorCount < 10) {
                // BUG: Original code used console() instead of console.log() - this would throw a TypeError
                console.log("Unexpected line in genbank file (skipping): " + nextLine)
            }
            errorCount++
            continue
        }

        if (nextLine.charAt(5) !== ' ') {

            let featureType: string = nextLine.substring(5, 21).trim()
            f = {
                chr: chr,
                type: featureType,
                attributes: {},
                getAttributeValue: function(key: string): string {return this.attributes[key]}
            }
            currentLocQualifier = nextLine.substring(21)

            if (featureType.toLowerCase() !== "source") {
                features.push(f)
            }

        } else {
            let tmp: string = nextLine.substring(21).trim()
            if (tmp.length > 0)

                if (tmp.charCodeAt(0) === 47) {   // 47 == '/'
                    if (currentLocQualifier!.charCodeAt(0) === 47) {
                        let tokens = currentLocQualifier!.split("=", 2)
                        if (tokens.length > 1) {
                            let keyName: string = tokens[0].length > 1 ? tokens[0].substring(1) : ""
                            let value: string = stripQuotes(tokens[1])
                            f!.attributes[keyName] = value

                        } else {
                            // TODO -- don't know how to interpret, log?
                        }
                    } else {
                        // Assumed to be a continuation of the location string.  There are many forms of this string,
                        // igv only supports "join()"

                        // Crude test for strand
                        const strand: string = currentLocQualifier!.includes("complement") ? "-" : "+"
                        f!.strand = strand

                        let joinString: string = currentLocQualifier!.replace("join", "")
                            .replace("order", "")
                            .replace("complement", "")
                            .replace("(", "")
                            .replace(")", "")

                        if (joinString.includes("..")) {
                            joinString = joinString.replace("<", "")
                                .replace(">", "")

                            const exons = createExons(joinString, chr, strand)
                            const firstExon = exons[0]
                            f!.start = firstExon.start
                            const lastExon = exons[exons.length - 1]
                            f!.end = lastExon.end
                            if (exons.length > 1) {
                                f!.exons = exons
                            }
                        } else {
                            // TODO Single locus for now, other forms possible
                            f!.start = parseInt(joinString) - 1
                            f!.end = f!.start + 1
                        }
                    }
                    currentLocQualifier = tmp
                } else {
                    currentLocQualifier = currentLocQualifier! + tmp
                }
        }
    }
    while (true)

    return features
}

interface GenbankExon {
    chr: string
    start: number
    end: number
    strand: string
}

/**
 * Create a list of Exon objects from the Embl join string.
 */
function createExons(joinString: string, chr: string, strand: string): GenbankExon[] {

    const lociArray = joinString.split(",")
    const exons: GenbankExon[] = []

    for (const loci of lociArray) {
        const tmp = loci.split("..")
        let exonStart = 0

        try {
            exonStart = parseInt(tmp[0]) - 1
        } catch (e) {
            console.error(e)
        }

        let exonEnd: number = exonStart + 1
        if (tmp.length > 1) {
            exonEnd = parseInt(tmp[1])
        }

        exons.push({
            chr: chr,
            start: exonStart,
            end: exonEnd,
            strand: strand
        })
    }
    exons.sort(function (a: GenbankExon, b: GenbankExon) {
        return a.start - b.start
    })

    return exons

}

function stripQuotes(value: string): string {
    if (value.startsWith('"') && value.endsWith('"')) {
        // BUG: Original used value.length - 2, should be value.length - 1 for correct substring end index
        value = value.substring(1, value.length - 1)
    }
    return value
}

export {loadGenbank, parseGenbank}
