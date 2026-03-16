const pairs =
    [
        ['A', 'T'],
        ['G', 'C'],
        ['Y', 'R'],
        ['W', 'S'],
        ['K', 'M'],
        ['D', 'H'],
        ['B', 'V']
    ]

const complements: Map<string, string> = new Map()
for (let p of pairs) {
    const p1: string = p[0]
    const p2: string = p[1]
    complements.set(p1, p2)
    complements.set(p2, p1)
    complements.set(p1.toLowerCase(), p2.toLowerCase())
    complements.set(p2.toLowerCase(), p1.toLowerCase())
}

function complementBase(base: string): string {
    return complements.has(base) ? complements.get(base)! : base
}

function complementSequence(sequence: string): string {
    let comp = ''
    for (let base of sequence) {
        comp += complements.has(base) ? complements.get(base) : base
    }
    return comp
}

function reverseComplementSequence(sequence: string): string {

    let comp = ''
    let idx = sequence.length
    while (idx-- > 0) {
        const base = sequence[idx]
        comp += complements.has(base) ? complements.get(base) : base
    }
    return comp
}

export {complementBase, complementSequence, reverseComplementSequence}

