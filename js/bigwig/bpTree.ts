import {igvxhr} from "../../node_modules/igv-utils/src/index.js"
import {buildOptions} from "../util/igvUtils"
import BinaryParser from "../binary"

interface BPTreeHeader {
    magic: number
    blockSize: number
    keySize: number
    valSize: number
    itemCount: number
    reserved: number
    nodeOffset: number
}

export interface BPTreeLeafItemValueChrom {
    id: number
    size: number
}

interface BPTreeLeafItemValueIndex {
    offset: number
    length?: number
}

type BPTreeLeafItemValue = BPTreeLeafItemValueChrom | BPTreeLeafItemValueIndex

interface BPTreeLeafItem {
    key: string
    value: BPTreeLeafItemValue
}

interface BPTreeNonLeafItem {
    key: string
    offset: number
}

type BPTreeItem = BPTreeLeafItem | BPTreeNonLeafItem

interface BPTreeNode {
    type: number
    count: number
    items: BPTreeItem[]
}

type BPTreeType = 'BPTree' | 'BPChromTree'

interface Loader {
    loadArrayBuffer(path: string, options: object): Promise<ArrayBuffer>
}

/**
 * A UCSC BigBed B+ tree, used to support searching the "extra indexes".
 *
 * Nodes are loaded on demand during search, avoiding the need to read the entire tree into
 * memory.  Tree nodes can be scattered across the file, making loading the entire tree unfeasible in reasonable time.
 */
export default class BPTree {

    static magic: number = 2026540177
    littleEndian: boolean = true
    type: BPTreeType = 'BPTree'          // Either BPTree or BPChromTree
    nodeCache: Map<number, BPTreeNode> = new Map()
    path: string
    config: object
    startOffset: number
    loader: Loader
    header!: BPTreeHeader

    static async loadBpTree(path: string, config: object, startOffset: number, type: BPTreeType | undefined, loader?: Loader): Promise<BPTree> {
        const bpTree = new BPTree(path, config, startOffset, type, loader)
        return bpTree.init()
    }

    constructor(path: string, config: object, startOffset: number, type?: BPTreeType, loader?: Loader) {
        this.path = path
        this.config = config
        this.startOffset = startOffset
        if(type) {
            this.type = type
        }
        this.loader = loader || igvxhr
    }

    async init(): Promise<BPTree> {
        const binaryParser = await this.#getParserFor(this.startOffset, 32)
        let magic = binaryParser.getInt()
        if(magic !== BPTree.magic) {
            binaryParser.setPosition(0)
            this.littleEndian = !this.littleEndian
            binaryParser.littleEndian = this.littleEndian
            magic = binaryParser.getInt()
            if(magic !== BPTree.magic) {
                throw Error(`Bad magic number ${magic}`)
            }
        }

        const blockSize = binaryParser.getInt()
        const keySize = binaryParser.getInt()
        const valSize = binaryParser.getInt()
        const itemCount = binaryParser.getLong()
        const reserved = binaryParser.getLong()
        const nodeOffset = this.startOffset + 32
        this.header = {magic, blockSize, keySize, valSize, itemCount, reserved, nodeOffset}
        return this
    }

    getItemCount(): number {
        if(!this.header) {
            throw Error("Header not initialized")
        }
        return this.header.itemCount
    }

    async search(term: string): Promise<BPTreeLeafItemValue | undefined> {

        if(!this.header) {
            await this.init();
        }

        const walkTreeNode = async (offset: number): Promise<BPTreeLeafItemValue | undefined> => {

            const node = await this.readTreeNode(offset)

            if (node.type === 1) {
                // Leaf node
                for (let item of node.items) {
                    if (term === item.key) {
                        return (item as BPTreeLeafItem).value
                    }
                }
            } else {
                // Non leaf node

                // Read and discard the first key.
                let childOffset = (node.items[0] as BPTreeNonLeafItem).offset

                for (let i = 1; i < node.items.length; i++) {
                    const key = node.items[i].key
                    if (term.localeCompare(key) < 0) {
                        break
                    }
                    childOffset = (node.items[i] as BPTreeNonLeafItem).offset
                }

                return walkTreeNode(childOffset)
            }
        }

        // Kick things off
        return walkTreeNode(this.header.nodeOffset)
    }

    async readTreeNode(offset: number): Promise<BPTreeNode> {

        if (this.nodeCache.has(offset)) {
            return this.nodeCache.get(offset)!
        } else {
            let binaryParser = await this.#getParserFor(offset, 4)
            const type = binaryParser.getByte()
            const reserved = binaryParser.getByte()
            const count = binaryParser.getUShort()
            const items: BPTreeItem[] = []

            const {keySize, valSize} = this.header

            if (type === 1) {
                // Leaf node
                const size = count * (keySize + valSize)
                binaryParser = await this.#getParserFor(offset + 4, size)
                for (let i = 0; i < count; i++) {
                    const key = binaryParser.getFixedLengthString(keySize)
                    let value: BPTreeLeafItemValue
                    if(this.type === 'BPChromTree') {
                        const id = binaryParser.getInt()
                        const size = binaryParser.getInt()
                        value = {id, size}
                    } else {
                        const offset = binaryParser.getLong()
                        if (valSize === 16) {
                            const length = binaryParser.getLong()
                            value = {offset, length}
                        } else {
                            value = {offset}
                        }
                    }
                    items.push({key, value})
                }
            } else {
                // Non leaf node
                const size = count * (keySize + 8)
                binaryParser = await this.#getParserFor(offset + 4, size)

                for (let i = 0; i < count; i++) {
                    const key = binaryParser.getFixedLengthString(keySize)
                    const offset = binaryParser.getLong()
                    items.push({key, offset})
                }
            }

            const node: BPTreeNode = {type, count, items}
            this.nodeCache.set(offset, node)
            return node
        }
    }

    async #getParserFor(start: number, size: number): Promise<BinaryParser> {
        const data = await this.loader.loadArrayBuffer(this.path, buildOptions(this.config, {range: {start, size}}))
        return new BinaryParser(new DataView(data), this.littleEndian)
    }

}
