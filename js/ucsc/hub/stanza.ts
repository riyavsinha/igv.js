const parentOverrideProperties = new Set(["visibility", "priority", "group"])

const nonInheritableProperties = new Set([
    "track", "type", "shortLabel", "longLabel", "bigDataUrl",
    "parent", "superTrack", "priority", "view", "compositeContainer", "compositeTrack"
])


class Stanza {

    properties: Map<string, string> = new Map()
    type: string
    name: string
    parent?: Stanza

    constructor(type: string, name: string) {
        this.type = type
        this.name = name
    }

    setProperty(key: string, value: string): void {
        this.properties.set(key, value)
    }

    getProperty(key: string): string | undefined {
        if (this.properties.has("noInherit")) {
            return this.properties.get(key)
        } else if (this.parent && parentOverrideProperties.has(key) && this.parent.hasProperty(key)) {
            return this.parent.getProperty(key)
        } else if (this.properties.has(key)) {
            return this.properties.get(key)
        } else if (this.parent && !nonInheritableProperties.has(key)) {
            return this.parent.getProperty(key)
        } else {
            return undefined
        }
    }

    hasProperty(key: string): boolean {
        return this.getProperty(key) !== null && this.getProperty(key) !== undefined
    }

    hasOwnProperty(key: string): boolean {
        return this.properties.has(key)
    }

    getOwnProperty(key: string): string | undefined {
        return this.properties.get(key)
    }

    removeProperty(key: string): void {
        this.properties.delete(key)
    }

    get format(): string | undefined {
        const type = this.getProperty("type")
        if (type) {
            // Trim extra bed qualifiers (e.g. bigBed + 4)
            return firstWord(type)
        }
        return undefined // unknown type
    }

    get displayMode(): string {
        let viz = this.getProperty("visibility")
        if (!viz) {
            return "COLLAPSED"
        } else {
            viz = viz.toLowerCase()
            switch (viz) {
                case "dense":
                    return "COLLAPSED"
                case "pack":
                    return "EXPANDED"
                case "squish":
                    return "SQUISHED"
                default:
                    return "COLLAPSED"
            }
        }
    }
}


function firstWord(str: string): string {
    const idx = str.indexOf(' ')
    return idx > 0 ? str.substring(0, idx) : str
}


export default Stanza
