import BinaryParser from "../binary"
import {BGZip, igvxhr} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions} from "../util/igvUtils"

const GZIP_FLAG: number = 0x1

interface IndexEntry {
    position: number
    size: number
}

type TileIndex = IndexEntry

interface Dataset {
    name: string
    attributes: Record<string, string>
    dataType: string
    tileWidth: number
    tiles: TileIndex[]
}

interface FixedStepTile {
    type: "fixedStep"
    start: number
    span: number
    data: number[][]
    nTracks: number
    nPositions: number
}

interface VariableStepTile {
    type: "variableStep"
    tileStart: number
    span: number
    start: number[]
    data: number[][]
    nTracks: number
    nPositions: number
}

interface BedTile {
    type: "bed" | "bedWithName"
    start: number[]
    end: number[]
    data: number[][]
    nTracks: number
    nPositions: number
}

type Tile = FixedStepTile | VariableStepTile | BedTile

interface Genome {
    getChromosomeName(chr: string): string
}

class TDFReader {

    config: Record<string, any>
    genome: Genome
    path: string
    groupCache: Record<string, Record<string, string>>
    datasetCache: Record<string, Dataset>
    magic: number | undefined
    version: number | undefined
    indexPos: number | undefined
    indexSize: number | undefined
    windowFunctions: string[] | undefined
    trackType: string | undefined
    trackLine: string | undefined
    trackNames: string[] | undefined
    genomeID: string | undefined
    flags: number | undefined
    compressed: boolean | undefined
    datasetIndex: Record<string, IndexEntry> | undefined
    groupIndex: Record<string, IndexEntry> | undefined
    maxZoom: number | undefined
    chrAliasTable: Record<string, string> | undefined

    constructor(config: Record<string, any>, genome: Genome) {
        this.config = config
        this.genome = genome
        this.path = config.url
        this.groupCache = {}
        this.datasetCache = {}
    }


    async readHeader(): Promise<TDFReader> {

        if (this.magic !== undefined) {
            return this   // Already read
        }

        let data: ArrayBuffer = await igvxhr.loadArrayBuffer(this.path, buildOptions(this.config, {range: {start: 0, size: 64000}}))
        let binaryParser = new BinaryParser(new DataView(data))
        this.magic = binaryParser.getInt()
        this.version = binaryParser.getInt()
        this.indexPos = binaryParser.getLong()
        this.indexSize = binaryParser.getInt()
        const headerSize: number = binaryParser.getInt()


        if (this.version >= 2) {
            let nWindowFunctions: number = binaryParser.getInt()
            this.windowFunctions = []
            while (nWindowFunctions-- > 0) {
                this.windowFunctions.push(binaryParser.getString())
            }
        }

        this.trackType = binaryParser.getString()
        this.trackLine = binaryParser.getString()

        let nTracks: number = binaryParser.getInt()
        this.trackNames = []
        while (nTracks-- > 0) {
            this.trackNames.push(binaryParser.getString())
        }
        this.genomeID = binaryParser.getString()
        this.flags = binaryParser.getInt()
        this.compressed = (this.flags & GZIP_FLAG) !== 0

        // Now read index
        data = await igvxhr.loadArrayBuffer(this.path, buildOptions(this.config, {
            range: {
                start: this.indexPos,
                size: this.indexSize
            }
        }))
        binaryParser = new BinaryParser(new DataView(data))
        this.datasetIndex = {}
        let nEntries: number = binaryParser.getInt()
        while (nEntries-- > 0) {
            const name: string = binaryParser.getString()
            const pos: number = binaryParser.getLong()
            const size: number = binaryParser.getInt()
            this.datasetIndex[name] = {position: pos, size: size}
        }

        this.groupIndex = {}
        nEntries = binaryParser.getInt()
        while (nEntries-- > 0) {
            const name: string = binaryParser.getString()
            const pos: number = binaryParser.getLong()
            const size: number = binaryParser.getInt()
            this.groupIndex[name] = {position: pos, size: size}
        }

        return this
    }

    async readDataset(chr: string, windowFunction: string, zoom: number | undefined): Promise<Dataset | undefined> {

        const key: string = chr + "_" + windowFunction + "_" + zoom

        if (this.datasetCache[key]) {
            return this.datasetCache[key]

        } else {
            await this.readHeader()
            const wf: string = (this.version! < 2) ? "" : "/" + windowFunction
            const zoomString: string = (chr.toLowerCase() === "all" || zoom === undefined) ? "0" : zoom.toString()

            let dsName: string
            if (windowFunction === "raw") {
                dsName = "/" + chr + "/raw"
            } else {
                dsName = "/" + chr + "/z" + zoomString + wf
            }
            const indexEntry = this.datasetIndex![dsName]

            if (indexEntry === undefined) {
                return undefined
            }

            const data: ArrayBuffer = await igvxhr.loadArrayBuffer(this.path, buildOptions(this.config, {
                range: {
                    start: indexEntry.position,
                    size: indexEntry.size
                }
            }))

            if (!data) {
                return undefined
            }

            const binaryParser = new BinaryParser(new DataView(data))
            let nAttributes: number = binaryParser.getInt()
            const attributes: Record<string, string> = {}
            while (nAttributes-- > 0) {
                attributes[binaryParser.getString()] = binaryParser.getString()
            }
            const dataType: string = binaryParser.getString()
            const tileWidth: number = binaryParser.getFloat()
            let nTiles: number = binaryParser.getInt()
            const tiles: TileIndex[] = []
            while (nTiles-- > 0) {
                tiles.push({position: binaryParser.getLong(), size: binaryParser.getInt()})
            }

            const dataset: Dataset = {
                name: dsName,
                attributes: attributes,
                dataType: dataType,
                tileWidth: tileWidth,
                tiles: tiles
            }

            this.datasetCache[key] = dataset
            return dataset
        }
    }

    async readRootGroup(): Promise<Record<string, string>> {

        const genome = this.genome
        const rootGroup = this.groupCache["/"]
        if (rootGroup) {
            return rootGroup
        } else {

            const group = await this.readGroup("/")
            const names = group!["chromosomes"]
            const maxZoomString = group!["maxZoom"]

            // Now parse out interesting attributes.
            if (maxZoomString) {
                this.maxZoom = Number(maxZoomString)
            }

            const totalCountString = group!["totalCount"]
            if (totalCountString) {
                (group as any).totalCount = Number(totalCountString)
            }

            // Chromosome names
            const chrAliasTable: Record<string, string> = {}
            if (names) {
                names.split(",").forEach(function (chr: string) {
                    const canonicalName = genome.getChromosomeName(chr)
                    chrAliasTable[canonicalName] = chr
                })
            }
            this.chrAliasTable = chrAliasTable

            this.groupCache["/"] = group!
            return group!
        }
    }

    async readGroup(name: string): Promise<Record<string, string> | undefined> {

        const group = this.groupCache[name]
        if (group) {
            return group
        } else {

            await this.readHeader()
            const indexEntry = this.groupIndex![name]
            if (indexEntry === undefined) {
                return undefined
            }

            const data: ArrayBuffer = await igvxhr.loadArrayBuffer(this.path, buildOptions(this.config, {
                range: {
                    start: indexEntry.position,
                    size: indexEntry.size
                }
            }))

            if (!data) {
                return undefined
            }

            const binaryParser = new BinaryParser(new DataView(data))
            const group: Record<string, string> = {name: name}
            let nAttributes: number = binaryParser.getInt()
            while (nAttributes-- > 0) {
                const key: string = binaryParser.getString()
                const value: string = binaryParser.getString()
                group[key] = value
            }
            this.groupCache[name] = group
            return group
        }
    }

    async readTiles(tileIndeces: TileIndex[], nTracks: number): Promise<Tile[]> {

        tileIndeces.sort(function (a: TileIndex, b: TileIndex) {
            return a.position - b.position
        })

        tileIndeces = tileIndeces.filter(function (idx: TileIndex) {
            return idx.size > 0
        })

        if (tileIndeces.length === 0) {
            return []
        }

        const tiles: Tile[] = []

        for (let indexEntry of tileIndeces) {

            const data: ArrayBuffer = await igvxhr.loadArrayBuffer(this.path, buildOptions(this.config, {
                range: {
                    start: indexEntry.position,
                    size: indexEntry.size
                }
            }))

            let tileData: ArrayBuffer
            try {
                tileData = this.compressed ? BGZip.inflate(data).buffer : data
            } catch (e) {
                console.error(e)
                continue
            }

            const binaryParser = new BinaryParser(new DataView(tileData))
            const type: string = binaryParser.getString()
            let tile: Tile
            switch (type) {
                case "fixedStep":
                    tile = createFixedStep(binaryParser, nTracks)
                    break
                case "variableStep":
                    tile = createVariableStep(binaryParser, nTracks)
                    break
                case "bed":
                case "bedWithName":
                    tile = createBed(binaryParser, nTracks, type)
                    break
                default:
                    throw "Unknown tile type: " + type
            }
            tiles.push(tile)
        }
        return tiles
    }

    async readTile(indexEntry: TileIndex, nTracks: number): Promise<Tile> {

        let data: ArrayBuffer = await igvxhr.loadArrayBuffer(this.path, buildOptions(this.config, {
            range: {
                start: indexEntry.position,
                size: indexEntry.size
            }
        }))

        if (this.compressed) {
            const plain = BGZip.inflate(data)
            data = plain.buffer
        }

        const binaryParser = new BinaryParser(new DataView(data))
        const type: string = binaryParser.getString()
        switch (type) {
            case "fixedStep":
                return createFixedStep(binaryParser, nTracks)
            case "variableStep":
                return createVariableStep(binaryParser, nTracks)
            case "bed":
            case "bedWithName":
                return createBed(binaryParser, nTracks, type)
            default:
                throw "Unknown tile type: " + type
        }
    }

}

function createFixedStep(binaryParser: BinaryParser, nTracks: number): FixedStepTile {
    const nPositions: number = binaryParser.getInt()
    const start: number = binaryParser.getInt()
    const span: number = binaryParser.getFloat()

    const data: number[][] = []
    let nt: number = nTracks
    while (nt-- > 0) {
        let np: number = nPositions
        const dtrack: number[] = []
        while (np-- > 0) {
            dtrack.push(binaryParser.getFloat())
        }
        data.push(dtrack)
    }

    return {
        type: "fixedStep",
        start: start,
        span: span,
        data: data,
        nTracks: nTracks,
        nPositions: nPositions
    }
}

function createVariableStep(binaryParser: BinaryParser, nTracks: number): VariableStepTile {

    const tileStart: number = binaryParser.getInt()
    const span: number = binaryParser.getFloat()
    const nPositions: number = binaryParser.getInt()
    const start: number[] = []

    let np: number = nPositions
    while (np-- > 0) {
        start.push(binaryParser.getInt())
    }
    const nS: number = binaryParser.getInt()  // # of samples, ignored but should === nTracks

    const data: number[][] = []
    let nt: number = nTracks
    while (nt-- > 0) {
        np = nPositions
        const dtrack: number[] = []
        while (np-- > 0) {
            dtrack.push(binaryParser.getFloat())
        }
        data.push(dtrack)
    }

    return {
        type: "variableStep",
        tileStart: tileStart,
        span: span,
        start: start,
        data: data,
        nTracks: nTracks,
        nPositions: nPositions
    }
}

function createBed(binaryParser: BinaryParser, nTracks: number, type: "bed" | "bedWithName"): BedTile {

    const nPositions: number = binaryParser.getInt()

    let n: number = nPositions
    const start: number[] = []
    while (n-- > 0) {
        start.push(binaryParser.getInt())
    }

    n = nPositions
    const end: number[] = []
    while (n-- > 0) {
        end.push(binaryParser.getInt())
    }

    const nS: number = binaryParser.getInt()  // # of samples, ignored but should === nTracks
    const data: number[][] = []
    let nt: number = nTracks
    while (nt-- > 0) {
        let np: number = nPositions
        const dtrack: number[] = []
        while (np-- > 0) {
            dtrack.push(binaryParser.getFloat())
        }
        data.push(dtrack)
    }

    if (type === "bedWithName") {
        n = nPositions
        const name: string[] = []
        while (n-- > 0) {
            name.push(binaryParser.getString())
        }
    }

    return {
        type: type,
        start: start,
        end: end,
        data: data,
        nTracks: nTracks,
        nPositions: nPositions
    }
}


export default TDFReader
