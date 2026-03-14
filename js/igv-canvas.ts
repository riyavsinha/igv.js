// Collection of helper functions for canvas rendering.  The "ctx" paramter in these functions is a canvas 2d context.
//
// Example usage
//
//    IGVGraphics.strokeLine(context, 0, 0, 10, 10);
//

import {randomRGB} from "./util/colorPalletes.js";

var debug = false

var log = function (msg: string): void {
    if (debug) {
        var d = new Date()
        var time = d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds()
        if (typeof console != "undefined") {
            console.log("igv-canvas: " + time + " " + msg)
        }
    }
}


const IGVGraphics = {

    configureHighDPICanvas: function (ctx: CanvasRenderingContext2D, w: number, h: number): void {

        const scaleFactor = window.devicePixelRatio

        ctx.canvas.style.width = (`${w}px`)
        ctx.canvas.width = Math.floor(scaleFactor * w)

        ctx.canvas.style.height = (`${h}px`)
        ctx.canvas.height = Math.floor(scaleFactor * h)

        ctx.scale(scaleFactor, scaleFactor)

    },

    setProperties: function (ctx: CanvasRenderingContext2D, properties: Record<string, any>): void {

        for (var key in properties) {
            if (properties.hasOwnProperty(key)) {
                var value = properties[key]
                ;(ctx as any)[key] = value
            }
        }
    },

    strokeLine: function (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, properties?: Record<string, any>): void {

        x1 = Math.floor(x1) + 0.5
        y1 = Math.floor(y1) + 0.5
        x2 = Math.floor(x2) + 0.5
        y2 = Math.floor(y2) + 0.5

        log("stroke line, prop: " + properties)

        if (properties) {
            ctx.save()
            IGVGraphics.setProperties(ctx, properties)
        }

        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()

        if (properties) ctx.restore()
    },

    fillRect: function (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, properties?: Record<string, any>): void {

        if (properties) {
            ctx.save()
            IGVGraphics.setProperties(ctx, properties)
        }

        ctx.fillRect(x, y, w, h)

        if (properties) ctx.restore()
    },

    fillPolygon: function (ctx: CanvasRenderingContext2D, x: number[], y: number[], properties?: Record<string, any>): void {
        if (properties) {
            ctx.save()
            IGVGraphics.setProperties(ctx, properties)
        }
        doPath(ctx, x, y)
        ctx.fill()
        if (properties) ctx.restore()
    },

    strokePolygon: function (ctx: CanvasRenderingContext2D, x: number[], y: number[], properties?: Record<string, any>): void {
        if (properties) {
            ctx.save()
            IGVGraphics.setProperties(ctx, properties)
        }
        doPath(ctx, x, y)
        ctx.stroke()
        if (properties) ctx.restore()
    },

    fillText: function (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, properties?: Record<string, any>, transforms?: Record<string, any>): void {

        if (properties || transforms) {
            ctx.save()
        }

        if (properties) {
            IGVGraphics.setProperties(ctx, properties)
        }

        if (transforms) {
            // Slow path with context saving and extra translate
            ctx.translate(x, y)

            for (var transform in transforms) {
                var value = transforms[transform]

                // TODO: Add error checking for robustness
                if (transform === 'translate') {
                    ctx.translate(value['x'], value['y'])
                }
                if (transform === 'rotate') {
                    ctx.rotate(value['angle'] * Math.PI / 180)
                }
            }

            ctx.fillText(text, 0, 0)
        } else {
            ctx.fillText(text, x, y)
        }

        if (properties || transforms) ctx.restore()
    },

    strokeText: function (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, properties?: Record<string, any>, transforms?: Record<string, any>): void {


        if (properties || transforms) {
            ctx.save()
        }

        if (properties) {
            IGVGraphics.setProperties(ctx, properties)
        }

        if (transforms) {
            ctx.translate(x, y)

            for (var transform in transforms) {
                var value = transforms[transform]

                // TODO: Add error checking for robustness
                if (transform === 'translate') {
                    ctx.translate(value['x'], value['y'])
                }
                if (transform === 'rotate') {
                    ctx.rotate(value['angle'] * Math.PI / 180)
                }
            }

            ctx.strokeText(text, 0, 0)
        } else {
            ctx.strokeText(text, x, y)
        }

        if (properties || transforms) ctx.restore()
    },

    strokeCircle: function (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, properties?: Record<string, any>): void {
        if (properties) {
            ctx.save()
            IGVGraphics.setProperties(ctx, properties)
        }
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, 2 * Math.PI)
        ctx.stroke()
        if (properties) ctx.restore()
    },

    fillCircle: function (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, properties?: Record<string, any>): void {
        if (properties) {
            ctx.save()
            IGVGraphics.setProperties(ctx, properties)
        }
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, 2 * Math.PI)
        ctx.fill()
        if (properties) ctx.restore()
    },

    drawArrowhead: function (ctx: CanvasRenderingContext2D, x: number, y: number, size?: number, lineWidth?: number): void {

        ctx.save()
        if (!size) {
            size = 5
        }
        if (lineWidth) {
            ctx.lineWidth = lineWidth
        }
        ctx.beginPath()
        ctx.moveTo(x, y - size / 2)
        ctx.lineTo(x, y + size / 2)
        ctx.lineTo(x + size, y)
        ctx.lineTo(x, y - size / 2)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
    },

    dashedLine: function (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, dashLen?: number, properties: Record<string, any> = {}): void {
        if (dashLen === undefined) dashLen = 2
        ctx.setLineDash([dashLen, dashLen])
        IGVGraphics.strokeLine(ctx, x1, y1, x2, y2, properties)
        ctx.setLineDash([])
    },

    roundRect: function (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius?: number, fill?: boolean, stroke?: boolean): void {

        if (typeof stroke == "undefined") {
            stroke = true
        }
        if (typeof radius === "undefined") {
            radius = 5
        }
        ctx.beginPath()
        ctx.moveTo(x + radius, y)
        ctx.lineTo(x + width - radius, y)
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
        ctx.lineTo(x + width, y + height - radius)
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
        ctx.lineTo(x + radius, y + height)
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
        ctx.lineTo(x, y + radius)
        ctx.quadraticCurveTo(x, y, x + radius, y)
        ctx.closePath()
        if (stroke) {
            ctx.stroke()
        }
        if (fill) {
            ctx.fill()
        }
    },
    polygon: function (ctx: CanvasRenderingContext2D, x: number[], y: number[], fill?: boolean, stroke?: boolean): void {

        if (typeof stroke == "undefined") {
            stroke = true
        }

        ctx.beginPath()
        var len = x.length
        ctx.moveTo(x[0], y[0])
        for (var i = 1; i < len; i++) {
            ctx.lineTo(x[i], y[i])
        }

        ctx.closePath()
        if (stroke) {
            ctx.stroke()
        }
        if (fill) {
            ctx.fill()
        }
    },

    drawRandomColorVerticalLines: (ctx: CanvasRenderingContext2D): void => {
        for (let x = 0; x < ctx.canvas.width; x++) {
            IGVGraphics.fillRect(ctx, x, 0, 1, ctx.canvas.height, { fillStyle: randomRGB(100, 250) })
        }
    },

    labelTransformWithContext: (ctx: CanvasRenderingContext2D, exe: number): void => {
        ctx.translate(exe, 0);
        ctx.scale(-1, 1);
        ctx.translate(-exe, 0);
    }

}

function doPath(ctx: CanvasRenderingContext2D, x: number[], y: number[]): void {
    var i, len = x.length
    ctx.beginPath()
    ctx.moveTo(x[0], y[0])
    for (i = 1; i < len; i++) {
        ctx.lineTo(x[i], y[i])
    }
    ctx.closePath()
}

export default IGVGraphics
