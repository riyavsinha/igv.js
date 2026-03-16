/**
 * Utilities for detecting problematic resources (local files, Google Drive URLs)
 * that cannot be reliably loaded when a session is shared or restored.
 */

function isLocalFile(obj: unknown): obj is File {
    return obj instanceof File
}

function isGoogleDriveURL(url: unknown): boolean {
    if (typeof url !== 'string') {
        return false
    }
    return url.includes('googleapis.com/drive') || url.includes('drive.google.com')
}

function extractGoogleDriveFileId(url: unknown): string | null {
    if (typeof url !== 'string') {
        return null
    }

    const apiMatch = url.match(/\/drive\/v3\/files\/([^/?]+)/)
    if (apiMatch) {
        return apiMatch[1]
    }

    const driveMatch = url.match(/\/file\/d\/([^/]+)/)
    if (driveMatch) {
        return driveMatch[1]
    }

    const ucMatch = url.match(/[?&]id=([^&]+)/)
    if (ucMatch) {
        return ucMatch[1]
    }

    return null
}

function isProblematicResource(value: unknown): 'local-file' | 'google-drive' | null {
    if (isLocalFile(value)) {
        return 'local-file'
    }
    if (isGoogleDriveURL(value)) {
        return 'google-drive'
    }
    return null
}

export {
    isLocalFile,
    isGoogleDriveURL,
    isProblematicResource,
    extractGoogleDriveFileId
}
