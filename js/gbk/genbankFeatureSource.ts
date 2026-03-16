import {loadGenbank} from "./genbankParser"
import type Genbank from "./genbank"
import StaticFeatureSource from "../feature/staticFeatureSource.js"
import BaseFeatureSource, {type BaseFeatureSourceGenome} from "../feature/baseFeatureSource"
import type {GenomicFeature} from "../types/feature"

interface GenbankFeatureSourceConfig {
    url: string;
    genome?: BaseFeatureSourceGenome;
    // Dynamic config properties merged from track config
    [key: string]: unknown;
}

interface FeatureQueryParams {
    chr: string;
    start: number;
    end: number;
    bpPerPixel?: number;
    visibilityWindow?: number;
}

class GenbankFeatureSource extends BaseFeatureSource {

    config: GenbankFeatureSourceConfig;
    searchable: boolean;
    featureSource: StaticFeatureSource | undefined;

    constructor(config: GenbankFeatureSourceConfig, genome: BaseFeatureSourceGenome) {
        super(genome)
        this.config = config
        this.searchable = true
    }

    // Feature source interface
    async getFeatures({chr, start, end, bpPerPixel, visibilityWindow}: FeatureQueryParams) {
        if(!this.featureSource) {
            const gbk: Genbank = await loadGenbank(this.config.url)
            this.featureSource = new StaticFeatureSource({
                genome: this.config.genome,
                features: gbk.features as unknown as GenomicFeature[],
                searchableFields: ['gene', 'db_xref', 'locus_tag', 'transcript_id']
            }, undefined)

        }
        return this.featureSource.getFeatures({chr, start, end})
    }
    supportsWholeGenome(): boolean {
        return false
    }

    search(term: string): unknown {
        return this.featureSource?.search(term)
    }
}

export default GenbankFeatureSource
