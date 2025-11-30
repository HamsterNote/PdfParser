import { HamsterDocument } from '@DocumentParser';
import { getDocument, PDFDocumentProxy } from 'pdfjs-dist';

export class PdfDocument extends HamsterDocument {
	private pdf: PDFDocumentProxy | undefined;
	async load(arrayBuffer: ArrayBuffer) {
		const loadingTask = getDocument(arrayBuffer);
		await loadingTask.promise.then(pdf => {
			this.pdf = pdf;
		});
	}
	getPages() {
		return Promise.resolve([]);
	}
	async getPage(pageNumber:number) {
		const pageProxy = await this.pdf?.getPage(pageNumber);
		console.log('pageProxy ', pageProxy);
		return Promise.resolve(undefined);
	}
	getOutline() {
		return Promise.resolve(undefined);
	}
	getCover() {
		return Promise.resolve(new HTMLImageElement());
	}
}
