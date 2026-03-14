import {IGVMath} from "../../node_modules/igv-utils/src/index.js"

// RatioColorScale is referenced but never defined/imported — pre-existing dead code path
declare const RatioColorScale: any

interface ColorScaleConfig {
    threshold: number
    r: number
    g: number
    b: number
}

interface ColorComponents {
    r: number
    g: number
    b: number
}

const defaultColorScaleConfig: ColorScaleConfig = {threshold: 2000, r: 0, g: 0, b: 255}

class HicColorScale {

    threshold: number
    r: number
    g: number
    b: number
    cache: string[]
    nbins: number
    binsize: number

    constructor(scale?: ColorScaleConfig) {

        scale = scale || defaultColorScaleConfig
        this.threshold = scale.threshold;
        this.r = scale.r;
        this.g = scale.g;
        this.b = scale.b;
        this.cache = []
        this.nbins = 2000
        this.binsize = this.threshold / this.nbins
    }

    setThreshold(threshold: number): void {
        this.threshold = threshold;
        this.cache = []
        this.binsize = this.threshold / this.nbins
    }

    getThreshold(): number {
        return this.threshold;
    }

    setColorComponents(components: ColorComponents): void {
        this.r = components.r;
        this.g = components.g;
        this.b = components.b;
        this.cache = []
    }

    getColorComponents(): ColorComponents {
        return {
            r: this.r,
            g: this.g,
            b: this.b
        }
    }

    equals(cs: HicColorScale): boolean {
        return JSON.stringify(this) === JSON.stringify(cs);
    }

    getColor(value: number): string {
        const low = 0;
        const bin = Math.floor(Math.min(this.threshold, value) / this.binsize)
        if (undefined === this.cache[bin]) {
            const alpha = (IGVMath.clamp(value, low, this.threshold) - low) / (this.threshold - low)
            this.cache[bin] = `rgba(${this.r},${this.g},${this.b}, ${alpha})`
        }
        return this.cache[bin]
    }

    stringify(): string {
        return "" + this.threshold + ',' + this.r + ',' + this.g + ',' + this.b;
    }

    static parse(string: string): HicColorScale {

        if (string.startsWith("R:")) {
            const pnstr = string.substring(2).split(":");
            const ratioCS = new RatioColorScale(Number.parseFloat(pnstr[0]));
            ratioCS.positiveScale = foo(pnstr[1]);
            ratioCS.negativeScale = foo(pnstr[2]);
            return ratioCS;
        } else {
            return foo(string);
        }

        function foo(str: string): HicColorScale {
            const tokens = str.split(",");

            const cs: ColorScaleConfig = {
                threshold: Number(tokens[0]),
                r: Number(tokens[1]),
                g: Number(tokens[2]),
                b: Number(tokens[3])
            };
            return new HicColorScale(cs);
        }
    }
}


export default HicColorScale
