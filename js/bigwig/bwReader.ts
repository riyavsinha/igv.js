import RPTree from "./rpTree"
import BinaryParser from "../binary"
import {BGZip, igvxhr, StringUtils} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions, isDataURL} from "../util/igvUtils"
import getDecoder from "./bbDecoders"
import {parseAutoSQL} from "../util/ucscUtils"
import Trix from "./trix"
import BPTree from "./bpTree"
import ChromTree from "./chromTree"


const BIGWIG_MAGIC_LTH = 0x888FFC26 // BigWig Magic Low to High
const BIGWIG_MAGIC_HTL = 0x26FC8F66 // BigWig Magic High to Low
const BIGBED_MAGIC_LTH = 0x8789F2EB // BigBed Magic Low to High
const BIGBED_MAGIC_HTL = 0xEBF28987 // BigBed Magic High to Low
const BBFILE_HEADER_SIZE = 64
const BBFILE_EXTENDED_HEADER_HEADER_SIZE = 64
const BUFFER_SIZE = 512000     //  buffer

interface Loader {
    loadArrayBuffer(path: string, options?: object): Promise<ArrayBuffer>
}

interface BBHeader {
    bwVersion: number
    nZoomLevels: number
    chromTreeOffset: number
    fullDataOffset: number
    fullIndexOffset: number
    fieldCount: number
    definedFieldCount: number
    autoSqlOffset: number
    totalSummaryOffset: number
    uncompressBuffSize: number
    extensionOffset: number
    extraIndexCount?: number
    extraIndexOffsets?: number[]
}

interface AutoSql {
    table: string
    fields: { name: string }[]
}

interface WigFeature {
    chr: string
    start: number
    end: number
    value: number
    [key: string]: unknown
}

class BWReader {

    chrAliasTable: Map<string, string | undefined> = new Map()
    rpTreeCache: Map<number, RPTree> = new Map()
    path: string
    format: string
    genome: any
    config: Record<string, any>
    bufferSize: number
    loader: Loader
    littleEndian!: boolean
    type!: string
    header!: BBHeader
    chromTree!: ChromTree
    zoomLevelHeaders!: ZoomLevelHeader[]
    firstZoomDataOffset!: number
    totalSummary?: BWTotalSummary
    autoSql?: AutoSql
    featureDensity?: number
    _trix?: Trix
    _searchTrees?: BPTree[]

    constructor(config: Record<string, any>, genome: any) {
        this.path = config.url
        this.format = config.format || "bigwig"
        this.genome = genome
        this.config = config
        this.bufferSize = BUFFER_SIZE
        this.loader = isDataURL(this.path) ?
            new DataBuffer(BGZip.decodeDataURI(this.path).buffer) :
            igvxhr

        const trixURL: string | undefined = config.trixURL || config.searchTrix
        if (trixURL) {
            this._trix = new Trix(`${trixURL}x`, trixURL)
        }

    }

    /**
     * Preload all the data for this bb file
     * @returns {Promise<void>}
     */
    async preload(): Promise<void> {
        const data: ArrayBuffer = await igvxhr.loadArrayBuffer(this.path)
        this.loader = new DataBuffer(data)
        for (let rpTree of this.rpTreeCache.values()) {
            rpTree.loader = this.loader
        }
        if (this._searchTrees) {
            for (let bpTree of this._searchTrees) {
                bpTree.loader = this.loader
            }
        }
    }

    async readWGFeatures(wgChromosomeNames: string[], bpPerPixel: number, windowFunction: string): Promise<WigFeature[]> {

        await this.loadHeader()
        // Convert the logic to JavaScript
        let minID: number = Number.MAX_SAFE_INTEGER
        let maxID: number = -1
        let chr1: string | undefined
        let chr2: string | undefined

        for (const chr of wgChromosomeNames) {
            const id: number | undefined = await this.getIdForChr(chr)
            if (id === null || id === undefined) {
                continue
            }
            if (id < minID) {
                minID = id
                chr1 = chr
            }
            if (id > maxID) {
                maxID = id
                chr2 = chr
            }
        }

        return this.readFeatures(chr1!, 0, chr2!, Number.MAX_VALUE, bpPerPixel, windowFunction)
    }

    async readFeatures(chr1: string, bpStart: number, chr2: string, bpEnd: number, bpPerPixel?: number, windowFunction: string = "mean"): Promise<WigFeature[]> {

        if (!bpStart) bpStart = 0
        if (!bpEnd) bpEnd = Number.MAX_SAFE_INTEGER

        await this.loadHeader()

        const chrIdx1: number | undefined = await this.getIdForChr(chr1)
        const chrIdx2: number | undefined = await this.getIdForChr(chr2)

        if (chrIdx1 === undefined || chrIdx2 === undefined) {
            return []
        }

        let treeOffset: number
        let decodeFunction: (this: BWReader, data: DataView, chrIdx1: number, bpStart: number, chrIdx2: number, bpEnd: number, features: WigFeature[], windowFunction?: string, littleEndian?: boolean) => Promise<void>
        if (this.type === "bigwig") {
            // Select a biwig "zoom level" appropriate for the current resolution.
            const zoomLevelHeaders: ZoomLevelHeader[] = await this.getZoomHeaders()
            let zoomLevelHeader: ZoomLevelHeader | undefined = bpPerPixel ? zoomLevelForScale(bpPerPixel, zoomLevelHeaders) : undefined
            if (zoomLevelHeader && windowFunction != "none") {
                treeOffset = zoomLevelHeader.indexOffset
                decodeFunction = decodeZoomData
            } else {
                treeOffset = this.header.fullIndexOffset
                decodeFunction = decodeWigData
            }
        } else {
            // bigbed, zoom data is not currently used in igv for bed type features
            treeOffset = this.header.fullIndexOffset
            decodeFunction = getBedDataDecoder.call(this)
        }


        // Load the R Tree and fine leaf items
        const rpTree: RPTree = await this.loadRPTree(treeOffset)
        const leafItems: any[] = await rpTree.findLeafItemsOverlapping(chrIdx1, bpStart, chrIdx2, bpEnd)
        if (!leafItems || leafItems.length === 0) {
            return []
        } else {

            // Consolidate leaf items and get all data at once
            let start: number = Number.MAX_VALUE
            let end: number = 0
            for (let item of leafItems) {
                start = Math.min(start, item.dataOffset)
                end = Math.max(end, item.dataOffset + item.dataSize)
            }
            const size: number = end - start
            const arrayBuffer: ArrayBuffer = await this.loader.loadArrayBuffer(this.config.url, buildOptions(this.config, {
                range: {
                    start: start,
                    size: size
                }
            }))

            // Parse data and return features
            const features: WigFeature[] = []
            for (let item of leafItems) {
                const uint8Array: Uint8Array = new Uint8Array(arrayBuffer, item.dataOffset - start, item.dataSize)
                let plain: Uint8Array
                const isCompressed: boolean = this.header.uncompressBuffSize > 0
                if (isCompressed) {
                    plain = BGZip.inflate(uint8Array)
                } else {
                    plain = uint8Array
                }
                await decodeFunction.call(this, new DataView(plain.buffer), chrIdx1, bpStart, chrIdx2, bpEnd, features, windowFunction)
            }

            features.sort(function (a: WigFeature, b: WigFeature): number {
                return a.start - b.start
            })

            return features
        }
    }

    /**
     * Return the ID for the given chromosome name.  If there is no direct match, search for a chromosome alias.
     *
     * @param chr
     * @returns {Promise<*>}
     */
    async getIdForChr(chr: string): Promise<number | undefined> {

        if (this.chrAliasTable.has(chr)) {
            chr = this.chrAliasTable.get(chr)!
            if (!chr) {
                return undefined
            }
        }

        let chrIdx: number | undefined = await this.chromTree.getIdForName(chr)

        // Try alias
        if (chrIdx === undefined && this.genome) {
            const aliasRecord: Record<string, string> | undefined = await this.genome.getAliasRecord(chr)
            let alias: string | undefined
            if (aliasRecord) {
                for (let k of Object.keys(aliasRecord)) {
                    if (k === "start" || k === "end") continue
                    alias = aliasRecord[k]
                    if (alias === chr) continue   // Already tried this
                    chrIdx = await this.chromTree.getIdForName(alias!)
                    if (chrIdx !== undefined) {
                        break
                    }
                }
            }
            this.chrAliasTable.set(chr, alias)  // alias may be undefined => no alias exists. Setting prevents repeated attempts
        }
        return chrIdx
    }


    /**
     * Potentially searchable if a bigbed source.  Bigwig files are not searchable.
     * @returns {boolean}
     */
    get searchable(): boolean {
        return "bigbed" === this.type
    }

    /**
     * Search the extended BP tree for the search term, and return any matching features.  This only works
     * for BB sources with an "extended" BP tree for searching
     * @param term
     * @returns {Promise<void>}
     */
    async search(term: string): Promise<WigFeature | undefined> {
        if (!this.header) {
            await this.loadHeader()
        }
        if (!(this.header && this.header.extraIndexCount)) {
            return undefined
        }

        const region = await this._searchForRegions(term)   // Either 1 or no (undefined) reginos returned for now
        if (region) {
            const features = await this._loadFeaturesForRange(region.offset, region.length)
            if (features) {
                // Collect all matching features and return the largest
                const matching = features.filter((f: WigFeature) => {
                    // We could use the searchIndex parameter to pick an attribute (column),  but we don't know
                    // the names of all the columns and if they match IGV names
                    // TODO -- align all feature attribute names with UCSC, an use specific column
                    for (let key of Object.keys(f)) {
                        const v = f[key]
                        if (StringUtils.isString(v) && (v as string).toLowerCase() === term.toLowerCase()) {
                            return true
                        }
                    }
                    return false
                })
                if (matching.length > 0) {
                    return matching.reduce((l: WigFeature, f: WigFeature) => (l.end - l.start) > (f.end - f.start) ? l : f, matching[0])
                } else {
                    return undefined
                }
            }
        }
    }

    async _searchForRegions(term: string): Promise<{ offset: number; length: number } | undefined> {
        const searchTrees = await this.#getSearchTrees()
        if (searchTrees) {

            // Use a trix index if we have one to map entered term to indexed value in bb file
            if (this._trix) {
                const termLower: string = term.toLowerCase()
                const trixResults = await this._trix.search(termLower)
                if (trixResults && trixResults.has(termLower)) {   // <= exact matches only for now
                    term = trixResults.get(termLower)![0]
                }
            }

            // For now take the first match, we don't support multiple results
            for (let bpTree of searchTrees) {
                const result = await bpTree.search(term)
                if (result) {
                    return result as { offset: number; length: number }
                }
            }
        }
    }

    async #getSearchTrees(): Promise<BPTree[] | undefined> {

        if (this._searchTrees === undefined &&
            this.header.extraIndexOffsets &&
            this.header.extraIndexOffsets.length > 0) {
            this._searchTrees = []
            for (let offset of this.header.extraIndexOffsets) {
                const type: undefined = undefined
                const bpTree: BPTree = await BPTree.loadBpTree(this.path, this.config, offset, type, this.loader)
                this._searchTrees.push(bpTree)
            }
        }
        return this._searchTrees

    }

    async getZoomHeaders(): Promise<ZoomLevelHeader[]> {
        if (this.zoomLevelHeaders) {
            return this.zoomLevelHeaders
        } else {
            await this.loadHeader()
            return this.zoomLevelHeaders
        }
    }

    /**
     * The BB header consists of
     *  (1) the common header
     *  (2) the zoom headers
     *  (3) autosql
     *  (4) total summary block (version 2 and later)
     *
     *  In addition, we read the chromomsome B+ tree
     * @returns {Promise<*>}
     */
    async loadHeader(): Promise<BBHeader> {

        if (this.header) {
            return this.header
        } else {
            let data: ArrayBuffer = await this.loader.loadArrayBuffer(this.path, buildOptions(this.config, {
                range: {
                    start: 0,
                    size: BBFILE_HEADER_SIZE
                }
            }))

            let header: BBHeader

            // Assume low-to-high unless proven otherwise
            this.littleEndian = true

            const binaryParser: BinaryParser = new BinaryParser(new DataView(data), this.littleEndian)
            let magic: number = binaryParser.getUInt()
            if (magic === BIGWIG_MAGIC_LTH) {
                this.type = "bigwig"
            } else if (magic === BIGBED_MAGIC_LTH) {
                this.type = "bigbed"
            } else {
                //Try big endian order
                this.littleEndian = false

                binaryParser.littleEndian = false
                binaryParser.position = 0
                let magic: number = binaryParser.getUInt()

                if (magic === BIGWIG_MAGIC_HTL) {
                    this.type = "bigwig"
                } else if (magic === BIGBED_MAGIC_HTL) {
                    this.type = "bigbed"
                } else {
                    // TODO -- error, unknown file type  or BE
                }
            }
            // Table 5  "Common header for bigwig and bigbed files"
            header = {
                bwVersion: binaryParser.getUShort(),
                nZoomLevels: binaryParser.getUShort(),
                chromTreeOffset: binaryParser.getLong(),
                fullDataOffset: binaryParser.getLong(),
                fullIndexOffset: binaryParser.getLong(),
                fieldCount: binaryParser.getUShort(),
                definedFieldCount: binaryParser.getUShort(),
                autoSqlOffset: binaryParser.getLong(),
                totalSummaryOffset: binaryParser.getLong(),
                uncompressBuffSize: binaryParser.getInt(),
                extensionOffset: binaryParser.getLong()
            }

            // Read the next chunk containing zoom headers, autosql, and total summary if present.  TotalSummary size = 40 bytes
            const startOffset: number = BBFILE_HEADER_SIZE
            const size: number = header.totalSummaryOffset > 0 ?
                header.totalSummaryOffset - startOffset + 40 :
                Math.min(header.fullDataOffset, header.chromTreeOffset) - startOffset
            let range = {
                start: startOffset,
                size: size
            }
            data = await this.loader.loadArrayBuffer(this.path, buildOptions(this.config, {range: range}))
            const extHeaderParser: BinaryParser = new BinaryParser(new DataView(data), this.littleEndian)

            // Load zoom headers, store in order of decreasing reduction level (increasing resolution)
            const nZooms: number = header.nZoomLevels
            this.zoomLevelHeaders = []
            this.firstZoomDataOffset = Number.MAX_SAFE_INTEGER
            for (let i = 1; i <= nZooms; i++) {
                const zoomNumber: number = nZooms - i
                const zlh: ZoomLevelHeader = new ZoomLevelHeader(zoomNumber, extHeaderParser)
                this.firstZoomDataOffset = Math.min(zlh.dataOffset, this.firstZoomDataOffset)
                this.zoomLevelHeaders[zoomNumber] = zlh
            }

            // Autosql
            if (header.autoSqlOffset > 0) {
                extHeaderParser.position = header.autoSqlOffset - startOffset
                const autoSqlString: string = extHeaderParser.getString()
                if (autoSqlString) {
                    this.autoSql = parseAutoSQL(autoSqlString)
                }
            }

            // Total summary
            if (header.totalSummaryOffset > 0) {
                extHeaderParser.position = header.totalSummaryOffset - startOffset
                this.totalSummary = new BWTotalSummary(extHeaderParser)
            }

            this.chromTree = new ChromTree(this.path, this.config, header.chromTreeOffset, this.loader)
            await this.chromTree.init()

            // Estimate feature density from dataCount (bigbed only)
            if ("bigbed" === this.type) {
                const dataCount: number = await this.#readDataCount(header.fullDataOffset)
                this.featureDensity = dataCount / await this.chromTree.estimateGenomeSize()
            }

            this.header = header

            //extension
            if (header.extensionOffset > 0) {
                await this.loadExtendedHeader(header.extensionOffset)
            }
            return this.header
        }
    }

    async #readDataCount(offset: number): Promise<number> {
        const data: ArrayBuffer = await this.loader.loadArrayBuffer(this.path, buildOptions(this.config, {
            range: {
                start: offset,
                size: 4
            }
        }))
        const binaryParser: BinaryParser = new BinaryParser(new DataView(data), this.littleEndian)
        return binaryParser.getInt()
    }


    async loadExtendedHeader(offset: number): Promise<void> {

        let data: ArrayBuffer = await this.loader.loadArrayBuffer(this.path, buildOptions(this.config, {
            range: {
                start: offset,
                size: BBFILE_EXTENDED_HEADER_HEADER_SIZE
            }
        }))
        let binaryParser: BinaryParser = new BinaryParser(new DataView(data), this.littleEndian)
        const extensionSize: number = binaryParser.getUShort()
        const extraIndexCount: number = binaryParser.getUShort()
        const extraIndexListOffset: number = binaryParser.getLong()
        if (extraIndexCount === 0) return

        let sz: number = extraIndexCount * (2 + 2 + 8 + 4 + 10 * (2 + 2))
        data = await this.loader.loadArrayBuffer(this.path, buildOptions(this.config, {
            range: {
                start: extraIndexListOffset,
                size: sz
            }
        }))
        binaryParser = new BinaryParser(new DataView(data), this.littleEndian)

        const type: number[] = []
        const fieldCount: number[] = []
        const reserved: number[] = []
        const indexOffset: number[] = []
        for (let i = 0; i < extraIndexCount; i++) {

            type.push(binaryParser.getUShort())

            const fc: number = binaryParser.getUShort()
            fieldCount.push(fc)

            indexOffset.push(binaryParser.getLong())
            reserved.push(binaryParser.getInt())

            for (let j = 0; j < fc; j++) {
                const fieldId: number = binaryParser.getUShort()

                //const field = this.autoSql.fields[fieldId]
                //console.log(field)

                reserved.push(binaryParser.getUShort())
            }
        }
        this.header.extraIndexCount = extraIndexCount
        this.header.extraIndexOffsets = indexOffset
    }

    async loadRPTree(offset: number): Promise<RPTree> {

        let rpTree: RPTree | undefined = this.rpTreeCache.get(offset)
        if (rpTree) {
            return rpTree
        } else {
            rpTree = new RPTree(this.path, this.config, offset, this.loader)
            await rpTree.init()
            this.rpTreeCache.set(offset, rpTree)
            return rpTree
        }
    }

    async getType(): Promise<string> {
        await this.loadHeader()
        return this.type
    }

    async getTrackType(): Promise<string> {
        await this.loadHeader()
        if (this.type === "bigwig") {
            return "wig"
        } else {
            return this.autoSql && ("interact" === this.autoSql.table || "chromatinInteract" === this.autoSql.table) ? "interact" : "annotation"
        }
    }

    /**
     * Directly load features given a file offset and size.  Added to support search index.
     * @param offset
     * @param size
     * @private
     */
    async _loadFeaturesForRange(offset: number, size: number): Promise<WigFeature[]> {

        const arrayBuffer: ArrayBuffer = await this.loader.loadArrayBuffer(this.config.url, buildOptions(this.config, {
            range: {
                start: offset,
                size: size
            }
        }))

        const uint8Array: Uint8Array = new Uint8Array(arrayBuffer)
        const plain: Uint8Array = (this.header.uncompressBuffSize > 0) ? BGZip.inflate(uint8Array) : uint8Array
        const decodeFunction = getBedDataDecoder.call(this)
        const features: WigFeature[] = []
        await decodeFunction.call(this, new DataView(plain.buffer), 0, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, features)
        return features

    }
}


class ZoomLevelHeader {
    index: number
    reductionLevel: number
    reserved: number
    dataOffset: number
    indexOffset: number

    constructor(index: number, byteBuffer: BinaryParser) {
        this.index = index
        this.reductionLevel = byteBuffer.getUInt()
        this.reserved = byteBuffer.getInt()
        this.dataOffset = byteBuffer.getLong()
        this.indexOffset = byteBuffer.getLong()
    }
}

class BWTotalSummary {
    basesCovered: number
    minVal: number
    maxVal: number
    sumData: number
    sumSquares: number
    mean: number
    stddev: number
    defaultRange?: { min: number; max: number }

    constructor(byteBuffer?: BinaryParser) {
        if (byteBuffer) {
            this.basesCovered = byteBuffer.getLong()
            this.minVal = byteBuffer.getDouble()
            this.maxVal = byteBuffer.getDouble()
            this.sumData = byteBuffer.getDouble()
            this.sumSquares = byteBuffer.getDouble()
            this.mean = 0
            this.stddev = 0
            computeStats.call(this)
        } else {
            this.basesCovered = 0
            this.minVal = 0
            this.maxVal = 0
            this.sumData = 0
            this.sumSquares = 0
            this.mean = 0
            this.stddev = 0
        }
    }
}

function computeStats(this: BWTotalSummary): void {
    let n: number = this.basesCovered
    if (n > 0) {
        this.mean = this.sumData / n
        this.stddev = Math.sqrt(this.sumSquares / (n - 1))

        let min: number = this.minVal < 0 ? this.mean - 2 * this.stddev : 0,
            max: number = this.maxVal > 0 ? this.mean + 2 * this.stddev : 0

        this.defaultRange = {
            min: min,
            max: max
        }
    }
}

function zoomLevelForScale(bpPerPixel: number, zoomLevelHeaders: ZoomLevelHeader[]): ZoomLevelHeader | undefined {
    let level: ZoomLevelHeader | undefined
    for (let i = 0; i < zoomLevelHeaders.length; i++) {
        const zl: ZoomLevelHeader = zoomLevelHeaders[i]
        if (zl.reductionLevel < bpPerPixel) {
            level = zl
            break
        }
    }
    return level
}


async function decodeWigData(this: BWReader, data: DataView, chrIdx1: number, bpStart: number, chrIdx2: number, bpEnd: number, featureArray: WigFeature[], windowFunction?: string, littleEndian?: boolean): Promise<void> {

    const binaryParser: BinaryParser = new BinaryParser(data, littleEndian)
    const chromId: number = binaryParser.getInt()
    const blockStart: number = binaryParser.getInt()
    let chromStart: number = blockStart
    let chromEnd: number = binaryParser.getInt()
    const itemStep: number = binaryParser.getInt()
    const itemSpan: number = binaryParser.getInt()
    const type: number = binaryParser.getByte()
    const reserved: number = binaryParser.getByte()
    let itemCount: number = binaryParser.getUShort()

    if (chromId >= chrIdx1 && chromId <= chrIdx2) {

        let idx: number = 0
        while (itemCount-- > 0) {
            let value: number
            switch (type) {
                case 1:
                    chromStart = binaryParser.getInt()
                    chromEnd = binaryParser.getInt()
                    value = binaryParser.getFloat()
                    break
                case 2:
                    chromStart = binaryParser.getInt()
                    value = binaryParser.getFloat()
                    chromEnd = chromStart + itemSpan
                    break
                case 3:  // Fixed step
                    value = binaryParser.getFloat()
                    chromStart = blockStart + idx * itemStep
                    chromEnd = chromStart + itemSpan
                    idx++
                    break
            }

            if (chromId < chrIdx1 || (chromId === chrIdx1 && chromEnd < bpStart)) continue
            else if (chromId > chrIdx2 || (chromId === chrIdx2 && chromStart >= bpEnd)) break

            if (Number.isFinite(value!)) {
                const chr: string = await this.chromTree.getNameForId(chromId)
                featureArray.push({chr: chr!, start: chromStart, end: chromEnd, value: value!})
            }
        }
    }
}

function getBedDataDecoder(this: BWReader): (this: BWReader, data: DataView, chrIdx1: number, bpStart: number, chrIdx2: number, bpEnd: number, featureArray: WigFeature[]) => Promise<void> {

    const minSize: number = 3 * 4 + 1   // Minimum # of bytes required for a bed record
    const decoder = getDecoder(this.header.definedFieldCount, this.header.fieldCount, this.autoSql, this.format)
    return async function (this: BWReader, data: DataView, chrIdx1: number, bpStart: number, chrIdx2: number, bpEnd: number, featureArray: WigFeature[]): Promise<void> {

        const binaryParser: BinaryParser = new BinaryParser(data, this.littleEndian)
        while (binaryParser.remLength() >= minSize) {

            const chromId: number = binaryParser.getInt()
            const chr: string = await this.chromTree.getNameForId(chromId)
            const chromStart: number = binaryParser.getInt()
            const chromEnd: number = binaryParser.getInt()
            const rest: string = binaryParser.getString()
            if (chromId < chrIdx1 || (chromId === chrIdx1 && chromEnd < bpStart)) continue
            else if (chromId > chrIdx2 || (chromId === chrIdx2 && chromStart >= bpEnd)) break

            if (chromEnd > 0) {
                const feature: WigFeature = {chr: chr!, start: chromStart, end: chromEnd, value: 0}
                featureArray.push(feature)
                const tokens: string[] = rest.split("\t")
                if (decoder) {
                    decoder(feature as any, tokens)
                }
            }
        }
    }
}

async function decodeZoomData(this: BWReader, data: DataView, chrIdx1: number, bpStart: number, chrIdx2: number, bpEnd: number, featureArray: WigFeature[], windowFunction?: string, littleEndian?: boolean): Promise<void> {

    const binaryParser: BinaryParser = new BinaryParser(data, littleEndian)
    const minSize: number = 8 * 4  // Minimum # of bytes required for a zoom record


    while (binaryParser.remLength() >= minSize) {
        const chromId: number = binaryParser.getInt()
        const chromStart: number = binaryParser.getInt()
        const chromEnd: number = binaryParser.getInt()
        const validCount: number = binaryParser.getInt()
        const minVal: number = binaryParser.getFloat()
        const maxVal: number = binaryParser.getFloat()
        const sumData: number = binaryParser.getFloat()
        const sumSquares: number = binaryParser.getFloat()
        let value: number
        switch (windowFunction) {
            case "min":
                value = minVal
                break
            case "max":
                value = maxVal
                break
            default:
                value = validCount === 0 ? 0 : sumData / validCount
        }

        if (chromId < chrIdx1 || (chromId === chrIdx1 && chromEnd < bpStart)) continue
        else if (chromId > chrIdx2 || (chromId === chrIdx2 && chromStart >= bpEnd)) break


        if (Number.isFinite(value)) {
            const chr: string = await this.chromTree.getNameForId(chromId)
            featureArray.push({chr: chr!, start: chromStart, end: chromEnd, value: value})


        }
    }
}

class DataBuffer implements Loader {

    data: ArrayBuffer

    constructor(data: ArrayBuffer) {
        this.data = data
    }

    /**
     * igvxhr interface
     * @param ignore
     * @param options
     * @returns {any}
     */
    loadArrayBuffer(ignore: string, options: Record<string, any>): Promise<ArrayBuffer> {
        const range: { start: number; size: number } | undefined = options.range
        const result: ArrayBuffer = range ? this.data.slice(range.start, range.start + range.size) : this.data
        return Promise.resolve(result)
    }

    /**
     * BufferedReader interface
     *
     * @param requestedRange - byte rangeas {start, size}
     * @param asUint8 - optional flag to return result as an UInt8Array
     */
    async dataViewForRange(requestedRange: { start: number; size: number }, asUint8?: boolean): Promise<Uint8Array | DataView> {
        const len: number = Math.min(this.data.byteLength - requestedRange.start, requestedRange.size)
        return asUint8 ?
            new Uint8Array(this.data, requestedRange.start, len) :
            new DataView(this.data, requestedRange.start, len)
    }
}


export default BWReader
