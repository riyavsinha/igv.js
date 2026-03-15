import {IGVColor} from "../../node_modules/igv-utils/src/index.js"

interface GradientColorScaleConfig {
    type?: string
    min?: number
    max?: number
    low?: number
    high?: number
    minColor?: string
    maxColor?: string
    lowColor?: string
    highColor?: string
    midColor?: string
    mid?: number
}

const ColorScaleFactory = {

    fromJson: (obj: GradientColorScaleConfig): GradientColorScale | DivergingGradientScale => {
        switch (obj.type) {
            case 'gradient':
                return new GradientColorScale(obj)
            case 'doubleGradient':
            case 'diverging':
                return new DivergingGradientScale(obj)
            default:
                throw Error("Unknown color scale type: " + obj)
        }
    },

    defaultGradientScale: function (min: number, max: number): GradientColorScale {

        return new GradientColorScale({
            "type": "doubleGradient",
            "min": min,
            "max": max,
            "minColor": "rgb(46,56,183)",
            "maxColor": "rgb(164,0,30)"
        })
    },

    defaultDivergingScale: function (min: number, mid: number, max: number): DivergingGradientScale {
        return new DivergingGradientScale({
            "type": "doubleGradient",
            "min": 0,
            "mid": 0.25,
            "max": 0.5,
            "minColor": "rgb(46,56,183)",
            "midColor": "white",
            "maxColor": "rgb(164,0,30)"
        })
    }
}

interface BinnedColorScaleConfig {
    thresholds: number[]
    colors: string[]
}

class BinnedColorScale {
    thresholds: number[]
    colors: string[]

    constructor(cs: BinnedColorScaleConfig) {
        this.thresholds = cs.thresholds
        this.colors = cs.colors
    }

    getColor(value: number): string {

        for (let i = 0; i < this.thresholds.length; i++) {
            if (value < this.thresholds[i]) {
                return this.colors[i]
            }
        }

        return this.colors[this.colors.length - 1]
    }
}


class GradientColorScale {
    type: string
    min!: number
    max!: number
    _lowColor!: string
    _highColor!: string
    lowComponents!: number[]
    highComponents!: number[]

    constructor(config: GradientColorScaleConfig) {
        this.type = 'gradient'
        this.setProperties({
            min: (config.min !== undefined ? config.min : config.low) ?? 0,
            max: (config.max !== undefined ? config.max : config.high) ?? 0,
            minColor: config.minColor || config.lowColor || 'rgb(0,0,255)',
            maxColor: config.maxColor || config.highColor || 'rgb(255,0,0)'
        })
    }

    setProperties({min, max, minColor, maxColor}: {min: number, max: number, minColor: string, maxColor: string}): void {
        this.type = 'gradient'
        this.min = min
        this.max = max
        this._lowColor = minColor
        this._highColor = maxColor
        this.lowComponents = IGVColor.rgbComponents(minColor)
        this.highComponents = IGVColor.rgbComponents(maxColor)
    }

    get minColor(): string {
        return this._lowColor
    }

    set minColor(c: string) {
        this._lowColor = c
        this.lowComponents = IGVColor.rgbComponents(c)
    }

    get maxColor(): string {
        return this._highColor
    }

    set maxColor(c: string) {
        this._highColor = c
        this.highComponents = IGVColor.rgbComponents(c)
    }

    getColor(value: number): string {

        if (value <= this.min) return this.minColor
        else if (value >= this.max) return this.maxColor

        const frac = (value - this.min) / (this.max - this.min)
        const r = Math.floor(this.lowComponents[0] + frac * (this.highComponents[0] - this.lowComponents[0]))
        const g = Math.floor(this.lowComponents[1] + frac * (this.highComponents[1] - this.lowComponents[1]))
        const b = Math.floor(this.lowComponents[2] + frac * (this.highComponents[2] - this.lowComponents[2]))

        return "rgb(" + r + "," + g + "," + b + ")"
    }

    toJson(): GradientColorScaleConfig {
        return {
            type: this.type,
            min: this.min,
            max: this.max,
            minColor: this.minColor,
            maxColor: this.maxColor
        }
    }

    clone(): GradientColorScale {
        return new GradientColorScale(this.toJson())
    }

}

class DivergingGradientScale {
    type: string
    lowGradientScale: GradientColorScale
    highGradientScale: GradientColorScale

    constructor(json: GradientColorScaleConfig) {
        this.type = 'diverging'
        this.lowGradientScale = new GradientColorScale({
            minColor: json.minColor || json.lowColor,
            maxColor: json.midColor,
            min: json.min !== undefined ? json.min : json.low,
            max: json.mid
        })
        this.highGradientScale = new GradientColorScale({
            minColor: json.midColor,
            maxColor: json.maxColor || json.highColor,
            min: json.mid,
            max: json.max !== undefined ? json.max : json.high
        })
    }

    getColor(value: number): string {
        if (value < this.mid) {
            return this.lowGradientScale.getColor(value)
        } else {
            return this.highGradientScale.getColor(value)
        }
    }

    get min(): number {
        return this.lowGradientScale.min
    }

    set min(v: number) {
        this.lowGradientScale.min = v
    }

    get max(): number {
        return this.highGradientScale.max
    }

    set max(v: number) {
        this.highGradientScale.max = v
    }

    get mid(): number {
        return this.lowGradientScale.max
    }

    set mid(v: number) {
        this.lowGradientScale.max = v
        this.highGradientScale.min = v
    }

    get minColor(): string {
        return this.lowGradientScale.minColor
    }

    set minColor(c: string) {
        this.lowGradientScale.minColor = c
    }

    get maxColor(): string {
        return this.highGradientScale.maxColor
    }

    set maxColor(c: string) {
        this.highGradientScale.maxColor = c
    }

    get midColor(): string {
        return this.lowGradientScale.maxColor
    }

    set midColor(c: string) {
        this.lowGradientScale.maxColor = c
        this.highGradientScale.minColor = c
    }


    toJson(): GradientColorScaleConfig {
        return {
            type: this.type,
            min: this.min,
            mid: this.mid,
            max: this.max,
            minColor: this.minColor,
            midColor: this.midColor,
            maxColor: this.maxColor
        }
    }

    clone(): DivergingGradientScale {
        const json = this.toJson()
        return new DivergingGradientScale(json)
    }
}

class ConstantColorScale {
    color: string

    constructor(color: string) {
        this.color = color
    }

    getColor(): string {
        return this.color
    }
}


export {BinnedColorScale, GradientColorScale, ConstantColorScale, DivergingGradientScale, ColorScaleFactory}
