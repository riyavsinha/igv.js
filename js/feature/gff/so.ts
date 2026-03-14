/**
 * Some interpretations of the sequence ontology needed to assemble GFF transcripts.
 *
 */

const transcriptTypes: Set<string> = new Set(['transcript', 'primary_transcript', 'processed_transcript', 'mRNA', 'mrna',
    'lnc_RNA', 'miRNA', 'ncRNA', 'rRNA', 'scRNA', 'snRNA', 'snoRNA', 'tRNA'])
const cdsTypes: Set<string> = new Set(['CDS', 'cds', 'start_codon', 'stop_codon'])
const utrTypes: Set<string> = new Set(['5UTR', '3UTR', 'UTR', 'five_prime_UTR', 'three_prime_UTR', "3'-UTR", "5'-UTR"])
const exonTypes: Set<string> = new Set(['exon', 'coding-exon'])

const transcriptPartTypes: Set<string> = new Set()
for (let cltn of [cdsTypes, utrTypes, exonTypes]) {
    for (let t of cltn) {
        transcriptPartTypes.add(t)
    }
}

function isExon(type: string): boolean {
    return exonTypes.has(type)
}

function isIntron(type: string): boolean {
    return type.includes("intron")
}

function isCoding(type: string): boolean {
    return cdsTypes.has(type)
}

function isUTR(type: string): boolean {
    return utrTypes.has(type)
}

function isTranscript(type: string): boolean {
    return transcriptTypes.has(type) || type.endsWith("RNA") || type.endsWith("transcript")
}

function isTranscriptPart(type: string): boolean {
    return transcriptPartTypes.has(type) || type.endsWith("RNA") || isIntron(type)
}


export {isTranscript, isTranscriptPart, isExon, isIntron, isCoding, isUTR}
