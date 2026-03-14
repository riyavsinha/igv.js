/**
 * Fast deep copy function, copied from https://github.com/davidmarkclements/rfdc
 * Function is copied rather than imported because project does not support es6 import, only 'require'
 */
import {FileUtils} from "../../node_modules/igv-utils/src/index.js"


function cloneArray(a: unknown[], fn: (o: unknown) => unknown): unknown[] {
    const a2 = new Array(a.length)
    for (let i = 0; i < a.length; i++) {
        const cur = a[i]
        if (typeof cur !== 'object' || cur === null) {
            a2[i] = cur
        } else if (cur instanceof Date) {
            a2[i] = new Date(cur)
        } else {
            a2[i] = fn(cur)
        }
    }
    return a2
}

function deepCopy(o: unknown): unknown {
    if (FileUtils.isFile(o)) return o
    if (typeof o !== 'object' || o === null) return o
    if (o instanceof Date) return new Date(o)
    if (Array.isArray(o)) return cloneArray(o, deepCopy)
    if (typeof (o as Record<string, unknown>).then === "function") return o
    const o2 = {}
    for (let k in o) {
        if (Object.hasOwnProperty.call(o, k) === false) continue
        const cur = o[k]
        if (typeof cur !== 'object' || cur === null) {
            o2[k] = cur
        } else if (cur instanceof Date) {
            o2[k] = new Date(cur)
        } else {
            o2[k] = deepCopy(cur)
        }
    }
    return o2
}


export default deepCopy