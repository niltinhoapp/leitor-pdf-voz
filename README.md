# PDF Voz Pro - Leitor de PDF Inteligente com Voz (PWA Nativo Android)

Aplicativo PWA (Progressive Web App) desenvolvido especificamente para celulares **Android** com interface nativa, motor de leitura por voz (Text-to-Speech), detecção automática do modelo de PDF e suporte a documentos escaneados via OCR.

---

## 🚀 Principais Funcionalidades

### 1. Instalação Automática no Android (PWA)
- **1-Clique no Android**: Ao abrir no Google Chrome em qualquer celular Android, o evento `beforeinstallprompt` é interceptado imediatamente e um modal *Bottom Sheet* nativo é aberto sugerindo a instalação.
- **Experiência Nativa**: Funciona em tela cheia (`display: standalone`), sem a barra de URL do navegador.
- **Web Share Target**: Integrado ao sistema de compartilhamento do Android. Você pode clicar em "Compartilhar" em qualquer PDF no WhatsApp ou gerenciador de arquivos e enviá-lo direto para o app!

### 2. Leitor de Áudio Inteligente (Text-to-Speech)
- **Modo Karaokê**: Destaque em tempo real da frase e palavra sendo narradas.
- **Anti-Corte para Android**: Elimina a limitação nativa do Chrome Mobile (que silenciava a voz após 15 segundos) através de um algoritmo inteligente de segmentação por sentenças (*chunking*).
- **Controles Completos**: Play, Pause, Avançar/Retroceder frase, Seletor de Velocidade (0.75x, 1.0x, 1.25x, 1.5x, 2.0x) e troca de voz neural do sistema (Google Português do Brasil).
- **Leitura Contínua**: Ao terminar a última frase de uma página, avança automaticamente para a próxima página e continua narrando.

### 3. Detector Inteligente de Modelos de PDF
O app não lê os arquivos de forma cega; ele classifica a estrutura geométrica do PDF:
1. **Texto Digital Padrão (Verde)**: Extração vetorial instantânea com ordenação natural de parágrafos.
2. **Multi-Coluna / Artigos & Jornais (Roxo)**: Identifica artigos de duas ou mais colunas pelas coordenadas `(x, y)` e lê primeiro a coluna esquerda por completo antes de pular para a coluna direita (evitando a mistura de linhas).
3. **Escaneado / Baseado em Imagem (Amarelo)**: Se a página tiver menos de 20 caracteres vetoriais, o app detecta que é uma foto/digitalização e ativa automaticamente o **OCR inteligente (Tesseract.js)** em Web Worker.

### 4. 100% Offline (Service Worker)
- Todo o código, ícones e motor de PDF são armazenados em cache local via `sw.js`. Uma vez aberto pela primeira vez, funciona sem internet em modo avião ou viagens.

---

## 🛠️ Como Executar Localmente

Você pode iniciar um servidor estático simples com Python ou Node.js:

```powershell
# Com Python:
python -m http.server 8080

# Ou com Node.js (npx serve):
npx serve .
```

Acesse no navegador do celular ou computador: `http://localhost:8080`.

> **Nota para PWA no Android**: Os navegadores modernos (Google Chrome) exigem **HTTPS** (ou `localhost`) para permitir a instalação como PWA. Ao subir para produção no **GitHub Pages**, **Vercel**, **Firebase Hosting** ou **Netlify**, o HTTPS já vem ativado por padrão!
