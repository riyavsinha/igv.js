interface ParsedRegion {
    chr: string
    start: number
    end: number
    locus: string
    bedRecord: string
}

function createRegionKey(chr: string, start: number, end: number): string {
    return `${chr}-${start}-${end}`
}

function parseRegionKey(regionKey: string): ParsedRegion {
    let regionParts = regionKey.split('-')
    let ee = parseInt(regionParts.pop()!)
    let ss = parseInt(regionParts.pop()!)
    let chr = regionParts.join('-')

    return {chr, start: ss, end: ee, locus: `${chr}:${ss}-${ee}`, bedRecord: `${chr}\t${ss}\t${ee}`}
}

export {createRegionKey, parseRegionKey}
