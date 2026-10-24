/**
 * TTSEngine - Motor de Leitura em Voz Alta (Text-to-Speech)
 * Otimizado para Chrome Mobile no Android com anti-corte e suporte a Karaokê
 */
export class TTSEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = [];
    this.selectedVoice = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    
    // Fila e estado
    this.sentences = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentUtterance = null;
    
    // Callbacks
    this.onStateChange = null;
    this.onSentenceChange = null;
    this.onWordBoundary = null;
    this.onComplete = null;

    this.initVoices();
  }

  initVoices() {
    if (!this.synth) return;

    const loadVoices = () => {
      this.voices = this.synth.getVoices();
      if (!this.selectedVoice && this.voices.length > 0) {
        // Prioriza vozes em Português do Brasil (pt-BR) nativas do Google/Android
        const ptBr = this.voices.find(v => v.lang === 'pt-BR' || v.lang.startsWith('pt_BR'));
        const ptAny = this.voices.find(v => v.lang.startsWith('pt'));
        this.selectedVoice = ptBr || ptAny || this.voices[0];
      }
    };

    loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = loadVoices;
    }
  }

  getVoices() {
    return this.voices;
  }

  setVoice(voiceUri) {
    const found = this.voices.find(v => v.voiceURI === voiceUri);
    if (found) {
      this.selectedVoice = found;
      // Se estiver tocando, reinicia com a nova voz mantendo a posição
      if (this.isPlaying && !this.isPaused) {
        const resumeIdx = this.currentIndex;
        this.stop();
        this.playFromIndex(resumeIdx);
      }
    }
  }

  setRate(newRate) {
    this.rate = Math.max(0.5, Math.min(2.5, newRate));
    if (this.isPlaying && !this.isPaused) {
      const resumeIdx = this.currentIndex;
      this.synth.cancel();
      this.playSentence(resumeIdx);
    }
  }

  /**
   * Divide o texto em sentenças lógicas e limpas
   * Remove ruídos como números de página soltos, quebras anômalas
   */
  loadText(rawText) {
    this.stop();
    this.sentences = this.cleanAndSegmentText(rawText);
    this.currentIndex = 0;
    return this.sentences;
  }

  cleanAndSegmentText(text) {
    if (!text) return [];

    // 1. Limpeza de ruídos de cabeçalho/rodapé e hifenação
    let cleaned = text
      // Junta palavras separadas por hífen no final de linha ("cons- \n truir" -> "construir")
      .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2')
      // Remove quebras de linha duras dentro de frases
      .replace(/([^\n\.\?!])\n([^\n])/g, '$1 $2')
      // Remove números de página isolados (ex: " \n 12 \n ")
      .replace(/\n\s*\d+\s*\n/g, '\n')
      // Remove múltiplos espaços
      .replace(/[ \t]+/g, ' ')
      .trim();

    // 2. Segmentação inteligente por pontuação (. ! ? ; e quebras duplas)
    const rawSegments = cleaned.split(/(?<=[\.\?!;])\s+|\n{2,}/);
    const finalSentences = [];

    for (let segment of rawSegments) {
      let trimmed = segment.trim();
      if (!trimmed) continue;

      // Se a sentença for muito longa (> 220 caracteres), divide por vírgulas para evitar corte do Chrome Mobile
      if (trimmed.length > 220) {
        const subParts = trimmed.split(/(?<=,)\s+/);
        let acc = '';
        for (let sub of subParts) {
          if ((acc + ' ' + sub).length < 200) {
            acc = acc ? (acc + ' ' + sub) : sub;
          } else {
            if (acc) finalSentences.push(acc.trim());
            acc = sub;
          }
        }
        if (acc) finalSentences.push(acc.trim());
      } else {
        finalSentences.push(trimmed);
      }
    }

    return finalSentences;
  }

  play() {
    if (this.sentences.length === 0) return;

    if (this.isPaused) {
      this.isPaused = false;
      this.isPlaying = true;
      this.notifyState();
      this.playSentence(this.currentIndex);
      return;
    }

    this.isPlaying = true;
    this.isPaused = false;
    this.notifyState();
    this.playSentence(this.currentIndex);
  }

  playFromIndex(index) {
    if (index >= 0 && index < this.sentences.length) {
      this.currentIndex = index;
      this.isPlaying = true;
      this.isPaused = false;
      this.notifyState();
      this.playSentence(this.currentIndex);
    }
  }

  playSentence(index) {
    if (!this.isPlaying || index >= this.sentences.length) {
      this.isPlaying = false;
      this.isPaused = false;
      this.notifyState();
      if (this.onComplete) this.onComplete();
      return;
    }

    this.currentIndex = index;
    const sentence = this.sentences[index];
    if (this.onSentenceChange) {
      this.onSentenceChange(index, sentence);
    }

    // Cancela fala anterior com segurança
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.voice = this.selectedVoice;
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.lang = this.selectedVoice ? this.selectedVoice.lang : 'pt-BR';

    // Suporte a destaque de palavras (Karaokê)
    utterance.onboundary = (event) => {
      if (event.name === 'word' && this.onWordBoundary) {
        this.onWordBoundary(event.charIndex, event.charLength || 0, sentence);
      }
    };

    utterance.onend = () => {
      if (this.isPlaying && !this.isPaused) {
        // Pequena pausa natural de respiração entre frases
        setTimeout(() => {
          this.playSentence(this.currentIndex + 1);
        }, 120);
      }
    };

    utterance.onerror = (e) => {
      // Ignora erro por cancelamento manual
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.warn('[TTS Error]', e);
      if (this.isPlaying && !this.isPaused) {
        this.playSentence(this.currentIndex + 1);
      }
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.isPaused = true;
    this.synth.cancel(); // No Chrome Mobile, cancelar e salvar índice é mais confiável que synth.pause()
    this.notifyState();
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentIndex = 0;
    if (this.synth) this.synth.cancel();
    this.notifyState();
  }

  next() {
    if (this.currentIndex + 1 < this.sentences.length) {
      this.playFromIndex(this.currentIndex + 1);
    }
  }

  previous() {
    if (this.currentIndex - 1 >= 0) {
      this.playFromIndex(this.currentIndex - 1);
    }
  }

  notifyState() {
    if (this.onStateChange) {
      this.onStateChange({
        isPlaying: this.isPlaying,
        isPaused: this.isPaused,
        currentIndex: this.currentIndex,
        totalSentences: this.sentences.length
      });
    }
  }
}
