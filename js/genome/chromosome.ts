/**
 * Object for chromosome meta-data
 */


class Chromosome {
    name: string
    order: number
    bpLength: number
    altNames: Map<string, string> | undefined

    constructor(name: string, order: number, bpLength: number, altNames?: Map<string, string>) {
        this.name = name
        this.order = order
        this.bpLength = bpLength
        this.altNames = altNames
    }

    getAltName(key: string): string {
        return this.altNames && this.altNames.has(key) ? this.altNames.get(key)! : this.name
    }
}

export default Chromosome