import TrackBase from "../trackBase.js"
import IGVGraphics from "../igv-canvas.js"


class ImageTrack extends TrackBase {

    static defaults = {}

    locus: any
    type: string | undefined
    resolutionAware: boolean | undefined
    _images: any[] = [];
    [key: string]: any

    constructor(config: any, browser: any) {
        super(config, browser)
    }

    init(config: any): void {

        super.init(config)

        if (!config.images) {
            throw Error("images are required")
        }

        this.locus = config.locus
        this.type = "image"
        this.resolutionAware = true
    }


    // @ts-expect-error - ImageTrack.postInit returns void, not TrackBase
    async postInit(): Promise<void> {

        this._images = []

        for (let i of this.config.images) {
            const img = new Image()
            img.onload = () => {
                i.img = img
                i.bpPerPixel = (i.end - i.start) / img.width
                this._images.push(i)
            }
            img.onerror = (err: any) => {
                console.error(err)
            }
            //if (img.complete) {   //cached image
            //    img.onload()
           // }
            img.src = i.src
        }

    }

    computePixelHeight(features: any): number {
        return features ? features.height : 0
    }


    menuItemList(): any[] {

        const menuItems: any[] = []

        return menuItems
    }


    async getFeatures(chr: string, start: number, end: number, bpPerPixel: number): Promise<any> {
        // Return  image.  Scaled or not?
        return this.selectImage(chr, start, end, bpPerPixel)
    }

    selectImage(chr: string, start: number, end: number, bpPerPixel: number): any {

        // Select the highest resolution image containing the interval.  If no image contains the interval return
        // the lowest resolution image if it overlaps
        if(this._images.length == 0) {
            return null
        }
        this._images.sort((a: any, b: any) => a.bpPerPixel < b.bpPerPixel ? -1 : 1)
        for(let i of this._images) {
            if(i.bpPerPixel > bpPerPixel) {
                return i
            }
        }
        const lowRes = this._images[this._images.length-1]
        if(lowRes.chr === chr) {
            return lowRes
        } else {
            return null
        }
    }

    draw({context, pixelTop, pixelWidth, pixelHeight, features, bpPerPixel, bpStart}: { context: any, pixelTop: number, pixelWidth: number, pixelHeight: number, features: any, bpPerPixel: number, bpStart: number }): void {

        const image = features.img
        if (image) {
            const nw = image.width
            const nh = image.height
            const imageBpPerPixel = (features.end - features.start) / nw
            const scale = imageBpPerPixel / bpPerPixel
            const x = (features.start - bpStart) / bpPerPixel
            context.drawImage(image, x, 0, scale * nw, nh)
        } else {
            //console.log("No image");
        }

    }

    get supportsWholeGenome(): boolean {
        return false
    }

}


export default ImageTrack
