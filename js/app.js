import { PDFEngine } from './pdf-engine.js';
import { TTSEngine } from './tts-engine.js';

// Instâncias principais
const pdfEngine = new PDFEngine();
const ttsEngine = new TTSEngine();

// Estado do App
let currentFile = null;
let currentPage = 1;
let totalPages = 1;
let currentSentences = [];
let deferredInstallPrompt = null;
let currentSpeedIndex = 1;
const speedOptions = [0.75, 1.0, 1.25, 1.5, 2.0];

// Elementos DOM
const dom = {
  // PWA
  btnHeaderInstall: document.getElementById('btnHeaderInstall'),
  pwaInstallModal: document.getElementById('pwaInstallModal'),
  btnDoInstall: document.getElementById('btnDoInstall'),
  btnDismissInstall: document.getElementById('btnDismissInstall'),

  // Header & Status
  pdfFileInput: document.getElementById('pdfFileInput'),
  btnOpenSettings: document.getElementById('btnOpenSettings'),
  modelBadgeBar: document.getElementById('modelBadgeBar'),
  docFileName: document.getElementById('docFileName'),
  modelBadge: document.getElementById('modelBadge'),
  modelBadgeText: document.getElementById('modelBadgeText'),

  // Seções
  emptyStateSection: document.getElementById('emptyStateSection'),
  readerSection: document.getElementById('readerSection'),
  dropArea: document.getElementById('dropArea'),
  btnDemoPdf: document.getElementById('btnDemoPdf'),

  // Abas
  tabReader: document.getElementById('tabReader'),
  tabCanvas: document.getElementById('tabCanvas'),
  readerTextView: document.getElementById('readerTextView'),
  readerCanvasView: document.getElementById('readerCanvasView'),
  textContentContainer: document.getElementById('textContentContainer'),
  pdfCanvas: document.getElementById('pdfCanvas'),

  // Paginação
  btnPrevPage: document.getElementById('btnPrevPage'),
  btnNextPage: document.getElementById('btnNextPage'),
  lblCurrentPage: document.getElementById('lblCurrentPage'),
  lblTotalPages: document.getElementById('lblTotalPages'),

  // Player
  audioPlayerBar: document.getElementById('audioPlayerBar'),
  audioProgressTrack: document.getElementById('audioProgressTrack'),
  audioProgressFill: document.getElementById('audioProgressFill'),
  playerStatusText: document.getElementById('playerStatusText'),
  playerSentenceCounter: document.getElementById('playerSentenceCounter'),
  btnTtsPrev: document.getElementById('btnTtsPrev'),
  btnTtsPlayPause: document.getElementById('btnTtsPlayPause'),
  btnTtsNext: document.getElementById('btnTtsNext'),
  iconPlay: document.getElementById('iconPlay'),
  iconPause: document.getElementById('iconPause'),
  btnSpeedToggle: document.getElementById('btnSpeedToggle'),

  // Configurações
  settingsModal: document.getElementById('settingsModal'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  selectVoice: document.getElementById('selectVoice'),
  themeChips: document.querySelectorAll('.theme-chip'),

  // Toast
  toastNotice: document.getElementById('toastNotice'),
  toastIcon: document.getElementById('toastIcon'),
  toastMessage: document.getElementById('toastMessage')
};

/* ==========================================================================
   1. INICIALIZAÇÃO PWA E REGISTRO DO SERVICE WORKER
   ========================================================================== */
function initPWA() {
  // Registra Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('[PWA] Service Worker registrado com sucesso:', reg.scope))
        .catch(err => console.warn('[PWA] Falha no Service Worker:', err));
    });
  }

  // Intercepta o evento de instalação do Chrome no Android
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    
    // Mostra o botão na barra superior
    dom.btnHeaderInstall.style.display = 'flex';

    // Se o usuário ainda não fechou o banner nesta sessão ou na primeira vez, abre o Bottom Sheet nativo
    const hasPrompted = sessionStorage.getItem('pwa_prompt_shown');
    if (!hasPrompted && !isStandalone()) {
      setTimeout(() => {
        dom.pwaInstallModal.classList.add('show');
        sessionStorage.setItem('pwa_prompt_shown', 'true');
      }, 1200);
    }
  });

  // Clique no botão de instalar do Bottom Sheet
  dom.btnDoInstall.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    dom.pwaInstallModal.classList.remove('show');
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('Aplicativo instalado com sucesso!', '📱');
      dom.btnHeaderInstall.style.display = 'none';
    }
    deferredInstallPrompt = null;
  });

  dom.btnDismissInstall.addEventListener('click', () => {
    dom.pwaInstallModal.classList.remove('show');
  });

  dom.btnHeaderInstall.addEventListener('click', () => {
    if (deferredInstallPrompt) {
      dom.pwaInstallModal.classList.add('show');
    }
  });

  window.addEventListener('appinstalled', () => {
    showToast('PDF Voz Pro foi instalado no seu dispositivo!', '🚀');
    dom.btnHeaderInstall.style.display = 'none';
    deferredInstallPrompt = null;
  });
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/* ==========================================================================
   2. GERENCIAMENTO DE ARQUIVOS PDF
   ========================================================================== */
function initFileHandlers() {
  // Demo PDF
  if (dom.btnDemoPdf) {
    dom.btnDemoPdf.addEventListener('click', async () => {
      try {
        showToast('Carregando PDF de demonstração...', '⏳');
        const res = await fetch('./exemplo_livro.pdf');
        const blob = await res.blob();
        const file = new File([blob], 'exemplo_livro.pdf', { type: 'application/pdf' });
        await openPdfFile(file);
      } catch (err) {
        showToast('Erro ao carregar demonstração.', '❌');
      }
    });
  }
  dom.pdfFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await openPdfFile(file);
  });

  // Drag and Drop
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  dom.dropArea.addEventListener('drop', async (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    if (file && file.type === 'application/pdf') {
      await openPdfFile(file);
    } else {
      showToast('Por favor, selecione um arquivo no formato PDF.', '⚠️');
    }
  });
}

async function openPdfFile(file) {
  try {
    currentFile = file;
    showToast('Analisando modelo do PDF...', '🔍');
    
    // Atualiza nome no cabeçalho
    dom.docFileName.textContent = file.name;
    dom.modelBadgeBar.style.display = 'flex';

    // Carrega no motor inteligente
    const { totalPages: pages, detectedModel } = await pdfEngine.loadDocument(file);
    totalPages = pages;
    currentPage = 1;

    // Atualiza o crachá do modelo
    updateModelBadge(detectedModel);

    // Alterna visualização para a tela de leitura
    dom.emptyStateSection.style.display = 'none';
    dom.readerSection.style.display = 'block';
    dom.audioPlayerBar.style.display = 'block';

    dom.lblTotalPages.textContent = totalPages;
    dom.lblCurrentPage.textContent = currentPage;

    await loadAndDisplayPage(currentPage);
    showToast(`PDF carregado: ${totalPages} página(s)`, '📖');
  } catch (err) {
    console.error('[Error Loading PDF]', err);
    showToast('Erro ao carregar o arquivo PDF. Tente outro arquivo.', '❌');
  }
}

function updateModelBadge(model) {
  dom.modelBadge.className = 'badge-tag';
  if (model === 'scanned') {
    dom.modelBadge.classList.add('badge-scanned');
    dom.modelBadgeText.textContent = 'Escaneado (OCR Ativo)';
  } else if (model === 'multi-column') {
    dom.modelBadge.classList.add('badge-column');
    dom.modelBadgeText.textContent = 'Multi-Coluna (Artigo)';
  } else {
    dom.modelBadge.classList.add('badge-digital');
    dom.modelBadgeText.textContent = 'Texto Digital Nativo';
  }
}

/* ==========================================================================
   3. PROCESSAMENTO E EXIBIÇÃO DE PÁGINAS
   ========================================================================== */
async function loadAndDisplayPage(pageNum) {
  // Para a fala da página anterior
  ttsEngine.stop();

  dom.lblCurrentPage.textContent = pageNum;
  dom.textContentContainer.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-secondary);"><span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span> Extraindo conteúdo da página...</div>';

  // Renderiza Canvas visual em background
  const canvasPromise = pdfEngine.renderPageToCanvas(pageNum, dom.pdfCanvas);

  // Extrai texto adaptado ao modelo da página
  const pageResult = await pdfEngine.extractPageText(pageNum, dom.pdfCanvas, (progress) => {
    dom.textContentContainer.innerHTML = `<div style="text-align: center; padding: 30px;">Processando OCR com IA... ${progress}%</div>`;
  });

  await canvasPromise;

  // Carrega texto no TTS
  currentSentences = ttsEngine.loadText(pageResult.text);

  // Renderiza sentenças interativas para o modo leitor
  renderInteractiveSentences(currentSentences);

  // Atualiza controles de navegação
  dom.btnPrevPage.disabled = (pageNum <= 1);
  dom.btnNextPage.disabled = (pageNum >= totalPages);
  
  // Atualiza o player
  updatePlayerUI();
}

function renderInteractiveSentences(sentences) {
  dom.textContentContainer.innerHTML = '';

  if (!sentences || sentences.length === 0) {
    dom.textContentContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
        Nenhum texto detectado nesta página. Se for uma imagem manuscrita, use o botão de OCR nas opções.
      </div>`;
    return;
  }

  sentences.forEach((sentence, idx) => {
    const span = document.createElement('span');
    span.className = 'sentence-block';
    span.id = `sentence-${idx}`;
    span.textContent = sentence + ' ';
    
    // Tocar na frase para ouvir diretamente
    span.addEventListener('click', () => {
      ttsEngine.playFromIndex(idx);
    });

    dom.textContentContainer.appendChild(span);
  });
}

/* ==========================================================================
   4. MOTOR DE ÁUDIO TTS E CONTROLES
   ========================================================================== */
function initAudioControls() {
  // Play / Pause
  dom.btnTtsPlayPause.addEventListener('click', () => {
    if (ttsEngine.isPlaying) {
      ttsEngine.pause();
    } else {
      ttsEngine.play();
    }
  });

  // Próximo / Anterior
  dom.btnTtsNext.addEventListener('click', () => ttsEngine.next());
  dom.btnTtsPrev.addEventListener('click', () => ttsEngine.previous());

  // Controle de velocidade da voz (0.75x a 2.0x)
  dom.btnSpeedToggle.addEventListener('click', () => {
    currentSpeedIndex = (currentSpeedIndex + 1) % speedOptions.length;
    const speed = speedOptions[currentSpeedIndex];
    dom.btnSpeedToggle.textContent = `${speed}x`;
    ttsEngine.setRate(speed);
    showToast(`Velocidade de leitura: ${speed}x`, '⚡');
  });

  // Clique na barra de progresso do áudio para saltar
  dom.audioProgressTrack.addEventListener('click', (e) => {
    if (currentSentences.length === 0) return;
    const rect = dom.audioProgressTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetIdx = Math.floor(ratio * currentSentences.length);
    ttsEngine.playFromIndex(targetIdx);
  });

  // Callbacks do TTS Engine
  ttsEngine.onStateChange = (state) => {
    updatePlayerUI(state);
  };

  ttsEngine.onSentenceChange = (index, sentenceText) => {
    // Remove destaque anterior
    document.querySelectorAll('.sentence-block.active-sentence').forEach(el => {
      el.classList.remove('active-sentence');
    });

    // Destaca nova sentença
    const activeEl = document.getElementById(`sentence-${index}`);
    if (activeEl) {
      activeEl.classList.add('active-sentence');
      // Scroll suave mantendo a leitura no centro da visão
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Atualiza progresso da barra
    const progress = ((index + 1) / Math.max(1, currentSentences.length)) * 100;
    dom.audioProgressFill.style.width = `${progress}%`;
    dom.playerStatusText.textContent = sentenceText.slice(0, 35) + '...';
    dom.playerSentenceCounter.textContent = `Frase ${index + 1} de ${currentSentences.length}`;
  };

  // Se a página atual terminar de falar, passa para a próxima página automaticamente!
  ttsEngine.onComplete = () => {
    if (currentPage < totalPages) {
      showToast(`Avançando para a página ${currentPage + 1}...`, '⏭️');
      currentPage++;
      loadAndDisplayPage(currentPage).then(() => {
        ttsEngine.play();
      });
    } else {
      showToast('Leitura do documento concluída!', '🎉');
      ttsEngine.stop();
    }
  };
}

function updatePlayerUI(state = null) {
  const isPlaying = state ? state.isPlaying : ttsEngine.isPlaying;
  if (isPlaying) {
    dom.iconPlay.style.display = 'none';
    dom.iconPause.style.display = 'block';
  } else {
    dom.iconPlay.style.display = 'block';
    dom.iconPause.style.display = 'none';
  }
}

/* ==========================================================================
   5. NAVEGAÇÃO DE PÁGINAS E ABAS
   ========================================================================== */
function initNavigation() {
  dom.btnPrevPage.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadAndDisplayPage(currentPage);
    }
  });

  dom.btnNextPage.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadAndDisplayPage(currentPage);
    }
  });

  // Alternância de Abas (Modo Leitor vs Modo Original)
  dom.tabReader.addEventListener('click', () => {
    dom.tabReader.classList.add('active');
    dom.tabCanvas.classList.remove('active');
    dom.readerTextView.style.display = 'block';
    dom.readerCanvasView.style.display = 'none';
  });

  dom.tabCanvas.addEventListener('click', () => {
    dom.tabCanvas.classList.add('active');
    dom.tabReader.classList.remove('active');
    dom.readerTextView.style.display = 'none';
    dom.readerCanvasView.style.display = 'flex';
  });
}

/* ==========================================================================
   6. CONFIGURAÇÕES, VOZES E TEMAS
   ========================================================================== */
function initSettings() {
  dom.btnOpenSettings.addEventListener('click', () => {
    populateVoiceSelect();
    dom.settingsModal.classList.add('show');
  });

  dom.btnCloseSettings.addEventListener('click', () => {
    dom.settingsModal.classList.remove('show');
  });

  dom.selectVoice.addEventListener('change', (e) => {
    ttsEngine.setVoice(e.target.value);
    showToast('Voz alterada!', '🎙️');
  });

  // Temas (Escuro, Claro, Sépia)
  dom.themeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      dom.themeChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const theme = chip.dataset.theme;
      applyTheme(theme);
    });
  });

  // Carrega tema salvo
  const savedTheme = localStorage.getItem('pdf_voz_theme') || 'dark';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.body.className = '';
  if (theme === 'light') document.body.classList.add('theme-light');
  if (theme === 'sepia') document.body.classList.add('theme-sepia');
  localStorage.setItem('pdf_voz_theme', theme);

  dom.themeChips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.theme === theme);
  });
}

function populateVoiceSelect() {
  const voices = ttsEngine.getVoices();
  dom.selectVoice.innerHTML = '';

  if (voices.length === 0) {
    dom.selectVoice.innerHTML = '<option value="">Voz padrão do Android</option>';
    return;
  }

  voices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})`;
    if (ttsEngine.selectedVoice && ttsEngine.selectedVoice.voiceURI === voice.voiceURI) {
      option.selected = true;
    }
    dom.selectVoice.appendChild(option);
  });
}

/* ==========================================================================
   7. UTILITÁRIOS (TOAST)
   ========================================================================== */
let toastTimeout = null;
function showToast(message, icon = '✨') {
  dom.toastIcon.textContent = icon;
  dom.toastMessage.textContent = message;
  dom.toastNotice.classList.add('show');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    dom.toastNotice.classList.remove('show');
  }, 2800);
}

/* ==========================================================================
   INICIALIZAÇÃO DO APP
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initPWA();
  initFileHandlers();
  initAudioControls();
  initNavigation();
  initSettings();
});
