/**
 * Utilities for creating and registering custom file formats for generic delimited files.  A format definition consists
 * of an ordered list of fields, and optional delimiter specified.
 */

export interface FileFormat {
    fields: string[]
    chr?: number
    start?: number
    end?: number
    delimiter?: string
}

function registerFileFormats(name: string, fields: string[]): void {
    FileFormats[name] = {fields: fields}
}

function getFormat(name: string): FileFormat | undefined {

    if (FileFormats && FileFormats[name]) {
        return expandFormat(FileFormats[name])
    } else {
        return undefined
    }

    function expandFormat(format: FileFormat): FileFormat {

        const result: FileFormat = {fields: format.fields}
        const keys = ['chr', 'start', 'end'] as const

        for (let i = 0; i < result.fields.length; i++) {
            for (let key of keys) {
                if (key === result.fields[i]) {
                    result[key] = i
                }
            }
        }

        return result
    }
}


const FileFormats: Record<string, FileFormat> = {

    gwascatalog: {
        fields: [
            'bin',
            'chr',
            'start',
            'end',
            'name',
            'pubMedID',
            'author',
            'pubDate',
            'journal',
            'title',
            'trait',
            'initSample',
            'replSample',
            'region',
            'genes',
            'riskAllele',
            'riskAlFreq',
            'pValue',
            'pValueDesc',
            'orOrBeta',
            'ci95',
            'platform',
            'cnv'
        ]
    },

    wgrna: {
        fields:
            [
                'bin',
                'chr',
                'start',
                'end',
                'name',
                'score',
                'strand',
                'thickStart',
                'thickEnd',
                'type'
            ]
    },

    cpgislandext: {
        fields:
            [
                'bin',
                'chr',
                'start',
                'end',
                'name',
                'length',
                'cpgNum',
                'gcNum',
                'perCpg',
                'perGc',
                'obsExp'
            ]
    },

    clinVarMain: {
        fields: [
            'chr1',
            'start',
            'end',
            'name',
            'score',
            'strand',
            'thickStart',
            'thickEnd',
            'reserved',
            'blockCount',  // Number of blocks
            'blockSizes',  // Comma separated list of block sizes
            'chromStarts', // Start positions relative to chromStart
            'origName',    // NM_198053.2(CD247):c.462C>T (p.Asp154=)	ClinVar Variation Report
            'clinSign',    // Likely benign	Clinical significance
            'reviewStatus', // 	based on: criteria provided,single submitter	Review Status
            'type',         // single nucleotide variant	Type of Variant
            'geneId', 	    // CD247	Gene Symbol
            'snpId',       //	181656780	dbSNP ID
            'nsvId',       //		dbVar ID
            'rcvAcc',      //	RCV000642347	ClinVar Allele Submission
            'testedInGtr', //	N	Genetic Testing Registry
            'phenotypeList', //	Immunodeficiency due to defect in cd3-zeta	Phenotypes
            'phenotype', //	MedGen:C1857798, OMIM:610163	Phenotype identifiers
            'origin', //	germline	Data origin
            'assembly', //	GRCh37	Genome assembly
            'cytogenetic', //	1q24.2	Cytogenetic status
            'hgvsCod', //	NM_198053.2:c.462C>T	Nucleotide HGVS
            'hgvsProt', //	NP_932170.1:p.Asp154=	Protein HGVS
            'numSubmit', //	1	Number of submitters
            'lastEval', //	Dec 19,2017	Last evaluation
            'guidelines', //		Guidelines
            'otherIds'
        ]
    }
}



export {registerFileFormats, getFormat}
