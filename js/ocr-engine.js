/**
 * OCREngine - Reconhecimento Óptico de Caracteres para PDFs Escaneados
 * Carregado sob demanda (lazy) para manter o app leve
 */
export class OCREngine {
  constructor() {
    this.tesseractReady = false;
    this.worker = null;
    this.isInitializing = false;
  }

  async loadTesseract() {
    if (this.tesseractReady) return;
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      return;
    }

    this.isInitializing = true;
    try {
      if (!window.Tesseract) {
        // Carrega o script Tesseract.js sob demanda
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      this.worker = await window.Tesseract.createWorker('por', 1, {
        logger: m => {
          if (this.onProgress && m.status === 'recognizing text') {
            this.onProgress(Math.round(m.progress * 100));
          }
        }
      });
      this.tesseractReady = true;
    } catch (err) {
      console.error('[OCR Engine Load Failed]', err);
      throw new Error('Não foi possível carregar o motor de OCR.');
    } finally {
      this.isInitializing = false;
    }
  }

  async recognizeCanvas(canvas, onProgressCallback) {
    this.onProgress = onProgressCallback;
    if (!this.tesseractReady) {
      await this.loadTesseract();
    }

    try {
      const { data: { text } } = await this.worker.recognize(canvas);
      return text;
    } catch (err) {
      console.error('[OCR Recognition Error]', err);
      return '';
    }
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.tesseractReady = false;
    }
  }
}
