/**
 * ClinVar utilities for searching and retrieving ClinVar variation information
 */

interface ESearchResult {
    count: number
    idlist: string[]
}

interface ESearchResponse {
    esearchresult: ESearchResult
}

/**
 * Get the ClinVar URL for the given HGVS notation
 * @param hgvsNotation - The HGVS notation string to search for
 * @return The ClinVar variation URL, or null if not found or error occurs
 */
async function getClinVarURL(hgvsNotation: string): Promise<string | null> {
    try {
        const encodedHgvs: string = encodeURIComponent(hgvsNotation)
        const esearchUrl: string = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?` +
            `db=clinvar&term=${encodedHgvs}&retmode=json`

        const response: Response = await fetch(esearchUrl)

        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status}`)
            return null
        }

        // Parse JSON response to get the first ClinVar accession
        const json: ESearchResponse = await response.json()
        const esearchResult: ESearchResult = json.esearchresult

        if (esearchResult.count > 0) {
            const uid: string = esearchResult.idlist[0]
            return `https://www.ncbi.nlm.nih.gov/clinvar/variation/${uid}/`
        } else {
            return null
        }

    } catch (e) {
        console.error("Error fetching ClinVar URL", e)
        return null
    }
}

export const ClinVar = {
    getClinVarURL
}
