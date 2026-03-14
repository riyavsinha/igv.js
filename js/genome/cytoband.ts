class Cytoband {
    start: number
    end: number
    name: string
    type: string
    stain: number

    constructor(start: number, end: number, name: string, typestain: string) {
        this.start = start
        this.end = end
        this.name = name
        this.stain = 0

        // Set the type, either p, n, or c
        if (typestain === 'acen') {
            this.type = 'c'
        } else {
            this.type = typestain.charAt(1)
            if (this.type === 'p') {
                this.stain = parseInt(typestain.substring(4))
            }
        }
    }
}

export {Cytoband}
