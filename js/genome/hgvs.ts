import {getCodingLength, getCodingStart, getCodingEnd} from "../feature/exonUtils"
import {searchFeatures} from "../searchFeatures"

const log: Console = console

function isValidHGVS(notation: string): boolean {
    if (!notation) return false
    // We only need to validate that we can parse the notation in the search method.
    // Check for basic structure: <accession>:g.<position> or <accession>:c.<position> or <accession>:p.<position>
    // We don't validate the variant details since we only need the position for searching.

    // Genomic: g.\d+ (with optional range and anything after)
    const genomic: string = "g\\.\\d+.*"
    // Coding: c. followed by optional -, *, then digits, with optional intronic offset and anything after
    const coding: string = "c\\.[-*]?\\d+.*"
    // Non-coding: n. followed by optional leading '-' then digits, anything after
    const nonCoding: string = "n\\.-?\\d+.*"
    // Protein: p. followed by optional AA letters, digits, with optional range and anything after
    const protein: string = "p\\.[A-Za-z*]*\\d+.*"
    // Optional gene symbol in parentheses immediately after accession
    const accessionWithOptionalGene: string = "^[A-Za-z0-9_.]+(?:\\([^)]+\\))?"

    const pattern: RegExp = new RegExp(accessionWithOptionalGene + ":(?:" + genomic + "|" + coding + "|" + nonCoding + "|" + protein + ")$")
    return pattern.test(notation)
}

interface SearchResult {
    resultType?: string
    chr: string
    start: number
    end: number
}

/**
 * Searches for the given HGVS notation in the provided genome.
 * Returns a SearchResult with the corresponding chromosome and position if found,
 * otherwise returns null.
 */
async function search(hgvs: string, browser: any): Promise<SearchResult | null> {

    if (!isValidHGVS(hgvs)) {
        return null
    }

    const genome: any = browser.genome

    // Determine type and extract accession and position
    const idxG: number = hgvs.indexOf(":g.")
    const idxC: number = hgvs.indexOf(":c.")
    const idxP: number = hgvs.indexOf(":p.")
    const idxN: number = hgvs.indexOf(":n.")
    let type: string
    let idx: number
    if (idxG >= 0) {
        type = "g"
        idx = idxG
    } else if (idxC >= 0) {
        type = "c"
        idx = idxC
    } else if (idxN >= 0) {
        type = "n"
        idx = idxN
    } else if (idxP >= 0) {
        type = "p"
        idx = idxP
    } else {
        return null
    }
    let accession: string = hgvs.substring(0, idx)
    // Strip optional trailing gene symbol in parentheses, e.g., "NM_000302.3(PLOD1)" -> "NM_000302.3"
    if (accession.endsWith(")")) {
        const openIdx: number = accession.lastIndexOf('(')
        if (openIdx > 0) {
            accession = accession.substring(0, openIdx)
        }
    }
    const positionPart: string = hgvs.substring(idx + 3) // skip ':g.' or ':c.' or ':p.'

    if (type === "g") {
        if (!positionPart) return null
        // Match genomic positions including:
        // - Simple position: 123
        // - Range: 123_456
        // - Uncertain positions: 123_? or ?_456 or (123_456)
        // Extract just the numeric positions, ignoring variant notation after
        const match: RegExpMatchArray | null = positionPart.match(/^\(?(\d+)(?:_(\d+|\?))?/)
        if (!match) return null
        const start: number = parseInt(match[1], 10)
        const endGroup: string | undefined = match[2]
        // If end is '?' or undefined, use start as end
        const end: number = (endGroup && endGroup !== '?') ? parseInt(endGroup, 10) : start
        const aliasRecord: any = await genome.getAliasRecord(accession)
        const chr: string = aliasRecord ? aliasRecord.chr : accession
        return {chr, start: start - 1, end: end}

    } else if (type === "p") {

        // Protein notation not supported for search currently.  The code below is ported from Java and kept for
        // future reference.
        return null

        // // Protein position mapping: map codon(s) to genomic span.
        // const transcript = await getTranscript(browser, accession)
        // if (!transcript) return null
        //
        // const proteinPart = positionPart
        // const pm = proteinPart.match(/^[A-Za-z*]{0,3}(\d+)(?:_[A-Za-z*]{0,3}(\d+))?/)
        // if (!pm) return null
        // let p1 = parseInt(pm[1], 10)
        // const p2Str = pm[2]
        // let p2 = p1
        // if (p2Str) {
        //     p2 = parseInt(p2Str, 10)
        // }
        //
        // const codon1 = transcript.getCodon(genome, transcript.chr, p1)
        // if (!codon1 || !codon1.isGenomePositionsSet()) return null
        // let start1 = Math.min(...codon1.getGenomePositions())
        // let end1 = Math.max(...codon1.getGenomePositions())
        //
        // let regionStart = start1
        // let regionEnd = end1
        // if (p2 !== p1) {
        //     const codon2 = transcript.getCodon(genome, transcript.chr, p2)
        //     if (!codon2 || !codon2.isGenomePositionsSet()) return null
        //     let start2 = Math.min(...codon2.getGenomePositions())
        //     let end2 = Math.max(...codon2.getGenomePositions())
        //     regionStart = Math.min(start1, start2)
        //     regionEnd = Math.max(end1, end2)
        // }
        // const halfOpenEnd = regionEnd + 1
        // return {chr: transcript.chr, start: regionStart, end: halfOpenEnd}

    } else if (type === "n") {

        // Non-coding transcript mapping: n.123 or n.-123 maps relative to transcript start
        const transcript: any = await getTranscript(browser, accession)
        if (!transcript) return null

        // Parse signed position with optional range and intronic offset (e.g., n.123, n.123_456, n.-7080_-1781, n.123+5)
        const matcher: RegExpMatchArray | null = positionPart.match(/^(-?\d+)(?:_(-?\d+))?([+-]\d+)?/)
        if (!matcher) return null

        const t1: number = parseInt(matcher[1], 10)
        const t2Str: string | undefined = matcher[2]
        const t2: number = t2Str != null ? parseInt(t2Str, 10) : t1

        // Map both transcript positions to genomic
        let g1: number = transcriptPositionToGenomicPosition(transcript, t1)
        let g2: number = transcriptPositionToGenomicPosition(transcript, t2)
        if (g1 <= 0 || g2 <= 0) return null

        // Apply intronic offset (if any) to BOTH endpoints, strand-aware
        const offsetStr: string | undefined = matcher[3]
        if (offsetStr) {
            let offset: number = parseInt(offsetStr, 10)
            if (transcript.strand === '-') offset = -offset
            g1 += offset
            g2 += offset
        }

        // Normalize to genomic span regardless of strand
        const regionStart: number = Math.min(g1, g2)
        const regionEndInclusive: number = Math.max(g1, g2)
        const halfOpenEnd: number = regionEndInclusive + 1
        return {chr: transcript.chr, start: regionStart, end: halfOpenEnd}

    } else { // "c"

        const transcript: any = await getTranscript(browser, accession)
        if (transcript) {
            // UTR 5' c.-N with optional range and intronic offset (e.g., c.-211_-215 or c.-211-1058C>G)
            const utr5Matcher: RegExpMatchArray | null = positionPart.match(/^-(\d+)(?:_-(\d+))?([+-]\d+)?/)
            if (utr5Matcher) {
                const n1: number = parseInt(utr5Matcher[1], 10)
                const n2Str: string | undefined = utr5Matcher[2]
                const n2: number | null = n2Str != null ? parseInt(n2Str, 10) : null
                const firstCodingGenomic: number = codingToGenomePosition(transcript, 1)
                if (firstCodingGenomic > 0) {
                    let g1: number = transcript.strand === '+' ? (firstCodingGenomic - n1) : (firstCodingGenomic + n1)
                    let g2: number = g1
                    if (n2 != null) {
                        g2 = transcript.strand === '+' ? (firstCodingGenomic - n2) : (firstCodingGenomic + n2)
                    }
                    // Apply intronic offset (single value) to both ends if present
                    const offsetStr: string | undefined = utr5Matcher[3]
                    if (offsetStr) {
                        let offset: number = parseInt(offsetStr, 10)
                        if (transcript.strand === '-') offset = -offset
                        g1 += offset
                        g2 += offset
                    }
                    const start: number = Math.min(g1, g2)
                    const endInclusive: number = Math.max(g1, g2)
                    const endExclusive: number = endInclusive + 1
                    return {resultType: "LOCUS", chr: transcript.chr, start, end: endExclusive}
                }
                return null
            }

            // UTR 3' c.*N with optional range and intronic offset (e.g., c.*526_*529delATCA or c.*123+45)
            const utr3Matcher: RegExpMatchArray | null = positionPart.match(/^\*(\d+)(?:_\*(\d+))?([+-]\d+)?/)
            if (utr3Matcher) {
                const n1: number = parseInt(utr3Matcher[1], 10)
                const n2Str: string | undefined = utr3Matcher[2]
                const n2: number | null = n2Str != null ? parseInt(n2Str, 10) : null
                let codingLen: number = 0
                if (transcript.exons) {
                    for (const exon of transcript.exons) {
                        codingLen += getCodingLength(exon)
                    }
                }
                if (codingLen > 0) {
                    const lastCodingGenomic: number = codingToGenomePosition(transcript, codingLen)
                    if (lastCodingGenomic > 0) {
                        let g1: number = transcript.strand === '+' ? (lastCodingGenomic + n1) : (lastCodingGenomic - n1)
                        let g2: number = g1
                        if (n2 != null) {
                            g2 = transcript.strand === '+' ? (lastCodingGenomic + n2) : (lastCodingGenomic - n2)
                        }
                        // Apply intronic offset (single value) to both ends if present
                        const offsetStr: string | undefined = utr3Matcher[3]
                        if (offsetStr) {
                            let offset: number = parseInt(offsetStr, 10)
                            if (transcript.strand === '-') offset = -offset
                            g1 += offset
                            g2 += offset
                        }
                        const start: number = Math.min(g1, g2)
                        const endInclusive: number = Math.max(g1, g2)
                        const endExclusive: number = endInclusive + 1
                        return {resultType: "LOCUS", chr: transcript.chr, start, end: endExclusive}
                    }
                }
                return null
            }

            // CDS position with optional range
            // First parse endpoints c.X(_Y)? ignoring intronic offsets
            const cpos: RegExpMatchArray | null = positionPart.match(/^(\d+)(?:_(\d+))?/)
            if (!cpos) return null
            const c1: number = parseInt(cpos[1], 10)
            const c2Str: string | undefined = cpos[2]
            const c2: number = c2Str != null ? parseInt(c2Str, 10) : c1

            // Map both coding positions to genomic
            let g1: number = codingToGenomePosition(transcript, c1)
            let g2: number = codingToGenomePosition(transcript, c2)
            if (g1 <= 0 || g2 <= 0) return null

            // Now parse optional intronic offsets for each endpoint separately
            // Patterns like: 123+5 or 123-2 at the beginning, optionally followed by _ and second with offset
            const offs: RegExpMatchArray | null = positionPart.match(/^(\d+)([+-]\d+)?(?:_(\d+)([+-]\d+)?)?/)
            if (offs) {
                const off1Str: string | undefined = offs[2]
                const off2Str: string | undefined = offs[4]
                if (off1Str) {
                    let off1: number = parseInt(off1Str, 10)
                    if (transcript.strand === '-') off1 = -off1
                    g1 += off1
                }
                if (off2Str) {
                    let off2: number = parseInt(off2Str, 10)
                    if (transcript.strand === '-') off2 = -off2
                    g2 += off2
                }
            }

            // If there is no explicit second coding position, ensure single-site locus
            if (c2Str == null) {
                g2 = g1
            }

            const start: number = Math.min(g1, g2)
            const endInclusive: number = Math.max(g1, g2)
            const endExclusive: number = endInclusive + 1
            return {chr: transcript.chr, start, end: endExclusive}
        }
        return null
    }

}

async function getTranscript(browser: any, accession: string): Promise<any> {
    return searchFeatures(browser, accession)
}

/**
 * Convert a transcript position (1-based, from transcription start) to genomic position
 * for non-coding transcripts. Walks through exons to find the genomic coordinate.
 */
function transcriptPositionToGenomicPosition(transcript: any, transcriptPos: number): number {
    // Handle positions upstream of transcript start (negative n. values)
    if (transcriptPos <= 0) {
        const d: number = Math.abs(transcriptPos)
        return transcript.strand === '+' ? (transcript.getStart() - d) : (transcript.getEnd() + d)
    }

    const exons: any[] | undefined = transcript.exons
    if (!exons || exons.length === 0) {
        // No exons, treat as simple feature
        if (transcript.strand === '+') {
            return transcript.getStart() + transcriptPos - 1
        } else {
            return transcript.getEnd() - transcriptPos + 1
        }
    }

    const positive: boolean = transcript.strand === '+'
    let accumulatedLength: number = 0

    // Sort exons appropriately based on strand
    const sortedExons: any[] = exons.slice()
    if (!positive) {
        sortedExons.sort((e1: any, e2: any) => e2.getStart() - e1.getStart())
    } else {
        sortedExons.sort((e1: any, e2: any) => e1.getStart() - e2.getStart())
    }

    for (const exon of sortedExons) {
        const exonLength: number = exon.getEnd() - exon.getStart()
        if (accumulatedLength + exonLength >= transcriptPos) {
            // Position is in this exon
            const offsetInExon: number = transcriptPos - accumulatedLength - 1
            if (positive) {
                return exon.getStart() + offsetInExon
            } else {
                return exon.getEnd() - offsetInExon - 1
            }
        }
        accumulatedLength += exonLength
    }

    // Position beyond transcript end
    return -1
}

/**
 * Translate a 1-based coding position to a 0-based genomic position.  Supports HGVS parsing
 *
 * @param feature The transcript feature
 * @param codingPosition 1-based coding position
 * @return 0-based genomic position, or -1 if not found.
 */
function codingToGenomePosition(feature: any, codingPosition: number): number {
    if (codingPosition <= 0) {
        return -1
    }
    const cdna: number = codingPosition - 1  // Convert to 0-based

    const exons: any[] | undefined = feature.exons
    if (!exons) {
        return -1
    }

    const strand: string = feature.strand
    // if (strand === 'NONE') {
    //     throw new Error("Cannot translate from coding position on an unstranded feature.")
    // }
    const positive: boolean = strand === '+'

    let codingLength: number = 0
    for (let i: number = 0; i < exons.length; i++) {
        const exon: any = positive ? exons[i] : exons[exons.length - 1 - i]
        const exonCodingLength: number = getCodingLength(exon)
        if (codingLength + exonCodingLength > cdna) {
            const cdnaOffset: number = cdna - codingLength
            if (positive) {
                return getCodingStart(exon) + cdnaOffset
            } else {
                return getCodingEnd(exon) - 1 - cdnaOffset
            }
        }
        codingLength += exonCodingLength
    }

    return -1
}

/**
 * Returns genomic HGVS notation: <RefSeqAccession>:g.<position>
 * Example: NC_000001.11:g.1234567
 */
async function getHGVSPosition(genome: any, chr: string, position: number): Promise<string | undefined> {
    try {
        const aliasRecord: any = await genome.getAliasRecord(chr)
        let accession: string | null = null

        if (aliasRecord) {
            for (const alias of Object.values(aliasRecord) as string[]) {
                if (alias.startsWith("NC_") || alias.startsWith("NT_") || alias.startsWith("NW_") ||
                    alias.startsWith("NG_") || alias.startsWith("NM_") || alias.startsWith("NR_") ||
                    alias.startsWith("NP_")) {
                    accession = alias
                    break
                }
            }
        }

        if (!accession) {
            accession = chr
        }

        return `${accession}:g.${position}`
    } catch (e) {
        log.error("Error getting HGVS position", e)
        return undefined
    }
}

/**
 * Returns HGVS annotation for the position, for ref and alt bases.  If a MANE transcript is available that is
 * used with coding notation (c.), otherwise genome position is used with genomic notation (g.).
 * Example: NM_000302.3:c.1234A>G or NM_000302.3:c.123+5T>C (intronic) or NC_000001.11:g.1234567G>A
 *
 * @param genome The genome
 * @param chr The chromosome name
 * @param position The genomic position (0-based)
 * @param reference The reference base (single-character string)
 * @param alternate The alternate base (single-character string)
 * @return HGVS notation string, or undefined if error
 */
async function createHGVSAnnotation(genome: any, chr: string, position: number, reference: string, alternate: string): Promise<string | undefined> {

    try {
        const transcript: any = await genome.getManeTranscriptAt(chr, position)

        if (transcript && transcript.exons) {

            // Ensure bases are uppercase
            reference = reference.toUpperCase()
            alternate = alternate.toUpperCase()

            if (transcript.strand === '-') {
                reference = complementBase(reference)
                alternate = complementBase(alternate)
            }


            let positionString: string = ""

            let transcriptName: string | undefined = transcript.name
            for (const key of Object.keys(transcript)) {
                const value: any = transcript[key]
                if (typeof value === 'string' && (value.startsWith("NM_") || value.startsWith("NR_"))) {
                    transcriptName = value
                    break
                }
            }

            if (transcriptName) {
                // Check if position is within an exon (coding or non-coding)
                let positionIsInExon: boolean = false
                for (const exon of transcript.exons) {
                    if (position >= exon.start && position < exon.end) {
                        positionIsInExon = true
                        break
                    }
                }

                const positive: boolean = transcript.strand === '+'

                if (positionIsInExon) {
                    // Try to convert to coding position
                    const codingPosition: number = genomeToCodingPosition(position, positive, transcript.exons)

                    if (codingPosition >= 0) {
                        // Position is in a coding region, return c. notation (1-based)
                        positionString = `${transcriptName}:c.${codingPosition + 1}`
                    } else {
                        // Position is in an exon but not coding - check if in UTR
                        const firstCodingPos: number = codingToGenomePosition(transcript, 1)
                        if (firstCodingPos > 0) {
                            // Calculate total coding length
                            let codingLen: number = 0
                            for (const exon of transcript.exons) {
                                codingLen += getCodingLength(exon)
                            }
                            const lastCodingPos: number = codingToGenomePosition(transcript, codingLen)

                            // Check if in 5' UTR
                            if ((positive && position < firstCodingPos) || (!positive && position > firstCodingPos)) {
                                const distance: number = Math.abs(position - firstCodingPos)
                                positionString = `${transcriptName}:c.-${distance}`
                            }
                            // Check if in 3' UTR
                            else if ((positive && position >= lastCodingPos) || (!positive && position <= lastCodingPos)) {
                                const distance: number = Math.abs(position - lastCodingPos) + 1
                                positionString = `${transcriptName}:c.*${distance}`
                            }
                        }
                    }
                } else {
                    // Position is intronic - find nearest exon boundary
                    // For HGVS, we reference the last coding base in the nearest exon
                    let nearestExonEdge: number = -1
                    let nearestCodingPos: number = -1
                    let minDistance: number = Number.MAX_SAFE_INTEGER

                    for (const exon of transcript.exons) {
                        if (getCodingLength(exon) === 0) continue // Skip non-coding exons

                        // Check distance to the last coding base at the start side of the exon
                        // exon.start is 0-based inclusive
                        const distToStart: number = Math.abs(position - exon.start)
                        if (distToStart > 0 && distToStart < minDistance) {
                            minDistance = distToStart
                            nearestExonEdge = exon.start
                            // Get coding position of first base in this exon
                            nearestCodingPos = genomeToCodingPosition(getCodingStart(exon), positive, transcript.exons)
                        }

                        // Check distance to the last coding base at the end side of the exon
                        // exon.end is 0-based exclusive, so last base is at end-1
                        const distToEnd: number = Math.abs(position - (exon.end - 1))
                        if (distToEnd > 0 && distToEnd < minDistance) {
                            minDistance = distToEnd
                            nearestExonEdge = exon.end - 1
                            // Get coding position of last base in this exon
                            nearestCodingPos = genomeToCodingPosition(getCodingEnd(exon) - 1, positive, transcript.exons)
                        }
                    }

                    if (nearestCodingPos >= 0) {
                        // Calculate offset: positive = downstream of exon, negative = upstream of exon
                        let offset: number = position - nearestExonEdge
                        // For positive strand: + means to the right, - means to the left
                        // For negative strand: + means to the left (genomically), - means to the right
                        // But in HGVS, the sign is relative to transcript direction, so we need to flip for negative strand
                        if (!positive) {
                            offset = -offset
                        }
                        const sign: string = offset >= 0 ? "+" : ""
                        positionString = `${transcriptName}:c.${nearestCodingPos + 1}${sign}${offset}`
                    }
                }
            }

            return positionString + reference + ">" + alternate
        }

        // Fallback to genomic notation
        const aliasRecord: any = await genome.getAliasRecord(chr)
        let accession: string = chr

        if (aliasRecord) {
            for (const alias of Object.values(aliasRecord) as string[]) {
                if (alias.startsWith("NC_") || alias.startsWith("NT_") || alias.startsWith("NW_") ||
                    alias.startsWith("NG_") || alias.startsWith("NM_") || alias.startsWith("NR_") ||
                    alias.startsWith("NP_")) {
                    accession = alias
                    break
                }
            }
        }

        // HGVS genomic coordinate is 1-based; position parameter is 0-based
        return `${accession}:g.${position + 1}${reference}>${alternate}`
    } catch (e) {
        log.error("Error creating HGVS annotation", e)
        return undefined
    }
}

// Helper function to complement a base (string)
function complementBase(base: string): string {
    const complementMap: Record<string, string> = { 'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C' }
    return complementMap[base] || base
}

function genomeToCodingPosition(genomePosition: number, positive: boolean, exons: any[]): number {

    if (exons) {

        /*
         We loop over all exons, either from the beginning or the end.
         Increment position only on coding regions.
         */

        let codingOffset: number = 0

        for (let exnum: number = 0; exnum < exons.length; exnum++) {

            const exon: any = positive ? exons[exnum] : exons[exons.length - 1 - exnum]

            if (exon.start <= genomePosition && exon.end > genomePosition) {
                const delta: number = positive
                    ? genomePosition - getCodingStart(exon)
                    : getCodingEnd(exon) - genomePosition - 1
                return codingOffset + delta
            }

            codingOffset += getCodingLength(exon)
        }
    }
    return -1
}



export const HGVS = {
    isValidHGVS,
    search,
    getHGVSPosition,
    createHGVSAnnotation
}
