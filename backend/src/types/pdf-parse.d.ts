declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfResult {
    text: string
  }
  export default function pdf(buffer: Buffer): Promise<PdfResult>
}
