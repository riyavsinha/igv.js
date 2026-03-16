interface CustomFormat {
    fields: string[]
    coords?: number
    chr: number
    start: number
    end?: number
}

interface CustomHeader {
    customFormat: CustomFormat
}

/**
 * Decode a custom columnar format.  Required columns are 'chr' and 'start'
 *
 * @param tokens
 * @param header
 * @returns decoded feature, or undefined if this is not a valid record
 */
function decodeCustom(tokens: string[], header: CustomHeader): Record<string, unknown> | undefined {

    const format = header.customFormat

    if (tokens.length < format.fields.length) return undefined

    const coords = format.coords || 0

    const chr = tokens[format.chr]
    const start = parseInt(tokens[format.start]) - coords
    const end = format.end !== undefined ? parseInt(tokens[format.end]) : start + 1

    const feature: Record<string, unknown> = {chr: chr, start: start, end: end}

    if (format.fields) {
        format.fields.forEach(function (field: string, index: number) {

            if (index !== format.chr &&
                index !== format.start &&
                index !== format.end) {

                feature[field] = tokens[index]
            }
        })
    }

    return feature

}


// function expandFormat(format) {
//     const fields = format.fields;
//     const keys = ['chr', 'start', 'end'];
//     for (let i = 0; i < fields.length; i++) {
//         for (let key of keys) {
//             if (key === fields[i]) {
//                 format[key] = i;
//             }
//         }
//     }
//     return format;
// }

export {decodeCustom}
