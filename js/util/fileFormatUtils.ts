import {buildOptions} from "./igvUtils.js"
import BinaryParser from "../binary.js"
import {BGZip, igvxhr, StringUtils, FileUtils} from "../../node_modules/igv-utils/src/index.js"
import QTLParser from "../qtl/qtlParser.js"
import {isHiccups} from "../feature/decode/bedpe"
import GWASParser from "../gwas/gwasParser.js"

const BIGWIG_MAGIC_LTH: number = 0x888FFC26 // BigWig Magic Low to High
const BIGWIG_MAGIC_HTL: number = 0x26FC8F66 // BigWig Magic High to Low
const BIGBED_MAGIC_LTH: number = 0x8789F2EB // BigBed Magic Low to High
const BIGBED_MAGIC_HTL: number = 0xEBF28987 // BigBed Magic High to Low

const TDF_MAGIC: number[] = [84, 68, 70, 52]
const BAM_MAGIC: Uint8Array = new Uint8Array([0x42, 0x41, 0x4d, 0x01])
const CRAM_MAGIC: number[] = [67, 82, 65, 77]
const GZIP_MAGIC: number[] = [31, 139]
const FEXTRA: number = 4


const knownFileExtensions: Set<string> = new Set([

    "narrowpeak",
    "broadpeak",
    "regionpeak",
    "peaks",
    "bedgraph",
    "wig",
    "gff3",
    "gff",
    "gtf",
    "fusionjuncspan",
    "refflat",
    "seg",
    "aed",
    "bed",
    "bedMethyl",
    "vcf",
    "bb",
    "bigbed",
    "biginteract",
    "biggenepred",
    "bignarrowpeak",
    "bw",
    "bigwig",
    "bam",
    "tdf",
    "refgene",
    "genepred",
    "genepredext",
    "bedpe",
    "bp",
    "snp",
    "rmsk",
    "cram",
    "gwas",
    "maf",
    "mut",
    "hiccups",
    "fasta",
    "fa",
    "fna",
    "pytor",
    "hic",
    "qtl"
])

function compareArrays(a: Uint8Array | number[], b: Uint8Array | number[]): boolean {
    const len = Math.min(a.length, b.length)
    if(len == 0) return false
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) {
            return false
        }
    }
    return true

}

async function inferFileFormat(config: any): Promise<string | undefined | null> {

    let format: string | undefined | null

    // First try determining format from file extension
    const filename = config.filename || FileUtils.getFilename(config.url)
    if(filename) {
        format = await inferFileFormatFromName(filename)
    }

    // Try determining from first few bytes of file
    if (!format) {
        format = await inferFileFormatFromContents(config)
    }
    return format

}

function inferFileFormatFromName(fn: string): string | undefined {

    if (!fn) {
        return
    }
    fn = fn.toLowerCase()

    // Special case -- UCSC refgene files
    if (fn.endsWith("refgene.txt.gz") ||
        fn.endsWith("refgene.txt.bgz") ||
        fn.endsWith("refgene.txt") ||
        fn.endsWith("refgene.sorted.txt.gz") ||
        fn.endsWith("refgene.sorted.txt.bgz")) {
        return "refgene"
    }

    // String gzip extension
    if (fn.endsWith(".gz")) {
        fn = fn.substring(0, fn.length - 3)
    }
    if (fn.endsWith(".bgz")) {
        fn = fn.substring(0, fn.length - 4)
    }

    //Strip aux extensions .tsv, .tab, and .txt
    if (fn.endsWith(".txt") || fn.endsWith(".tab") || fn.endsWith(".tsv")) {
        fn = fn.substring(0, fn.length - 4)
    }

    const idx = fn.lastIndexOf(".")
    const ext = idx < 0 ? fn : fn.substring(idx + 1)

    switch (ext) {
        case "bw":
            return "bigwig"
        case "bb":
            return "bigbed"
        case "fasta":
        case "fa":
        case "fna":
            return "fasta"
        default:
            if (knownFileExtensions.has(ext)) {
                return ext
            } else {
                return undefined
            }

    }

}

function inferIndexPath(url: string, extension: string): string | undefined {

    if (StringUtils.isString(url)) {
        if (url.includes("?")) {
            const idx = url.indexOf("?")
            return url.substring(0, idx) + "." + extension + url.substring(idx)
        } else {
            return url + "." + extension
        }
    } else {
        return undefined
    }
}


async function inferFileFormatFromContents(config: any): Promise<string | null> {

    const url = config.url
    let options = buildOptions(config, {range: {start: 0, size: 1000}})
    let data = await igvxhr.loadArrayBuffer(url, options)

    let bytes = new Uint8Array(data)
    if (compareArrays(bytes, GZIP_MAGIC)) {

        const b = bytes[3] & FEXTRA
        if (b !== 0 && bytes[12] === 66 && bytes[13] === 67) {
            // This is BGZIPPED, read the first block
            const bssize = BGZip.bgzBlockSize(data)
            options = buildOptions(config, {range: {start: 0, size: bssize}})
            data = await igvxhr.loadArrayBuffer(url, options)
            bytes = BGZip.unbgzf(data)
        } else {
            // Not BGZipped, we need to read the entire file.  But we do anyway
            options = buildOptions(config, {})
            data = await igvxhr.loadArrayBuffer(url, options)
            bytes = BGZip.ungzip(data)
            config._filecontents = bytes

        }
    }

    // BAM and CRAM

    if (compareArrays(bytes, BAM_MAGIC)) {
        return "bam"
    }

    if (compareArrays(bytes, CRAM_MAGIC)) {
        return "cram"
    }

    // BIGWIG and BIGBED
    const littleEndian = true
    let binaryParser = new BinaryParser(new DataView(data), littleEndian)
    let magic = binaryParser.getUInt()

    if (magic === BIGWIG_MAGIC_LTH) {
        return "bigwig"
    } else if (magic === BIGBED_MAGIC_LTH) {
        return "bigbed"
    }

    // TDF
    if (compareArrays(bytes, TDF_MAGIC)) {
        return "tdf"
    }

    // Text formats
    const decoder = new TextDecoder("utf-8")
    const contents = decoder.decode(bytes)

    const lines = contents.split(/\r?\n/)
    const firstLine = lines[0]

    if (firstLine.startsWith("##fileformat=VCF")) {
        return "vcf"
    }
    if (firstLine.startsWith("##gff-version 3")) {
        return "gff3"
    }
    if (firstLine.startsWith("##gff-version")) {
        return "gff"
    }
    if(firstLine.startsWith("##fileformat=")) {
        return firstLine.substring(13).toLowerCase();   // Non standard extension of VCF convention
    }


    // QTL test must preceed GWAS test as GWAS files will also pass the QTL test
    if (QTLParser.isQTL(firstLine)) {
        return "qtl"
    }
    if (GWASParser.isGWAS(firstLine)) {
        return"gwas"
    }

    const columnNames = firstLine.split('\t')
    if (isHiccups(columnNames)) {
        return "hiccups"
    }

    // Format unknown
    return null
}


export {inferFileFormatFromContents}
export {inferIndexPath}
export {inferFileFormat}
export {knownFileExtensions}
