import { DocumentParser } from '@DocumentParser';
import { PdfDocument } from '@parser/PdfParser';

export class PdfParser extends DocumentParser {
	static ext = 'pdf';
	async parse() {
		const doc = new PdfDocument()
		if (this.arrayBuffer) {
			await doc.load(await this.arrayBuffer)
		}
		return doc
	}
}
