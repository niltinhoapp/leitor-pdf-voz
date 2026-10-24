import { OCREngine } from './ocr-engine.js';

/**
 * PDFEngine - Leitor e Analisador Inteligente de PDF
 * Classifica automaticamente o tipo do PDF:
 * 1. Texto Digital Padrão
 * 2. Multi-coluna (Artigos/Jornais) com ordenação correta de leitura
 * 3. Escaneado / Foto com OCR automático
 */
export class PDFEngine {
  constructor() {
    this.pdfDoc = null;
    this.totalPages = 0;
    this.currentPageNumber = 1;
    this.pageDataCache = new Map(); // Armazena texto limpo e metadados por página
    this.ocr = new OCREngine();
    this.detectedModel = 'unknown'; // 'digital' | 'multi-column' | 'scanned'
    
    // Configura o worker do PDF.js
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  async loadDocument(fileOrArrayBuffer) {
    if (!window.pdfjsLib) {
      throw new Error('Biblioteca PDF.js não carregada');
    }

    this.pageDataCache.clear();
    this.detectedModel = 'unknown';

    let loadingTask;
    if (fileOrArrayBuffer instanceof ArrayBuffer) {
      loadingTask = window.pdfjsLib.getDocument({ data: fileOrArrayBuffer });
    } else {
      const buffer = await fileOrArrayBuffer.arrayBuffer();
      loadingTask = window.pdfjsLib.getDocument({ data: buffer });
    }

    this.pdfDoc = await loadingTask.promise;
    this.totalPages = this.pdfDoc.numPages;
    this.currentPageNumber = 1;

    // Faz uma varredura inicial rápida na primeira página para identificar o modelo
    await this.analyzeDocumentModel();

    return {
      totalPages: this.totalPages,
      detectedModel: this.detectedModel
    };
  }

  /**
   * Analisa as primeiras páginas para classificar o modelo do documento
   */
  async analyzeDocumentModel() {
    try {
      const firstPage = await this.pdfDoc.getPage(1);
      const textContent = await firstPage.getTextContent();
      const viewport = firstPage.getViewport({ scale: 1.0 });

      // 1. Teste de documento escaneado (sem camada de texto nativa)
      let totalChars = 0;
      textContent.items.forEach(item => totalChars += item.str.trim().length);

      if (totalChars < 25) {
        this.detectedModel = 'scanned'; // Necessita OCR
        return this.detectedModel;
      }

      // 2. Teste de multi-coluna (calcula distribuição horizontal dos blocos de texto)
      const pageWidth = viewport.width;
      const midPoint = pageWidth / 2;
      let leftCount = 0;
      let rightCount = 0;

      textContent.items.forEach(item => {
        const x = item.transform[4];
        if (x < midPoint * 0.9) leftCount++;
        else if (x > midPoint * 1.1) rightCount++;
      });

      // Se houver densidade significativa em ambos os lados e baixa densidade no centro exato
      if (leftCount > 15 && rightCount > 15) {
        this.detectedModel = 'multi-column';
      } else {
        this.detectedModel = 'digital';
      }

      return this.detectedModel;
    } catch (err) {
      console.warn('[PDF Analysis Warning]', err);
      this.detectedModel = 'digital';
      return this.detectedModel;
    }
  }

  /**
   * Extrai e ordena o texto de uma página de acordo com seu modelo
   */
  async extractPageText(pageNum, canvasForOcr = null, onProgress = null) {
    if (this.pageDataCache.has(pageNum)) {
      return this.pageDataCache.get(pageNum);
    }

    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    let fullText = '';
    let isOcrUsed = false;

    // Verifica se a página é escaneada
    let rawLength = 0;
    textContent.items.forEach(i => rawLength += i.str.trim().length);

    if (rawLength < 20 && canvasForOcr) {
      // Ativa OCR automaticamente
      isOcrUsed = true;
      fullText = await this.ocr.recognizeCanvas(canvasForOcr, onProgress);
    } else {
      // Extração inteligente de texto nativo com ordenação geométrica
      fullText = this.smartSortTextItems(textContent.items, viewport.width);
    }

    const pageResult = {
      pageNum,
      text: fullText,
      isOcrUsed,
      charCount: fullText.length
    };

    this.pageDataCache.set(pageNum, pageResult);
    return pageResult;
  }

  /**
   * Ordena os blocos de texto para que textos em colunas sejam lidos na ordem correta
   */
  smartSortTextItems(items, pageWidth) {
    if (!items || items.length === 0) return '';

    // Clonamos os itens para não mutar o original
    const structuredItems = items.map(item => ({
      str: item.str,
      x: Math.round(item.transform[4]),
      y: Math.round(item.transform[5]), // PDF coordinates: y=0 é no rodapé
      width: item.width,
      height: item.height
    })).filter(i => i.str.trim().length > 0);

    // Se detectado como multi-coluna (ex: 2 colunas)
    if (this.detectedModel === 'multi-column') {
      const mid = pageWidth / 2;
      const leftCol = [];
      const rightCol = [];
      const spanCols = []; // Cabeçalhos de página inteira

      structuredItems.forEach(item => {
        if (item.x < mid * 0.92 && (item.x + (item.width || 0)) <= mid * 1.05) {
          leftCol.push(item);
        } else if (item.x >= mid * 0.92) {
          rightCol.push(item);
        } else {
          spanCols.push(item);
        }
      });

      // Ordena de cima para baixo (y decrescente no PDF)
      const sortByYDesc = (a, b) => {
        if (Math.abs(a.y - b.y) < 6) return a.x - b.x; // Mesma linha
        return b.y - a.y; // Linha superior primeiro
      };

      leftCol.sort(sortByYDesc);
      rightCol.sort(sortByYDesc);
      spanCols.sort(sortByYDesc);

      // Junta cabeçalhos de largura total, depois coluna 1 inteira, depois coluna 2
      const fullOrdered = [...spanCols, ...leftCol, ...rightCol];
      return this.joinItemsToText(fullOrdered);
    }

    // Ordenação padrão para texto corrido (y decrescente, x crescente)
    structuredItems.sort((a, b) => {
      if (Math.abs(a.y - b.y) < 6) {
        return a.x - b.x;
      }
      return b.y - a.y;
    });

    return this.joinItemsToText(structuredItems);
  }

  joinItemsToText(items) {
    let result = '';
    let lastY = null;
    let lastXEnd = null;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (lastY !== null) {
        const lineDiff = Math.abs(item.y - lastY);
        if (lineDiff >= 10) {
          // Nova linha ou novo parágrafo
          result += lineDiff >= 20 ? '\n\n' : '\n';
        } else if (lastXEnd !== null && (item.x - lastXEnd) > 4) {
          result += ' ';
        }
      }
      result += item.str;
      lastY = item.y;
      lastXEnd = item.x + (item.width || (item.str.length * 6));
    }

    return result;
  }

  /**
   * Renderiza a página visualmente em alta resolução (AMOLED / Retina Android)
   */
  async renderPageToCanvas(pageNum, canvas) {
    const page = await this.pdfDoc.getPage(pageNum);
    
    // Pixel ratio para máxima nitidez no celular
    const dpr = window.devicePixelRatio || 1.5;
    
    // Ajusta a escala para preencher a largura da tela do celular
    const containerWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 360;
    const initialViewport = page.getViewport({ scale: 1.0 });
    const scale = (containerWidth / initialViewport.width) * dpr;
    const viewport = page.getViewport({ scale: Math.max(scale, 1.5) });

    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };

    await page.render(renderContext).promise;
    return canvas;
  }
}
