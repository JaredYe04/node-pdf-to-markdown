import type { PDFDocumentProxy, DocumentInitParameters, TypedArray, TextItem } from 'pdfjs-dist/types/display/api'

interface Page {
    index: number
    items: TextItem[]
}
interface Font {
    ids: Set<string>
    map: Map<string, any>
}
interface Metadata {
    info: Object
    metadata: {
        parsedData: any
        rawData: any
        getRaw: () => any
        get: (name: any) => any
        getAll: () => any
        has: (name: any) => any
    }
}

interface ImageOptions {
    /** Image processing mode: 'none' (default, ignore images), 'base64' (embed as base64), 'relative' (return image map), 'save' (save to disk) */
    imageMode?: 'none' | 'base64' | 'relative' | 'save'
    /** Path to save images (required when imageMode is 'save') */
    imageSavePath?: string
    /** PDF title prefix for image names (used to prevent naming conflicts) */
    pdfTitle?: string
}

interface ConversionOptions {
    /** Optional callbacks for various events during the conversion process */
    callbacks?: {
        metadataParsed?: (metadata: Metadata) => void
        pageParsed?: (pages: Page[]) => void
        fontParsed?: (font: Font) => void
        documentParsed?: (document: PDFDocumentProxy, pages: Page[]) => void
    }
    /** Image processing options */
    imageMode?: 'none' | 'base64' | 'relative' | 'save'
    imageSavePath?: string
    pdfTitle?: string
}

interface ConversionResult {
    /** The Markdown text, page array */
    markdown: string[]
    /** Map of image names to image buffers (only when imageMode is 'relative') */
    images: Map<string, Buffer>
}

/**
 * Converts a PDF file to a Markdown string.
 *
 * @param {string | URL | TypedArray | ArrayBuffer | DocumentInitParameters} pdfBuffer - The PDF file to convert.
 * @param {ConversionOptions | ImageOptions} options - Optional configuration options or legacy callbacks.
 * @return {Promise<string[] | ConversionResult>} A promise that resolves to:
 *   - string[] when imageMode is 'none', 'base64', or 'save'
 *   - ConversionResult when imageMode is 'relative'
 */
declare function pdf2md(
    pdfBuffer: string | URL | TypedArray | ArrayBuffer | DocumentInitParameters,
    options?: ConversionOptions | {
        metadataParsed?: (metadata: Metadata) => void
        pageParsed?: (pages: Page[]) => void
        fontParsed?: (font: Font) => void
        documentParsed?: (document: PDFDocumentProxy, pages: Page[]) => void
    }
): Promise<string[] | ConversionResult>

export = pdf2md
