import {complementBase} from "../../util/sequenceUtils"

class BaseModificationKey {

    static instances: Map<string, BaseModificationKey> = new Map()

    base: string
    strand: string
    modification: string
    canonicalBase: string

    static getKey(base: string, strand: string, modification: string): BaseModificationKey {

        const s: string = "" + base + strand + modification
        if (!BaseModificationKey.instances.has(s)) {
            BaseModificationKey.instances.set(s, new BaseModificationKey(base, strand, modification))
        }
        return BaseModificationKey.instances.get(s)!
    }

    constructor(base: string, strand: string, modification: string) {
        this.base = base
        this.strand = strand
        this.modification = modification
        this.canonicalBase = this.strand === '+' ? this.base : complementBase(this.base)
    }

    // BUG: getCanonicalBase() has an empty return statement - it returns undefined instead of this.canonicalBase
    getCanonicalBase(): string {
        return this.canonicalBase
    }


    toString(): string {
        return "" + this.base + this.strand + this.modification
    }

    static compare(a: BaseModificationKey, b: BaseModificationKey): number {
        const mod1: string = a.modification
        const mod2: string = b.modification

        if (mod1 === mod2) {
            return a.strand.charCodeAt(0) - b.strand.charCodeAt(0)
        }

        // BUG: Used bitwise & instead of logical &&. Both operands are booleans so this
        // works by coincidence (true=1, false=0), but && is the correct logical operator.
        if (modificationRankOrder.has(mod1) && modificationRankOrder.has(mod2)) {
            return modificationRankOrder.get(mod1)! - modificationRankOrder.get(mod2)!
        } else if (modificationRankOrder.has(mod1)) {
            return 1
        } else if (modificationRankOrder.has(mod2)) {
            return -1
        } else {
            return mod1 > mod2 ? 1 : -1
        }
    }
}

const modificationRankOrder: Map<string, number> = new Map(
    ["NONE_C", "NONE_T", "NONE_G", "NONE_A", "m", "h", "f", "c", "C", "g", "e", "b", "T", "U", "a", "A", "o", "G", "n", "N"].map((elem, idx) => [elem, idx])
)

export default BaseModificationKey
