/*
http://genome.ucsc.edu/cgi-bin/hgBlat
?userSeq=CTAATCAtctacactggtttctactgaaatgtctgttgtcatagacttaattgtgtcttcagatacagcagttctgttatttctgagttttacctggggcaagagaatctttagcaagtttaaaggcacctatatctggaatcacccctccctccagatgaatatcacagactctcccattaaaggtcttgccTTCCTTGATAGCATCATCACTCCA
&type=DNA
&db=hg38
&output=json
 */

import {decodePSL} from "../feature/decode/ucsc"

//const blatServer = "https://genome.ucsc.edu/cgi-bin/hgBlat"
const defaultBlatServer = "https://igv.org/services/blatUCSC.php"
//const blatServer = "http://localhost:8000/blatUCSC.php"

interface BlatResponse {
    fields: string[]
    blat: string[][]
}

async function blat({url, userSeq, db}: { url?: string, userSeq: string, db: string }): Promise<NonNullable<ReturnType<typeof decodePSL>>[]> {

    url = url || defaultBlatServer

    if(!db) {
        throw Error("Blat database is not defined")
    }

    const results = await postData(url, userSeq, db)

    const features = results.blat
        .map((tokens: string[]) => decodePSL(tokens, undefined))
        .filter((f): f is NonNullable<typeof f> => f !== undefined)

    return features
}

async function postData(url: string = "", userSeq: string, db: string): Promise<BlatResponse> {

    const data = new URLSearchParams();
    data.append("userSeq", userSeq);
    data.append("db", db);

    const response = await fetch(url, { method: "post", body: data })
    return response.json() as Promise<BlatResponse>
}



export {blat}
