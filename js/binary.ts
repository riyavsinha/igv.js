class BinaryParser {
    littleEndian: boolean
    position: number
    view: DataView
    length: number

    constructor(dataView: DataView, littleEndian: boolean = true) {

        this.littleEndian = littleEndian
        this.position = 0
        this.view = dataView
        this.length = dataView.byteLength
    }

    /**
     * Print the first "n" bytes to the console.  Used for debugging.
     */
    dumpBytes(n: number = 100): void {
        const pos = this.position
        const bytes: number[] = []
        for (let i = 0; i <= n; i++) {
            bytes.push(this.getByte())
        }
        console.log(bytes.join(" "))
        this.setPosition(pos)
    }

    setPosition(position: number): void {
        this.position = position
    }

    available(): number {
        return this.length - this.position
    }

    remLength(): number {
        return this.length - this.position
    }

    hasNext(): boolean {
        return this.position < this.length - 1
    }

    getByte(): number {
        const retValue = this.view.getUint8(this.position)
        this.position++
        return retValue
    }

    getShort(): number {
        const retValue = this.view.getInt16(this.position, this.littleEndian)
        this.position += 2
        return retValue
    }

    getUShort(): number {
        const retValue = this.view.getUint16(this.position, this.littleEndian)
        this.position += 2
        return retValue
    }


    getInt(): number {
        const retValue = this.view.getInt32(this.position, this.littleEndian)
        this.position += 4
        return retValue
    }


    getUInt(): number {
        const retValue = this.view.getUint32(this.position, this.littleEndian)
        this.position += 4
        return retValue
    }

    getLong(): number {

        // DataView doesn't support long. So we'll try manually
        var b: number[] = []
        b[0] = this.view.getUint8(this.position)
        b[1] = this.view.getUint8(this.position + 1)
        b[2] = this.view.getUint8(this.position + 2)
        b[3] = this.view.getUint8(this.position + 3)
        b[4] = this.view.getUint8(this.position + 4)
        b[5] = this.view.getUint8(this.position + 5)
        b[6] = this.view.getUint8(this.position + 6)
        b[7] = this.view.getUint8(this.position + 7)

        let value = 0
        if (this.littleEndian) {
            for (let i = b.length - 1; i >= 0; i--) {
                value = (value * 256) + b[i]
            }
        } else {
            for (let i = 0; i < b.length; i++) {
                value = (value * 256) + b[i]
            }
        }
        this.position += 8
        return value
    }

    getString(len?: number): string {

        let s = ""
        let c: number
        while ((c = this.view.getUint8(this.position++)) !== 0) {
            s += String.fromCharCode(c)
            if (len && s.length === len) break
        }
        return s
    }

    getFixedLengthString(len: number): string {

        let s = ""
        for (let i = 0; i < len; i++) {
            const c = this.view.getUint8(this.position++)
            if (c > 0) {
                s += String.fromCharCode(c)
            }
        }
        return s
    }

    getFloat(): number {

        var retValue = this.view.getFloat32(this.position, this.littleEndian)
        this.position += 4
        return retValue


    }

    getDouble(): number {

        var retValue = this.view.getFloat64(this.position, this.littleEndian)
        this.position += 8
        return retValue
    }

    skip(n: number): number {
        this.position += n
        return this.position
    }


    /**
     * Return a BGZip (bam and tabix) virtual pointer
     * TODO -- why isn't 8th byte used ?
     * TODO -- does endian matter here ?
     */
    getVPointer(): VPointer {

        var position = this.position,
            offset = (this.view.getUint8(position + 1) << 8) | (this.view.getUint8(position)),
            byte6 = ((this.view.getUint8(position + 6) & 0xff) * 0x100000000),
            byte5 = ((this.view.getUint8(position + 5) & 0xff) * 0x1000000),
            byte4 = ((this.view.getUint8(position + 4) & 0xff) * 0x10000),
            byte3 = ((this.view.getUint8(position + 3) & 0xff) * 0x100),
            byte2 = ((this.view.getUint8(position + 2) & 0xff)),
            block = byte6 + byte5 + byte4 + byte3 + byte2
        this.position += 8

        return new VPointer(block, offset)
    }
}

class VPointer {
    block: number
    offset: number

    constructor(block: number, offset: number) {
        this.block = block
        this.offset = offset
    }

    isLessThan(vp: VPointer): boolean {
        return this.block < vp.block ||
            (this.block === vp.block && this.offset < vp.offset)
    }

    isGreaterThan(vp: VPointer): boolean {
        return this.block > vp.block ||
            (this.block === vp.block && this.offset > vp.offset)
    }

    isEqualTo(vp: VPointer): boolean {
        return this.block === vp.block && this.offset === vp.offset
    }

    print(): string {
        return "" + this.block + ":" + this.offset
    }
}

export default BinaryParser
