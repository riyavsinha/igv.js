import {igvxhr} from "../../node_modules/igv-utils/src/index.js"
import BinaryParser from "../binary"
import {buildOptions} from "../util/igvUtils"

const RPTREE_HEADER_SIZE: number = 48
const RPTREE_NODE_LEAF_ITEM_SIZE: number = 32   // leaf item size
const RPTREE_NODE_CHILD_ITEM_SIZE: number = 24  // child item size

interface RPTreeHeader {
    magic: number
    blockSize: number
    itemCount: number
    startChromIx: number
    startBase: number
    endChromIx: number
    endBase: number
    endFileOffset: number
    itemsPerSlot: number
    reserved: number
    rootNodeOffset: number
}

export interface RPTreeItem {
    isLeaf: boolean
    startChrom: number
    startBase: number
    endChrom: number
    endBase: number
    childOffset: number
    dataSize?: number
    dataOffset?: number
}

interface RPTreeNode {
    type: number
    items: RPTreeItem[]
}

interface Loader {
    loadArrayBuffer(path: string, options?: Record<string, unknown>): Promise<ArrayBuffer>
}

export default class RPTree {

    static magic: number = 610839776
    littleEndian: boolean = true
    nodeCache: Map<number, RPTreeNode> = new Map()
    path: string
    config: Record<string, unknown>
    startOffset: number
    loader: Loader
    header!: RPTreeHeader

    constructor(path: string, config: Record<string, unknown>, startOffset: number, loader?: Loader) {

        this.path = path
        this.config = config
        this.startOffset = startOffset
        this.loader = loader || igvxhr
    }


    async init(): Promise<RPTree> {
        const binaryParser = await this.#getParserFor(this.startOffset, RPTREE_HEADER_SIZE)
        let magic = binaryParser.getInt()
        if (magic !== RPTree.magic) {
            binaryParser.setPosition(0)
            this.littleEndian = !this.littleEndian
            binaryParser.littleEndian = this.littleEndian
            magic = binaryParser.getInt()
            if (magic !== RPTree.magic) {
                throw Error(`Bad magic number ${magic}`)
            }
        }

        const blockSize = binaryParser.getUInt()
        const itemCount = binaryParser.getLong()
        const startChromIx = binaryParser.getUInt()
        const startBase = binaryParser.getUInt()
        const endChromIx = binaryParser.getUInt()
        const endBase = binaryParser.getUInt()
        const endFileOffset = binaryParser.getLong()
        const itemsPerSlot = binaryParser.getUInt()
        const reserved = binaryParser.getUInt()
        const rootNodeOffset = this.startOffset + RPTREE_HEADER_SIZE
        this.header = {
            magic,
            blockSize,
            itemCount,
            startChromIx,
            startBase,
            endChromIx,
            endBase,
            endFileOffset,
            itemsPerSlot,
            reserved,
            rootNodeOffset
        }
        return this
    }

    async #getParserFor(start: number, size: number): Promise<BinaryParser> {
        const data = await this.loader.loadArrayBuffer(this.path, buildOptions(this.config, {range: {start, size}}))
        return new BinaryParser(new DataView(data), this.littleEndian)
    }


    async findLeafItemsOverlapping(chrIdx1: number, startBase: number, chrIdx2: number, endBase: number): Promise<RPTreeItem[]> {

        const leafItems: RPTreeItem[] = []
        const walkTreeNode = async (offset: number): Promise<void> => {
            const node = await this.readNode(offset)
            for (let item of node.items) {
                if (overlaps(item, chrIdx1, startBase, chrIdx2, endBase)) {
                    if (node.type === 1) {   // Leaf node
                        leafItems.push(item)
                    } else { // Non leaf node
                        await walkTreeNode(item.childOffset)
                    }
                }
            }
        }

        await walkTreeNode(this.header.rootNodeOffset)
        return leafItems
    }


    async readNode(offset: number): Promise<RPTreeNode> {

        const nodeKey = offset
        if (this.nodeCache.has(nodeKey)) {
            return this.nodeCache.get(nodeKey)!
        }

        let binaryParser = await this.#getParserFor(offset, 4)
        const type = binaryParser.getByte()
        const isLeaf = (type === 1)
        const reserved = binaryParser.getByte()
        const count = binaryParser.getUShort()
        let bytesRequired = count * (isLeaf ? RPTREE_NODE_LEAF_ITEM_SIZE : RPTREE_NODE_CHILD_ITEM_SIZE)
        binaryParser = await this.#getParserFor(offset + 4, bytesRequired)

        const items: RPTreeItem[] = []
        for (let i = 0; i < count; i++) {
            let item: RPTreeItem = {
                isLeaf: isLeaf,
                startChrom: binaryParser.getInt(),
                startBase: binaryParser.getInt(),
                endChrom: binaryParser.getInt(),
                endBase: binaryParser.getInt(),
                childOffset: binaryParser.getLong()
            }
            if (isLeaf) {
                item.dataSize =  binaryParser.getLong()
                item.dataOffset = item.childOffset
            }
            items.push(item)
        }

        const node: RPTreeNode = {type, items}
        this.nodeCache.set(nodeKey, node)
        return node
    }

}

/**
 * Return true if {chrIdx1:startBase-chrIdx2:endBase} overlaps item's interval
 * @returns {boolean}
 */
function overlaps(item: RPTreeItem, chrIdx1: number, startBase: number, chrIdx2: number, endBase: number): boolean {

    if (!item) {
        console.log("null item for " + chrIdx1 + " " + startBase + " " + endBase)
        return false
    }

    return ((chrIdx2 > item.startChrom) || (chrIdx2 === item.startChrom && endBase >= item.startBase)) &&
        ((chrIdx1 < item.endChrom) || (chrIdx1 === item.endChrom && startBase <= item.endBase))


}
