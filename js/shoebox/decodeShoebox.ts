import DecodeError from "../feature/decode/decodeError"

export default function decodeShoebox(tokens: string[], header: any, maxColumnCount: number = Number.MAX_SAFE_INTEGER): any {

    if (tokens.length < 4) return undefined

    const chr = tokens[0]
    const start = parseInt(tokens[1])
    const end = parseInt(tokens[2])
    if (isNaN(start) || isNaN(end)) {
        return new DecodeError(`Unparsable bed record.`)
    }
    const feature: { chr: string, start: number, end: number, values?: number[] } = {chr, start, end}

    const values: number[] = []
    for(let i = 3; i< tokens.length; i++) {
        values.push(Number.parseFloat(tokens[i]))
    }
    feature.values = values;


    return feature
}
