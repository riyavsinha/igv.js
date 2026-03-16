import {isExon, isTranscript, isTranscriptPart} from "./so"
import {GFFFeature, GFFTranscript} from "./gffFeature"

interface GFFHelperOptions {
    format: string
    nameField?: string
    filterTypes?: string[]
}

interface GenomicInterval {
    start: number
    end: number
}

interface GFFFeatureRecord {
    type: string
    id?: string
    chr: string
    start: number
    end: number
    parent?: string
    strand?: string
    name?: string
    exons?: Array<{ start: number; end: number; number?: number }>
    attributeString?: string
    getAttributeValue?: (name: string) => unknown
    // Dynamic GFF record properties from parsed attributes
    [key: string]: unknown
}


class GFFHelper {

    static gffNameFields: Set<string> = new Set(["Name", "transcript_id", "gene_name", "gene", "gene_id", "alias", "locus", "name"])

    format: string
    nameField?: string
    filterTypes: Set<string>

    constructor(options: GFFHelperOptions) {
        this.format = options.format
        this.nameField = options.nameField
        this.filterTypes = options.filterTypes === undefined ?
            new Set(['chromosome']) :
            new Set(options.filterTypes)
    }

    combineFeatures(features: GFFFeatureRecord[], genomicInterval?: GenomicInterval): (GFFFeature | GFFFeatureRecord)[] {

        let combinedFeatures: (GFFFeature | GFFFeatureRecord)[]

        const filterTypes = this.filterTypes
        features = features.filter(f => filterTypes === undefined || !filterTypes.has(f.type))

        if ("gff3" === this.format) {
            const tmp = this.combineFeaturesById(features)
            combinedFeatures = this.combineFeaturesByType(tmp)
        } else {
            combinedFeatures = this.combineFeaturesByType(features)
        }

        this.numberExons(combinedFeatures, genomicInterval)
        this.nameFeatures(combinedFeatures)
        return combinedFeatures
    }

    /**
     * Combine multiple non-transcript model features with the same ID on the same chromosome into a single feature.
     * Features that are part of the transcript model (e.g. exon, mRNA, etc) are combined later.
     */
    combineFeaturesById(features: GFFFeatureRecord[]): GFFFeatureRecord[] {

        const chrIdMap: Map<string, Map<string, GFFFeatureRecord[]>> = new Map()
        const combinedFeatures: GFFFeatureRecord[] = []

        for (let f of features) {
            if (isTranscriptPart(f.type) || isTranscript(f.type) || !f.id) {
                combinedFeatures.push(f)
            } else {
                let idMap = chrIdMap.get(f.chr)
                if (!idMap) {
                    idMap = new Map()
                    chrIdMap.set(f.chr, idMap)
                }

                let featureArray = idMap.get(f.id)
                if (featureArray) {
                    featureArray.push(f)
                } else {
                    idMap.set(f.id, [f])
                }
            }
        }

        for (let idMap of chrIdMap.values()) {
            for (let featureArray of idMap.values()) {
                if (featureArray.length > 1) {
                    // Use the first feature as prototypical (for column 9 attributes), and adjust start/end
                    // Parts are represented as "exons", as that is how they are presented visually
                    const cf = featureArray[0]
                    cf.exons = []
                    for (let f of featureArray) {
                        cf.start = Math.min(cf.start, f.start)
                        cf.end = Math.max(cf.end, f.end)
                        cf.exons!.push({
                            start: f.start,
                            end: f.end
                        })
                    }
                    combinedFeatures.push(cf)
                } else {
                    combinedFeatures.push(featureArray[0])
                }
            }
        }

        return combinedFeatures
    }

    combineFeaturesByType(features: GFFFeatureRecord[]): (GFFFeature | GFFFeatureRecord)[] {

        // Build dictionary of genes
        const genes = features.filter(f => "gene" === f.type || f.type.endsWith("_gene"))
        const geneMap: Record<string, GFFFeatureRecord> = Object.create(null)
        for (let g of genes) {
            geneMap[g.id!] = g
        }

        // 1. Build dictionary of transcripts
        const transcripts: Record<string, GFFTranscript> = Object.create(null)
        const combinedFeatures: (GFFFeature | GFFFeatureRecord)[] = []
        const consumedFeatures: Set<GFFFeatureRecord> = new Set()
        const filterTypes = this.filterTypes

        features = features.filter(f => filterTypes === undefined || !filterTypes.has(f.type))

        for (let f of features) {
            if (isTranscript(f.type)) {
                const transcriptId = f.id
                if (undefined !== transcriptId) {
                    const gffTranscript = new GFFTranscript(f)
                    transcripts[transcriptId] = gffTranscript
                    combinedFeatures.push(gffTranscript)
                    consumedFeatures.add(f)
                    const g = geneMap[f.parent!]
                    if (g) {
                        gffTranscript.geneObject = g as unknown as GFFFeature
                        consumedFeatures.add(g)
                    }
                }
            }
        }

        // Add exons and transcript parts
        for (let f of features) {
            if (isTranscriptPart(f.type)) {
                const parents = getParents(f)
                if (parents) {
                    for (let id of parents) {

                        let transcript = transcripts[id]
                        if (!transcript && this.format === "gtf") {
                            // GTF does not require explicit a transcript or mRNA record, start one with this feature.
                            const psuedoTranscript: GFFFeatureRecord = Object.assign({}, f, {type: "transcript"})
                            transcript = new GFFTranscript(psuedoTranscript)
                            transcripts[id] = transcript
                            combinedFeatures.push(transcript)
                        }
                        if (transcript !== undefined) {

                            if (isExon(f.type)) {
                                if (parents.length > 1) {
                                    // Multiple parents, this is unusual.  Make a copy as exon can be modified
                                    // differently by CDS, etc, for each parent
                                    const e2 = new GFFFeature(f)
                                    transcript.addExon(e2)
                                } else {
                                    transcript.addExon(f as GFFFeatureRecord & { start: number; end: number })
                                }
                            } else {
                                transcript.addPart(new GFFFeature(f))
                            }
                            consumedFeatures.add(f)
                        }
                    }
                }
            }
        }

        // Finish transcripts
        combinedFeatures.forEach(function (f: GFFFeature | GFFFeatureRecord) {
            if ('finish' in f && typeof f.finish === "function") {
                f.finish()
            }
        })

        // Add other features
        const others = features.filter(f => !consumedFeatures.has(f))
        for (let f of others) {
            combinedFeatures.push(f)
        }

        return combinedFeatures

        function getParents(f: GFFFeatureRecord): string[] | null {
            if (f.parent && f.parent.trim() !== "") {
                return f.parent.trim().split(",")
            } else {
                return null
            }
        }
    }

    numberExons(features: (GFFFeature | GFFFeatureRecord)[], genomicInterval?: GenomicInterval): void {

        for (const feature of features) {
            const f = feature as GFFFeatureRecord
            if (f.exons &&
                (!genomicInterval ||
                    (f.end <= genomicInterval.end && f.start > genomicInterval.start))) {
                for (let i = 0; i < f.exons.length; i++) {
                    const exon = f.exons[i]
                    exon.number = f.strand === "-" ? f.exons.length - i : i + 1
                }
            }
        }
    }

    nameFeatures(features: (GFFFeature | GFFFeatureRecord)[]): void {
        // Find name (label) property
        for (const feature of features) {
            const f = feature as GFFFeatureRecord
            if(typeof f.getAttributeValue === 'function') {
                if (this.nameField) {
                    f.name = f.getAttributeValue(this.nameField) as string | undefined
                } else {
                    for (let nameField of GFFHelper.gffNameFields) {
                        const v = f.getAttributeValue(nameField)
                        if (v) {
                            f.name = v as string
                            break
                        }
                    }
                }
            }
        }
    }
}


export default GFFHelper
