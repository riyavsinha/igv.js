interface SpanCoord {
    left: number
    right: number
}

interface FusionJuncSpanFeature {
    chr: string
    name: string
    junction_left: number
    junction_right: number
    num_junction_reads: number
    num_spanning_frags: number
    spanning_frag_coords: SpanCoord[]
    start: number
    end: number
}

function decodeFusionJuncSpan(tokens: string[], header: any): FusionJuncSpanFeature | undefined {

    /*
     Format:

     0       #scaffold
     1       fusion_break_name
     2       break_left
     3       break_right
     4       num_junction_reads
     5       num_spanning_frags
     6       spanning_frag_coords

     0       B3GNT1--NPSR1
     1       B3GNT1--NPSR1|2203-10182
     2       2203
     3       10182
     4       189
     5       1138
     6       1860-13757,1798-13819,1391-18127,1443-17174,...

     */


    if (tokens.length < 7) return undefined

    const chr = tokens[0]
    const fusion_name = tokens[1]
    const junction_left = parseInt(tokens[2])
    const junction_right = parseInt(tokens[3])
    const num_junction_reads = parseInt(tokens[4])
    const num_spanning_frags = parseInt(tokens[5])

    const spanning_frag_coords_text = tokens[6]

    const feature: FusionJuncSpanFeature = {
        chr: chr,
        name: fusion_name,
        junction_left: junction_left,
        junction_right: junction_right,
        num_junction_reads: num_junction_reads,
        num_spanning_frags: num_spanning_frags,
        spanning_frag_coords: [],

        start: -1,
        end: -1
    } // set start and end later based on min/max of span coords

    let min_coord: number = junction_left
    let max_coord: number = junction_right

    if (num_spanning_frags > 0) {

        const coord_pairs = spanning_frag_coords_text.split(',')

        for (let i = 0; i < coord_pairs.length; i++) {
            const split_coords = coord_pairs[i].split('-')

            const span_left = parseInt(split_coords[0])
            const span_right = parseInt(split_coords[1])

            if (span_left < min_coord) {
                min_coord = span_left
            }
            if (span_right > max_coord) {
                max_coord = span_right
            }
            feature.spanning_frag_coords.push({left: span_left, right: span_right})

        }
    }

    feature.start = min_coord
    feature.end = max_coord


    return feature

}

export {decodeFusionJuncSpan}
