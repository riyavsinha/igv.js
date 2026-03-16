import {IGVColor} from "../../../node_modules/igv-utils/src/index.js"
import {GFFFeature} from "./gffFeature"
import {decodeGFFAttribute, parseAttributeString} from "./parseAttributeString"

interface GFFHeader {
    format: string
}

function decode(tokens: string[], header: GFFHeader): GFFFeature | undefined {

    const format = header.format
    if (tokens.length < 9) {
        return undefined      // Not a valid gff record
    }

    const delim = ('gff3' === format) ? '=' : ' '
    return new GFFFeature({
        source: decodeGFFAttribute(tokens[1]),
        type: tokens[2],
        chr: tokens[0],
        start: parseInt(tokens[3]) - 1,
        end: parseInt(tokens[4]),
        score: "." === tokens[5] ? undefined : Number(tokens[5]),
        strand: tokens[6],
        phase: "." === tokens[7] ? "." : parseInt(tokens[7]),
        attributeString: tokens[8],
        delim: delim
    })
}


/**
 * Decode a single gff record (1 line in file).  Aggregations such as gene models are constructed at a higher level.
 *      ctg123 . mRNA            1050  9000  .  +  .  ID=mRNA00001;Parent=gene00001
 */
function decodeGFF3(tokens: string[], header: GFFHeader): GFFFeature | undefined {

    const feature = decode(tokens, header)

    if (!feature) {
        return
    }

    const attributes: Array<[string, string]> = parseAttributeString(feature.attributeString!, feature.delim!)

    // Search for color value as case insensitive key
    for (let [key, value] of attributes) {
        const keyLower = key.toLowerCase()
        if ("color" === keyLower || "colour" === keyLower) {
            feature.color = IGVColor.createColorString(value)
        } else if (key === "ID") {
            feature.id = value
        } else if (key === "Parent") {
            feature.parent = value
        }
    }
    return feature
}

/**
 * GTF format decoder
 */
function decodeGTF(tokens: string[], header: GFFHeader): GFFFeature | undefined {

    const feature = decode(tokens, header)

    if (!feature) {
        return
    }

    const attributes: Array<[string, string]> = parseAttributeString(feature.attributeString!, feature.delim!)

    // GTF files specify neither ID nor parent fields, but they can be inferred from common conventions
    let idField: string | undefined
    let parentField: string | undefined
    switch (feature.type) {
        case "gene":
            idField = "gene_id"
            break
        case "transcript":
            idField = "transcript_id"
            parentField = "gene_id"
            break
        default:
            parentField = "transcript_id"
    }

    for (let [key, value] of attributes) {
        const keyLower = key.toLowerCase()
        if ("color" === keyLower || "colour" === keyLower) {
            feature.color = IGVColor.createColorString(value)
        } else if (key === idField) {
            feature.id = value
        } else if (key === parentField) {
            feature.parent = value
        }
    }
    return feature

}



export {decodeGFF3, decodeGTF}
