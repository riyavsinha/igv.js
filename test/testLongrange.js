import "./utils/mockObjects.js"
import FeatureSource from "../js/feature/featureSource.js"
import FeatureFileReader from "../js/feature/featureFileReader.js"
import {assert} from 'chai'
import {createGenome} from "./utils/MockGenome.js"

const genome = createGenome()

suite("testLongrange", function () {

    test("longrange format - intra-chromosomal interaction", async function () {
        const chr = "chr1"
        const start = 1
        const end = Number.MAX_SAFE_INTEGER
        const featureSource = FeatureSource({
                url: 'test/data/bedpe/longrange_example.txt',
                format: 'longrange'
            },
            genome
        )

        const features = await featureSource.getFeatures({chr, start, end})
        assert.ok(features)
        assert.equal(features.length, 4)  // 2 interactions on chr1, each with 2 lines
        
        // Check first interaction
        const firstFeature = features.find(f => f.start1 === 111 && f.end1 === 222)
        assert.ok(firstFeature)
        assert.equal(firstFeature.chr1, 'chr1')
        assert.equal(firstFeature.start1, 111)
        assert.equal(firstFeature.end1, 222)
        assert.equal(firstFeature.chr2, 'chr2')
        assert.equal(firstFeature.start2, 333)
        assert.equal(firstFeature.end2, 444)
        assert.equal(firstFeature.score, 55)
        
        // Check second intra-chromosomal interaction
        const secondFeature = features.find(f => f.start1 === 1000 && f.end1 === 2000)
        assert.ok(secondFeature)
        assert.equal(secondFeature.chr1, 'chr1')
        assert.equal(secondFeature.chr2, 'chr1')
        assert.equal(secondFeature.start2, 5000)
        assert.equal(secondFeature.end2, 6000)
        assert.equal(secondFeature.score, 100)
        assert.equal(secondFeature.chr, 'chr1')
        assert.equal(secondFeature.start, 1000)
        assert.equal(secondFeature.end, 6000)
    })

    test("longrange format - inter-chromosomal interaction", async function () {
        const chr = "chr3"
        const start = 1
        const end = Number.MAX_SAFE_INTEGER
        const featureSource = FeatureSource({
                url: 'test/data/bedpe/longrange_example.txt',
                format: 'longrange'
            },
            genome
        )

        const features = await featureSource.getFeatures({chr, start, end})
        assert.ok(features)
        assert.equal(features.length, 2)  // Inter-chr features are duplicated, so we get 2 copies
        
        const feature = features[0]
        assert.equal(feature.chr1, 'chr3')
        assert.equal(feature.start1, 10000)
        assert.equal(feature.end1, 11000)
        assert.equal(feature.chr2, 'chr4')
        assert.equal(feature.start2, 20000)
        assert.equal(feature.end2, 21000)
        assert.equal(feature.score, 75.5)
    })

    test("longrange format - all features", async function () {
        const reader = new FeatureFileReader({
            format: 'longrange',
            url: 'test/data/bedpe/longrange_example.txt'
        })

        const features = await reader.loadFeaturesNoIndex()
        assert.ok(features)
        // 6 original lines + 4 duplicates for inter-chr interactions = 10 features
        assert.equal(features.length, 10)
        
        // Verify all features have required properties
        for (let f of features) {
            assert.ok(f.chr1)
            assert.ok(!isNaN(f.start1))
            assert.ok(!isNaN(f.end1))
            assert.ok(f.chr2)
            assert.ok(!isNaN(f.start2))
            assert.ok(!isNaN(f.end2))
            assert.ok(!isNaN(f.score))
        }
    })
})
