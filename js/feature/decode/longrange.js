/**
 * Decode longrange files - a bed-like format for interact-type tracks.
 * 
 * Format: chr start end target
 * Where target is in format: chr2:start-end,score
 * 
 * Example:
 * chr1    111 222  chr2:333-444,55
 * chr2    333 444  chr1:111-222,55
 * 
 * This represents an interaction between chr1:111-222 and chr2:333-444 with score 55.
 * Each interaction is represented by two lines (one for each end).
 * 
 * @param tokens - Array of column values
 * @param header - Optional header object
 * @returns Feature object with chr1, start1, end1, chr2, start2, end2 properties
 */
function decodeLongrange(tokens, header) {

    if (tokens.length < 4) {
        console.log("Skipping line: " + tokens.join(' '))
        return undefined
    }

    // Parse the source region
    const chr1 = tokens[0]
    const start1 = Number.parseInt(tokens[1])
    const end1 = Number.parseInt(tokens[2])

    // Parse the target region from format "chr2:start-end,score"
    const targetStr = tokens[3]
    const parts = targetStr.split(',')
    
    if (parts.length < 1) {
        console.log("Invalid target format: " + targetStr)
        return undefined
    }

    const targetRegion = parts[0]  // "chr2:start-end"
    const score = parts.length > 1 ? Number(parts[1]) : undefined

    // Parse chr2:start-end
    const colonIdx = targetRegion.indexOf(':')
    if (colonIdx === -1) {
        console.log("Invalid target region format: " + targetRegion)
        return undefined
    }

    const chr2 = targetRegion.substring(0, colonIdx)
    const rangePart = targetRegion.substring(colonIdx + 1)
    const dashIdx = rangePart.indexOf('-')
    
    if (dashIdx === -1) {
        console.log("Invalid target range format: " + rangePart)
        return undefined
    }

    const start2 = Number.parseInt(rangePart.substring(0, dashIdx))
    const end2 = Number.parseInt(rangePart.substring(dashIdx + 1))

    // Validate parsed numbers
    if (isNaN(start1) || isNaN(end1) || isNaN(start2) || isNaN(end2)) {
        console.log("Invalid numeric values in line: " + tokens.join(' '))
        return undefined
    }

    const feature = {
        chr1: chr1,
        start1: start1,
        end1: end1,
        chr2: chr2,
        start2: start2,
        end2: end2
    }

    if (score !== undefined && !isNaN(score)) {
        feature.score = score
    }

    // Set total extent of feature
    if (feature.chr1 === feature.chr2) {
        feature.chr = feature.chr1
        feature.start = Math.min(feature.start1, feature.start2)
        feature.end = Math.max(feature.end1, feature.end2)
    }

    return feature
}

/**
 * Post-processing for longrange features.
 * Makes copies of inter-chromosomal features, one for each chromosome,
 * similar to bedpe format handling.
 * 
 * @param features - Array of features to process
 */
function fixLongrange(features) {

    if (features.length == 0) return

    // Make copies of inter-chr features, one for each chromosome
    const interChrFeatures = features.filter(f => f.chr1 !== f.chr2)
    for (let f1 of interChrFeatures) {
        const f2 = Object.assign({}, f1)
        f2.dup = true
        features.push(f2)

        f1.chr = f1.chr1
        f1.start = f1.start1
        f1.end = f1.end1

        f2.chr = f2.chr2
        f2.start = f2.start2
        f2.end = f2.end2
    }
}

export {decodeLongrange, fixLongrange}
