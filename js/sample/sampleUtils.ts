import IGVGraphics from "../igv-canvas.js"

const NULL_GROUP: string = 'None'
const GROUP_MARGIN_HEIGHT: number = 16

function doSortByAttributes(sampleInfo: any, sampleKeys: string[]): boolean {


        const attributeNameSet: Set<string> = new Set(sampleInfo.attributeNames)
        const anySampleKey: string = sampleKeys[0]
        const dictionary: Record<string, any> | undefined = sampleInfo.getAttributes(anySampleKey)

        if (undefined === dictionary) {
            return false
        } else {
            const sampleAttributeNames: string[] = Object.keys(sampleInfo.getAttributes(anySampleKey))
            for (const name of sampleAttributeNames) {
                if (false === attributeNameSet.has(name)) {
                    return false
                }
            }
        }

    return true
}

function drawGroupDividers(context: CanvasRenderingContext2D, pixelTop: number, pixelWidth: number, pixelHeight: number, offset: number, sampleHeight: number, groups: Map<string, any>): void {

    if (!groups || groups.size === 0) return

    const pixelBottom: number = pixelTop + pixelHeight
    context.save()
    context.fillStyle = 'black'
    let y: number = offset + GROUP_MARGIN_HEIGHT / 2
    if (y > pixelTop) {
        IGVGraphics.dashedLine(context, 0, y, pixelWidth, y)
    }
    for (const group of groups.values()) {
        y += group.count * sampleHeight + GROUP_MARGIN_HEIGHT
        if (y > pixelBottom) {
            break
        }
        if (y > pixelTop) {
            IGVGraphics.dashedLine(context, 0, y, pixelWidth, y)
        }
    }
    context.restore()
}

export { doSortByAttributes, drawGroupDividers, NULL_GROUP, GROUP_MARGIN_HEIGHT }
