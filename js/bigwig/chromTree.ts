import BPTree from "./bpTree"
import type {BPTreeLeafItemValueChrom} from "./bpTree"

interface RunningTotal {
    total: number
    count: number
}

interface Loader {
    loadArrayBuffer(path: string, options: object): Promise<ArrayBuffer>
}

export default class ChromTree {

    nameToId: Map<string, number> = new Map()
    idToName: Map<number, string> = new Map()
    path: string
    config: Record<string, unknown>
    startOffset: number
    bpTree: BPTree

    constructor(path: string, config: Record<string, unknown>, startOffset: number, loader?: Loader) {
        this.path = path
        this.config = config
        this.startOffset = startOffset

        this.bpTree = new BPTree(path, config, startOffset, 'BPChromTree', loader)
    }

    async init(): Promise<BPTree> {
        return this.bpTree.init()
    }

    getItemCount(): number {
        return this.bpTree.getItemCount()
    }

    /**
     * Return the chromosome ID for the given name. This is the internal chromosome ID for the parent BB file only.
     * @param chr - The chromosome name.
     * @returns The chromosome ID or undefined if not found.
     */
    async getIdForName(chr: string): Promise<number | undefined> {
        if (this.nameToId.has(chr)) {
            return this.nameToId.get(chr)
        } else {
            try {
                const result = await this.bpTree.search(chr)
                if (result) {
                    const id = (result as BPTreeLeafItemValueChrom).id
                    this.nameToId.set(chr, id)
                    return id
                } else {
                    return undefined
                }
            } catch (error) {
                throw new Error(String(error))
            }
        }
    }

    /**
     * Return the chromosome name for the given ID. This is a potentially expensive operation as it involves
     * walking the tree until the leaf item for the given name is found. Currently it is used in only 2
     * situations:
     * (1) decoding features from a bigbed search-by-name query
     * (2) decoding bigwig data from the whole genome view
     * @param id
     * @return The chromosome name or null if not found.
     */
    async getNameForId(id: number): Promise<string | null> {
        if (this.idToName.has(id)) {
            return this.idToName.get(id)!
        } else {
            const name = await this.searchForName(id)
            if (name !== null) {
                this.idToName.set(id, name)
                return name
            }
        }
        return null
    }

    /**
     * Perform a reverse search by traversing the tree starting at the given offset. This is potentially expensive
     * as it traverses the tree to find the name corresponding to the given ID.  It should not be used for large trees.
     *
     * @param id - The ID to search for.
     * @returns The name corresponding to the ID, or null if not found.
     */
    async searchForName(id: number): Promise<string | null> {

        const reverseSearch = async (offset: number, id: number): Promise<string | null> => {

            const node = await this.bpTree.readTreeNode(offset)

            let found: string | null = null

            if (node.type === 1) {
                // Leaf node
                for (const item of node.items) {
                    const key = item.key
                    const itemId = (item as { key: string; value: BPTreeLeafItemValueChrom }).value.id
                    if (itemId === id) {
                        found = key
                    }
                    // Cache the name and ID for future lookups
                    this.nameToId.set(key, itemId)
                    this.idToName.set(itemId, key)  // BUG FIX: was `this.idToName.set(id, itemId)` - should map itemId -> key
                }
                return found
            } else {
                // Non-leaf node
                for (const item of node.items) {
                    found = await reverseSearch((item as { key: string; offset: number }).offset, id)
                    if (found !== null) {
                        break
                    }
                }
            }
            return found
        }

        try {
            return reverseSearch(this.startOffset + 32, id)
        } catch (error) {
            throw new Error(String(error))
        }
    }

    /**
     * Return an estimated length of the genome, which might be the actual length if the number of contigs is small.
     * This is only used for calculating a default feature visibility window.
     *
     * @return Estimated genome size, or -1 on error.
     */
    async estimateGenomeSize(): Promise<number> {
        try {
            const runningTotal: RunningTotal = {total: 0, count: 0}
            await this.accumulateSize(this.startOffset + 32, runningTotal, 10000)
            const itemCount = this.getItemCount()
            return (itemCount / runningTotal.count) * runningTotal.total

        } catch (error) {
            console.error("Error estimating genome size", error)
            return -1
        }
    }

    async accumulateSize(offset: number, runningTotal: RunningTotal, maxCount: number): Promise<RunningTotal> {

        const node = await this.bpTree.readTreeNode(offset)

        if (node.type === 1) {
            // Leaf node
            for (const item of node.items) {
                const value = (item as { key: string; value: BPTreeLeafItemValueChrom }).value
                runningTotal.total += value.size
                runningTotal.count += 1
            }
        } else {
            // Non-leaf node.  Items are visited in random order to avoid biasing the estimate
            const shuffledItems = node.items.slice().sort(() => Math.random() - 0.5)
            for (const item of shuffledItems) {
                await this.accumulateSize((item as { key: string; offset: number }).offset, runningTotal, maxCount)
                if (runningTotal.count > maxCount) {
                    break
                }
            }
        }
        return runningTotal
    }

}
