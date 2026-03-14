import TextFeatureSource from "./textFeatureSource.js"
import BWSource from "../bigwig/bwSource"
import TDFSource from "../tdf/tdfSource"
import StaticFeatureSource from "./staticFeatureSource.js"
import GenbankFeatureSource from "../gbk/genbankFeatureSource.js"
import ListFeatureSource from "./listFeatureSource.js"
import HicSource from "../hic/hicSource"

const bbFormats = new Set(['bigwig', 'bw', 'bigbed', 'bb', 'biginteract', 'biggenepred', 'bignarrowpeak'])

function FeatureSource(config: any, genome: any): any {

    const format: string | undefined = config.format ? config.format.toLowerCase() : undefined

    if (config.features) {
        return new StaticFeatureSource(config, genome)
    } else if (bbFormats.has(format)) {
        return new BWSource(config, genome)
    } else if ("tdf" === format) {
        return new TDFSource(config, genome)
    } else if ("gbk" === format) {
        return new GenbankFeatureSource(config, genome)
    } else if ("vcf.list" === format) {
        // This is a text file with two columns:   <chr>  <url to vcf>
        return new ListFeatureSource(config, genome, FeatureSource)
    } else if ("hic" === format) {
        return new HicSource(config, genome)
    } else {
        return new TextFeatureSource(config, genome)
    }
}

export default FeatureSource
