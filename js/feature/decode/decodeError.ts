/**
 * Wrapper class to record a decoding error.
 */

class DecodeError {
    message: string

    constructor(message: string) {
        this.message = message
    }
}

export default DecodeError
