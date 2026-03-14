import {FileUtils, StringUtils} from "../../node_modules/igv-utils/src/index.js"
import * as DOMUtils from "../ui/utils/dom-utils.js"

const extend = function (parent: any, child: any): any {

    child.prototype = Object.create(parent.prototype)
    child.prototype.constructor = child
    child.prototype._super = Object.getPrototypeOf(child.prototype)
    return child
}

/**
 * Test if the given value is a string or number.  Not using typeof as it fails on boxed primitives.
 */
function isSimpleType(value: unknown): boolean {
    const simpleTypes = new Set(["boolean", "number", "string", "symbol"])
    const valueType = typeof value
    return (value !== undefined && (simpleTypes.has(valueType) || (value as any).substring || (value as any).toFixed))
}

function buildOptions(config: Record<string, any>, options?: Record<string, any>): Record<string, any> {

    var defaultOptions: Record<string, any> = {
        oauthToken: config.oauthToken,
        headers: config.headers,
        withCredentials: config.withCredentials,
        filename: config.filename
    }

    return Object.assign(defaultOptions, options)
}

const doAutoscale = function (features: any[]): {min: number, max: number} {
    var min: number, max: number

    if (features && features.length > 0) {
        min = Number.MAX_VALUE
        max = -Number.MAX_VALUE

        for (let f of features) {
            if (!Number.isNaN(f.value)) {
                min = Math.min(min, f.value)
                max = Math.max(max, f.value)
            }
        }

        // Insure we have a zero baseline
        if (max > 0) min = Math.min(0, min)
        if (max < 0) max = 0
    } else {
        // No features -- default
        min = 0
        max = 100
    }

    return {min: min, max: max}
}

const validateGenomicExtent = function (chromosomeLengthBP: number, genomicExtent: {start: number, end?: number}, minimumBP: number): void {

    let ss = genomicExtent.start
    let ee = genomicExtent.end

    if (undefined === ee) {

        ss -= minimumBP / 2
        ee = ss + minimumBP

        if (ee > chromosomeLengthBP) {
            ee = chromosomeLengthBP
            ss = ee - minimumBP
        } else if (ss < 0) {
            ss = 0
            ee = minimumBP
        }

    } else if (ee - ss < minimumBP) {

        const center = (ee + ss) / 2

        if (center - minimumBP / 2 < 0) {
            ss = 0
            ee = ss + minimumBP
        } else if (center + minimumBP / 2 > chromosomeLengthBP) {
            ee = chromosomeLengthBP
            ss = ee - minimumBP
        } else {
            ss = center - minimumBP / 2
            ee = ss + minimumBP
        }
    }

    genomicExtent.start = Math.ceil(ss)
    genomicExtent.end = Math.floor(ee)
}

const isNumber = function (num: unknown): boolean {
    if (typeof num === 'number') {
        return num - num === 0
    }
    if (typeof num === 'string' && num.trim() !== '') {
        return Number.isFinite(+num)
    }
    return false
}

function isInteger(str: string): boolean {
    return Number.isSafeInteger(Number.parseInt(str))
}

async function getFilename(url: string): Promise<string> {
    return FileUtils.getFilename(url)
}

function prettyBasePairNumber(raw: number): string {

    var denom: number,
        units: string,
        value: number,
        floored: number

    if (raw > 1e7) {
        denom = 1e6
        units = " mb"
    } else if (raw > 1e4) {

        denom = 1e3
        units = " kb"

        value = raw / denom
        floored = Math.floor(value)
        return StringUtils.numberFormatter(floored) + units
    } else {
        return StringUtils.numberFormatter(raw) + " bp"
    }

    value = raw / denom
    floored = Math.floor(value)

    return floored.toString() + units
}


function isDataURL(obj: unknown): boolean {
    return (StringUtils.isString(obj) && (obj as string).startsWith("data:"))
}

function createColumn(columnContainer: HTMLElement, className: string): HTMLElement {
    const column = DOMUtils.div({class: className})
    columnContainer.appendChild(column)
    return column
}


function insertElementBefore(element: HTMLElement, referenceNode: HTMLElement): void {
    referenceNode.parentNode!.insertBefore(element, referenceNode)
}

function insertElementAfter(element: HTMLElement, referenceNode: HTMLElement): void {
    referenceNode.parentNode!.insertBefore(element, referenceNode.nextSibling)
}

/**
 * Test to see if page is loaded in a secure context, that is by https or is localhost.
 */
function isSecureContext(): boolean {
    return window.location.protocol === "https:" || window.location.hostname === "localhost"
}

/**
 * Expand the region represented by (start,end) to span the extent.
 */
function expandRegion(start: number, end: number, extent: number): {start: number, end: number} {
    if (extent > (end - start)) {
        const center = (end + start) / 2
        const ss = Math.floor(center - extent / 2)
        const ee = Math.ceil(center + extent / 2)
        return {start: ss, end: ee}
    } else {
        return {start, end}
    }
}

function getElementVerticalDimension(element: HTMLElement): {top: number, bottom: number, height: number} {

    const style = window.getComputedStyle(element)

    const marginTop = parseInt(style.marginTop)
    const marginBottom = parseInt(style.marginBottom)

    const {top, bottom, height} = element.getBoundingClientRect()
    return {
        top: Math.floor(top) - marginTop,
        bottom: Math.floor(bottom) + marginBottom,
        height: Math.floor(height) + marginTop + marginBottom
    }
}

export {
    createColumn,
    extend,
    isSimpleType,
    buildOptions,
    validateGenomicExtent,
    doAutoscale,
    isNumber,
    prettyBasePairNumber,
    isDataURL,
    insertElementBefore,
    insertElementAfter,
    isSecureContext,
    expandRegion,
    isInteger,
    getElementVerticalDimension
}
