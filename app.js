import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const STORAGE_KEY = "engineOilViscosityCounter.v7";
const PRODUCT_DICTIONARY_KEY = "engineOilProductDictionary.v7";
const $ = (selector) => document.querySelector(selector);

const state = {
  files: [],
  rows: [],
  rawText: "",
  isProcessing: false,
  worker: null,
};

const els = {
  fileInput: $("#fileInput"),
  dropZone: $("#dropZone"),
  fileList: $("#fileList"),
  analyzeButton: $("#analyzeButton"),
  clearFilesButton: $("#clearFilesButton"),
  loadSavedButton: $("#loadSavedButton"),
  progressArea: $("#progressArea"),
  progressLabel: $("#progressLabel"),
  progressPercent: $("#progressPercent"),
  progressBar: $("#progressBar"),
  progressDetail: $("#progressDetail"),
  messageBox: $("#messageBox"),
  resultsSection: $("#resultsSection"),
  totalQuantityKpi: $("#totalQuantityKpi"),
  viscosityCountKpi: $("#viscosityCountKpi"),
  productCountKpi: $("#productCountKpi"),
  unknownCountKpi: $("#unknownCountKpi"),
  searchInput: $("#searchInput"),
  viscosityFilter: $("#viscosityFilter"),
  sortSelect: $("#sortSelect"),
  summaryContainer: $("#summaryContainer"),
  detailTableBody: $("#detailTableBody"),
  ocrTextArea: $("#ocrTextArea"),
  reparseButton: $("#reparseButton"),
  addRowButton: $("#addRowButton"),
  exportSummaryButton: $("#exportSummaryButton"),
  exportDetailButton: $("#exportDetailButton"),
  exportJsonButton: $("#exportJsonButton"),
  saveButton: $("#saveButton"),
  resetButton: $("#resetButton"),
  ocrScaleInput: $("#ocrScaleInput"),
  quantityXInput: $("#quantityXInput"),
  quantityToleranceInput: $("#quantityToleranceInput"),
  productNameEndInput: $("#productNameEndInput"),
  rowToleranceInput: $("#rowToleranceInput"),
  includeBulkInput: $("#includeBulkInput"),
};

injectReadableSummaryStyles();
bindEvents();
renderFiles();
setButtons();


function injectReadableSummaryStyles() {
  if (document.querySelector("#readableOilSummaryStyle")) return;

  const style = document.createElement("style");
  style.id = "readableOilSummaryStyle";
  style.textContent = `
    .oil-summary-card {
      border: 2px solid #f0d1bc;
      box-shadow: 0 10px 24px rgba(32, 38, 45, 0.08);
    }

    .oil-summary-head {
      grid-template-columns: minmax(150px, 0.75fr) minmax(260px, 1.4fr) auto !important;
      background: linear-gradient(90deg, #fffaf6 0%, #ffffff 58%, #fff4ec 100%);
    }

    .oil-viscosity-main {
      display: grid;
      gap: 2px;
    }

    .oil-viscosity-label,
    .oil-top-label {
      color: var(--muted);
      font-size: 0.76rem;
      font-weight: 900;
      letter-spacing: 0.08em;
    }

    .oil-viscosity-name {
      font-size: 1.85rem !important;
      line-height: 1.05;
    }

    .oil-product-count {
      font-weight: 800;
    }

    .oil-top-product {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .oil-top-product strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 1rem;
    }

    .oil-total-box {
      min-width: 145px;
      padding: 10px 14px;
      border-radius: 14px;
      background: var(--orange);
      color: #fff;
      text-align: center !important;
      box-shadow: 0 6px 16px rgba(232, 93, 4, 0.22);
    }

    .oil-total-box span,
    .oil-total-box strong {
      color: #fff !important;
    }

    .oil-total-box strong {
      font-size: 1.7rem !important;
      line-height: 1.1;
    }

    .oil-list-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 130px;
      gap: 14px;
      padding: 9px 19px;
      color: var(--muted);
      background: #f7f8fa;
      border-bottom: 1px solid var(--line);
      font-size: 0.78rem;
      font-weight: 900;
      letter-spacing: 0.08em;
    }

    .oil-list-header span:last-child {
      text-align: right;
    }

    .oil-product-row {
      grid-template-columns: minmax(0, 1fr) 130px !important;
      padding: 15px 19px !important;
      background: #fff;
    }

    .oil-product-row:nth-child(even) {
      background: #fffdfb;
    }

    .oil-product-main {
      min-width: 0;
      display: grid;
      gap: 5px;
    }

    .oil-product-name {
      font-size: 1.08rem;
      font-weight: 900 !important;
      line-height: 1.35;
      color: var(--ink);
      word-break: break-word;
    }

    .oil-product-sub {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      color: var(--muted);
      font-size: 0.8rem;
    }

    .oil-product-sub span {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 2px 8px;
      border-radius: 999px;
      background: #f1f3f5;
    }

    .oil-qty-badge {
      justify-self: end;
      min-width: 108px;
      padding: 8px 10px;
      border-radius: 13px;
      background: var(--orange-soft);
      color: var(--orange-dark);
      text-align: center !important;
      border: 1px solid #ffd1ad;
    }

    .oil-qty-badge strong {
      display: inline;
      font-size: 1.45rem;
      line-height: 1;
    }

    .oil-qty-badge span {
      margin-left: 3px;
      font-size: 0.9rem;
      font-weight: 900;
    }


    .oil-summary-head-simple {
      grid-template-columns: minmax(160px, 1fr) auto !important;
    }

    .oil-total-box-wide {
      min-width: 180px;
    }

    @media (max-width: 720px) {
      .oil-summary-head {
        grid-template-columns: 1fr !important;
      }

      .oil-total-box {
        width: 100%;
      }

      .oil-top-product strong {
        white-space: normal;
      }

      .oil-list-header {
        grid-template-columns: 1fr 96px;
      }

      .oil-product-row {
        grid-template-columns: minmax(0, 1fr) 96px !important;
      }

      .oil-product-name {
        font-size: 1rem;
      }

      .oil-qty-badge {
        min-width: 86px;
      }

      .oil-qty-badge strong {
        font-size: 1.25rem;
      }
    }
  `;
  document.head.appendChild(style);
}

function bindEvents() {
  els.fileInput.addEventListener("change", (event) => {
    addFiles([...event.target.files]);
    event.target.value = "";
  });

  ["dragenter", "dragover"].forEach((type) => {
    els.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    els.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("dragover");
    });
  });

  els.dropZone.addEventListener("drop", (event) => {
    addFiles([...event.dataTransfer.files]);
  });

  els.analyzeButton.addEventListener("click", analyzeFiles);
  els.clearFilesButton.addEventListener("click", clearFiles);
  els.loadSavedButton.addEventListener("click", loadSavedData);
  els.saveButton.addEventListener("click", () => saveData(true));
  els.resetButton.addEventListener("click", resetAllData);
  els.searchInput.addEventListener("input", renderAll);
  els.viscosityFilter.addEventListener("change", renderAll);
  els.sortSelect.addEventListener("change", renderAll);
  els.includeBulkInput.addEventListener("change", renderAll);
  els.reparseButton.addEventListener("click", reparseRawText);
  els.addRowButton.addEventListener("click", addBlankRow);
  els.exportSummaryButton.addEventListener("click", exportSummaryCsv);
  els.exportDetailButton.addEventListener("click", exportDetailCsv);
  els.exportJsonButton.addEventListener("click", exportJson);

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });
}

function addFiles(files) {
  const accepted = files.filter((file) =>
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf") ||
    file.type.startsWith("image/")
  );

  const existing = new Set(state.files.map((file) => `${file.name}-${file.size}`));
  accepted.forEach((file) => {
    const key = `${file.name}-${file.size}`;
    if (!existing.has(key)) {
      state.files.push(file);
      existing.add(key);
    }
  });

  if (accepted.length !== files.length) {
    showMessage("PDFまたは画像ファイルだけを選択してください。", true);
  } else {
    hideMessage();
  }

  renderFiles();
  setButtons();
}

function clearFiles() {
  if (state.isProcessing) return;
  state.files = [];
  renderFiles();
  setButtons();
}

function renderFiles() {
  els.fileList.innerHTML = "";
  state.files.forEach((file) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    chip.innerHTML = `<span>${escapeHtml(file.name)}</span><span>${formatFileSize(file.size)}</span>`;
    els.fileList.appendChild(chip);
  });
}

function setButtons() {
  els.analyzeButton.disabled = state.files.length === 0 || state.isProcessing;
  els.clearFilesButton.disabled = state.files.length === 0 || state.isProcessing;
}

async function analyzeFiles() {
  if (state.files.length === 0 || state.isProcessing) return;

  state.isProcessing = true;
  setButtons();
  hideMessage();
  showProgress("読み取りを準備しています", 0, "PDFを解析しています。");

  const newRows = [];
  const rawChunks = [];
  let totalPages = 0;
  let completedPages = 0;

  try {
    // 重要：再読み取り時に前回の誤読データを加算しない。
    state.rows = [];
    state.rawText = "";
    localStorage.removeItem(STORAGE_KEY);

    for (const file of state.files) {
      totalPages += await countPages(file);
    }

    for (const file of state.files) {
      const result = isPdf(file)
        ? await processPdf(file, completedPages, totalPages)
        : await processImage(file, completedPages, totalPages);

      newRows.push(...result.rows);
      rawChunks.push(result.rawText);
      completedPages += result.pageCount;
    }

    const dictionary = getProductDictionary();
    state.rows = mergeExactDuplicateRows(newRows.map((row) => applyDictionary(row, dictionary)));
    state.rawText = rawChunks.filter(Boolean).join("\n\n");

    showProgress("集計が完了しました", 100, `${state.rows.length}行を読み取りました。`);
    els.resultsSection.classList.remove("hidden");
    renderAll();
    saveData(false);

    if (state.rows.length === 0) {
      showMessage("商品行を抽出できませんでした。OCR原文タブまたは読み取り設定を確認してください。", true);
      activateTab("ocr");
    } else {
      showMessage(`${state.rows.length}件の商品行を読み取りました。数量は金額列を使わず、売上数量列だけを採用しています。`);
    }
  } catch (error) {
    console.error(error);
    showMessage(`読み取り中にエラーが発生しました：${error.message}`, true);
  } finally {
    state.isProcessing = false;
    setButtons();
  }
}

async function countPages(file) {
  if (!isPdf(file)) return 1;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  return pdf.numPages;
}

async function processPdf(file, completedPages, totalPages) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  const rows = [];
  const rawParts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    showProgress(
      "ページを解析しています",
      ((completedPages + pageNumber - 1) / Math.max(totalPages, 1)) * 100,
      `${file.name}：${pageNumber} / ${pdf.numPages}ページ`
    );

    const page = await pdf.getPage(pageNumber);
    const textResult = await parsePdfTextPage(page, file.name, pageNumber);

    if (textResult.text.trim()) {
      rawParts.push(`===== ${file.name} / ${pageNumber}ページ：PDFテキスト =====\n${textResult.text}`);
    }

    if (textResult.rows.length > 0) {
      rows.push(...textResult.rows);
      page.cleanup?.();
      continue;
    }

    const canvas = await renderPageToCanvas(page);
    const ocrResult = await recognizeCanvas(canvas, file.name, pageNumber);
    rawParts.push(ocrResult.rawText);
    rows.push(...ocrResult.rows);
    page.cleanup?.();
  }

  return {
    rows,
    rawText: rawParts.join("\n\n"),
    pageCount: pdf.numPages,
  };
}

async function processImage(file, completedPages, totalPages) {
  showProgress(
    "画像を解析しています",
    (completedPages / Math.max(totalPages, 1)) * 100,
    file.name
  );

  const canvas = await imageFileToCanvas(file);
  const result = await recognizeCanvas(canvas, file.name, 1);

  return {
    rows: result.rows,
    rawText: result.rawText,
    pageCount: 1,
  };
}

async function parsePdfTextPage(page, sourceFile, pageNumber) {
  let content;
  try {
    content = await page.getTextContent({ normalizeWhitespace: true });
  } catch {
    return { rows: [], text: "" };
  }

  if (!content?.items?.length) return { rows: [], text: "" };

  const items = content.items
    .map((item) => ({
      text: String(item.str || "").trim(),
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
    }))
    .filter((item) => item.text);

  if (items.length === 0) return { rows: [], text: "" };

  const rowsByY = [];
  const tolerance = 3.5;

  items.sort((a, b) => b.y - a.y || a.x - b.x).forEach((item) => {
    let row = rowsByY.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (!row) {
      row = { y: item.y, items: [] };
      rowsByY.push(row);
    }
    row.items.push(item);
    row.y = row.items.reduce((sum, current) => sum + current.y, 0) / row.items.length;
  });

  const lines = rowsByY
    .sort((a, b) => b.y - a.y)
    .map((row) => row.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "))
    .filter(Boolean);

  const text = lines.join("\n");
  return { rows: parseTextRows(text, sourceFile, pageNumber), text };
}

async function recognizeCanvas(canvas, sourceFile, pageNumber) {
  const processed = preprocessCanvas(canvas);
  const worker = await getOcrWorker((message) => {
    if (message.status === "recognizing text") {
      const progress = Number.isFinite(message.progress) ? message.progress : 0;
      showProgress("OCRで文字を読み取っています", progress * 100, `${sourceFile}：${pageNumber}ページ`);
    }
  });

  const result = await worker.recognize(processed, {}, { text: true, tsv: true });
  const text = result.data.text || "";
  const tsv = result.data.tsv || "";

  const positionalRows = parseTsvRows(tsv, processed.width, processed.height, sourceFile, pageNumber);
  const textRows = parseTextRows(text, sourceFile, pageNumber);

  // 座標付きTSVを優先。ただしTSVで数量列を拾えないページは、
  // OCR原文から「末尾の数値列 = 単価 → 数量 → 金額」として安全に復旧する。
  // 金額が 44 396 のように分割されても、数量は単価の次の数字だけを使う。
  const rows = positionalRows.length >= Math.max(2, textRows.length * 0.45)
    ? positionalRows
    : textRows;

  return {
    rows,
    rawText: `===== ${sourceFile} / ${pageNumber}ページ：OCR原文 =====\n${text}`,
  };
}

async function getOcrWorker(logger) {
  if (state.worker) return state.worker;

  if (!window.Tesseract) {
    throw new Error("Tesseract.jsを読み込めませんでした。通信環境を確認してください。");
  }

  const oem = window.Tesseract.OEM?.LSTM_ONLY ?? 1;
  state.worker = await window.Tesseract.createWorker("jpn+eng", oem, {
    logger,
    errorHandler: (error) => console.error("Tesseract error:", error),
  });

  await state.worker.setParameters({
    tessedit_pageseg_mode: String(window.Tesseract.PSM?.SINGLE_BLOCK ?? 6),
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });

  return state.worker;
}

async function renderPageToCanvas(page) {
  const scale = clamp(Number(els.ocrScaleInput.value), 1.5, 3.5, 2.3);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({
    canvasContext: context,
    viewport,
    background: "white",
  }).promise;

  return canvas;
}

function preprocessCanvas(sourceCanvas) {
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(sourceCanvas, 0, 0);

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    const value = gray > 242 ? 255 : Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

async function imageFileToCanvas(file) {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 2600;
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const canvas = document.createElement("canvas");

  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return canvas;
}

function parseTsvRows(tsv, width, height, sourceFile, pageNumber) {
  if (!tsv.trim()) return [];

  const words = tsv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((columns) => columns.length >= 12)
    .map((columns) => ({
      level: Number(columns[0]),
      left: Number(columns[6]),
      top: Number(columns[7]),
      width: Number(columns[8]),
      height: Number(columns[9]),
      confidence: Number(columns[10]),
      text: columns.slice(11).join("\t").trim(),
    }))
    .filter((word) =>
      word.level === 5 &&
      word.text &&
      Number.isFinite(word.left) &&
      Number.isFinite(word.top) &&
      word.confidence > -1
    )
    .map((word) => ({
      ...word,
      right: word.left + word.width,
      centerX: word.left + word.width / 2,
      centerY: word.top + word.height / 2,
    }))
    .sort((a, b) => a.centerY - b.centerY || a.left - b.left);

  const rowTolerance = height * (clamp(Number(els.rowToleranceInput.value), 0.3, 2.0, 0.9) / 100);
  const clusters = [];

  for (const word of words) {
    let cluster = clusters.find((candidate) => Math.abs(candidate.centerY - word.centerY) <= rowTolerance);
    if (!cluster) {
      cluster = { centerY: word.centerY, words: [] };
      clusters.push(cluster);
    }
    cluster.words.push(word);
    cluster.centerY = cluster.words.reduce((sum, item) => sum + item.centerY, 0) / cluster.words.length;
  }

  const rows = [];

  for (const cluster of clusters) {
    const lineWords = [...cluster.words].sort((a, b) => a.left - b.left);
    const codeIndex = lineWords.findIndex((word) => {
      const code = normalizeProductCode(word.text);
      const xRatio = word.centerX / width;
      return code.length === 8 && xRatio >= 0.25 && xRatio <= 0.62;
    });

    if (codeIndex < 0) continue;

    const codeWord = lineWords[codeIndex];
    const productCode = normalizeProductCode(codeWord.text);
    const quantityToken = pickSalesQuantityToken(lineWords, width);

    if (!quantityToken) {
      continue;
    }

    const quantity = parseInteger(quantityToken.text);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 100000) continue;

    const rightNumbers = getRightNumberTokens(lineWords, width);
    const firstRightNumberX = rightNumbers.length ? Math.min(...rightNumbers.map((word) => word.left)) : width * 0.78;
    const productNameEnd = Math.min(
      width * (clamp(Number(els.productNameEndInput.value), 65, 85, 78.5) / 100),
      firstRightNumberX - 5
    );

    const productName = cleanProductName(
      lineWords
        .filter((word) =>
          word.left > codeWord.left + codeWord.width * 0.6 &&
          word.centerX < productNameEnd
        )
        .map((word) => word.text)
        .join(" ")
    );

    if (!productName || productName.length < 3) continue;

    rows.push(makeRow({
      sourceFile,
      pageNumber,
      productCode,
      productName,
      viscosity: detectViscosity(productName),
      quantity,
    }));
  }

  return dedupePageRows(rows);
}

function getRightNumberTokens(lineWords, width) {
  return lineWords
    .filter((word) => word.centerX > width * 0.70 && isIntegerToken(word.text))
    .sort((a, b) => a.centerX - b.centerX);
}

function pickSalesQuantityToken(lineWords, width) {
  const rightNumbers = getRightNumberTokens(lineWords, width);
  if (rightNumbers.length === 0) return null;

  // 帳票の右側3列:
  // 1) 売価単価: おおむね 78〜84%
  // 2) 売上数量: おおむね 88〜92.5%
  // 3) 売上金額: おおむね 94%以降
  // 金額列の「44,396」が分割されて「44」だけ拾われる事故を避けるため、
  // 売上数量ゾーン外の数字は絶対に採用しない。
  let centerPercent = Number(els.quantityXInput.value);
  if (!Number.isFinite(centerPercent) || centerPercent < 88.0 || centerPercent > 93.0) {
    centerPercent = 90.4;
  }

  let tolerancePercent = Number(els.quantityToleranceInput.value);
  if (!Number.isFinite(tolerancePercent) || tolerancePercent <= 0 || tolerancePercent > 2.2) {
    tolerancePercent = 1.6;
  }

  const centerX = width * (centerPercent / 100);
  const tolerance = width * (tolerancePercent / 100);
  const hardMin = width * 0.875;
  const hardMax = width * 0.935;

  const candidates = rightNumbers
    .filter((word) =>
      word.centerX >= hardMin &&
      word.centerX <= hardMax &&
      Math.abs(word.centerX - centerX) <= tolerance
    )
    .sort((a, b) => Math.abs(a.centerX - centerX) - Math.abs(b.centerX - centerX));

  if (candidates.length === 0) return null;

  // 数量は基本的に小さい整数。金額や単価らしい4桁以上は除外。
  const plausible = candidates.filter((word) => {
    const value = parseInteger(word.text);
    return Number.isFinite(value) && value >= 0 && value <= 999;
  });

  return plausible[0] || null;
}

function parseTextRows(text, sourceFile, pageNumber) {
  const normalized = normalizeOcrText(text)
    .replace(/(\d{8})(?=\S)/g, "$1 ")
    .replace(/(?<!\d)(\d{8})(?=\s)/g, "\n$1 ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (!normalized) return [];

  const chunks = normalized
    .split(/\n(?=\d{8}\s)/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const rows = [];
  chunks.forEach((chunk) => {
    const row = parseTextLine(chunk, sourceFile, pageNumber);
    if (row) rows.push(row);
  });

  return dedupePageRows(rows);
}

function parseTextLine(line, sourceFile, pageNumber) {
  const normalized = normalizeOcrText(line)
    .replace(/(\d),\s+(?=\d)/g, "$1,")
    .replace(/\s+/g, " ")
    .trim();

  const codeMatch = normalized.match(/^(\d{8})\s+(.+)$/);
  if (!codeMatch) return null;

  const productCode = normalizeProductCode(codeMatch[1]);
  if (productCode.length !== 8) return null;

  let rest = codeMatch[2]
    .replace(/\s+\d{8}\s+.*$/, "")
    .trim();

  const numberMatches = [...rest.matchAll(/\d[\d,]*/g)].map((match) => ({
    text: match[0],
    index: match.index ?? 0,
  }));

  if (numberMatches.length < 3) return null;

  // 右端側の数値列から「単価・数量・金額」を拾う。
  // 金額が 44 396 のように分割されても、数量は右端3ブロックの左から2番目を使う。
  const tail = numberMatches.slice(-4);
  let qtyCandidate = null;

  if (tail.length >= 4) {
    const a = parseInteger(tail[0].text);
    const b = parseInteger(tail[1].text);
    const c = parseInteger(tail[2].text);
    const d = parseInteger(tail[3].text);
    if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d)) {
      // [単価, 数量, 金額前半, 金額後半]
      qtyCandidate = b;
    }
  }

  if (!Number.isFinite(qtyCandidate)) {
    const tail3 = numberMatches.slice(-3);
    const a = parseInteger(tail3[0].text);
    const b = parseInteger(tail3[1].text);
    const c = parseInteger(tail3[2].text);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null;
    qtyCandidate = b;
  }

  if (!Number.isFinite(qtyCandidate) || qtyCandidate < 0 || qtyCandidate > 999) return null;

  const productNameEnd = numberMatches[numberMatches.length - Math.min(numberMatches.length, 4)].index;
  const productName = cleanProductName(rest.slice(0, productNameEnd));
  if (!productName || productName.length < 3) return null;

  return makeRow({
    sourceFile,
    pageNumber,
    productCode,
    productName,
    viscosity: detectViscosity(productName),
    quantity: qtyCandidate,
  });
}

function normalizeOcrText(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/\r/g, "")
    .replace(/[‐‑‒–—―−ー]/g, "-")
    .replace(/[ \t]+/g, " ");
}

function normalizeProductCode(value) {
  const digits = String(value || "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL|]/g, "1")
    .replace(/\D/g, "");

  if (digits.length >= 7 && digits.length <= 8) return digits.padStart(8, "0");
  return digits.slice(0, 8);
}

function isIntegerToken(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .replace(/[OＯ]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[,\s]/g, "");
  return /^\d+$/.test(normalized);
}

function parseInteger(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .replace(/[OＯ]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[^\d-]/g, "");
  return Number.parseInt(normalized, 10);
}

function cleanProductName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[‐‑‒–—―−ー]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s:：・.]+|[\s:：・.]+$/g, "")
    .trim();
}

function detectViscosity(productName) {
  const value = String(productName || "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[‐‑‒–—―−ー]/g, "-")
    .replace(/Ｏ/g, "O")
    .replace(/０/g, "0")
    .replace(/\bO(?=\s*W)/g, "0")
    .replace(/(?<=\D)O(?=\s*W)/g, "0")
    .replace(/VV/g, "W");

  const match = value.match(/(?:^|[^0-9])((?:0|5|10|15|20))\s*W\s*-?\s*(8|12|16|20|30|40|50)(?:[^0-9]|$)/);
  return match ? `${Number(match[1])}W-${Number(match[2])}` : "粘度不明";
}

function makeRow(data) {
  const productName = cleanProductName(data.productName || "");
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    sourceFile: data.sourceFile || "手入力",
    pageNumber: Number(data.pageNumber) || 1,
    productCode: normalizeProductCode(data.productCode || ""),
    productName,
    viscosity: data.viscosity || detectViscosity(productName),
    quantity: Math.max(0, Number(data.quantity) || 0),
    category: data.category || detectCategory(productName),
  };
}

function detectCategory(productName) {
  const text = String(productName || "").normalize("NFKC").toUpperCase();
  return /(量り売り|量売り|量売|L迄|Lまで|レデマ|ﾚﾃﾞﾏ)/i.test(text)
    ? "量り売り"
    : "缶商品";
}

function dedupePageRows(rows) {
  const map = new Map();

  rows.forEach((row) => {
    const key = [
      row.sourceFile,
      row.pageNumber,
      row.productCode,
      normalizeCompareText(row.productName),
      row.quantity,
    ].join("|");

    if (!map.has(key)) map.set(key, row);
  });

  return [...map.values()];
}

function mergeExactDuplicateRows(rows) {
  return dedupePageRows(rows);
}

function getProductDictionary() {
  try {
    return JSON.parse(localStorage.getItem(PRODUCT_DICTIONARY_KEY) || "{}");
  } catch {
    return {};
  }
}

function applyDictionary(row, dictionary) {
  const saved = dictionary[row.productCode];
  if (!saved) return row;

  const productName = saved.productName || row.productName;
  return {
    ...row,
    productName,
    viscosity: saved.viscosity || detectViscosity(productName),
    category: saved.category || detectCategory(productName),
  };
}

function rememberProduct(row) {
  if (!row.productCode || row.productCode === "00000000") return;

  const dictionary = getProductDictionary();
  dictionary[row.productCode] = {
    productName: row.productName,
    viscosity: row.viscosity,
    category: row.category,
  };

  localStorage.setItem(PRODUCT_DICTIONARY_KEY, JSON.stringify(dictionary));
}

function renderAll() {
  if (state.rows.length > 0) {
    els.resultsSection.classList.remove("hidden");
  }

  renderKpis();
  renderViscosityFilter();
  renderSummary();
  renderDetailTable();
  els.ocrTextArea.value = state.rawText;
}

function getVisibleRows() {
  const search = normalizeCompareText(els.searchInput.value);
  const viscosity = els.viscosityFilter.value;
  const includeBulk = els.includeBulkInput.checked;

  return state.rows.filter((row) => {
    if (!includeBulk && row.category === "量り売り") return false;
    if (viscosity && row.viscosity !== viscosity) return false;
    if (!search) return true;

    return [row.viscosity, row.productName, row.productCode, row.sourceFile]
      .some((value) => normalizeCompareText(value).includes(search));
  });
}

function renderKpis() {
  const rows = getVisibleRows();
  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const viscosities = new Set(rows.map((row) => row.viscosity));
  const products = new Set(rows.map((row) => `${row.productCode}|${normalizeCompareText(row.productName)}`));
  const unknownQuantity = rows
    .filter((row) => row.viscosity === "粘度不明")
    .reduce((sum, row) => sum + Number(row.quantity || 0), 0);

  els.totalQuantityKpi.textContent = totalQuantity.toLocaleString("ja-JP");
  els.viscosityCountKpi.textContent = viscosities.size.toLocaleString("ja-JP");
  els.productCountKpi.textContent = products.size.toLocaleString("ja-JP");
  els.unknownCountKpi.textContent = unknownQuantity.toLocaleString("ja-JP");
}

function renderViscosityFilter() {
  const current = els.viscosityFilter.value;
  const values = [...new Set(state.rows.map((row) => row.viscosity))]
    .sort(compareViscosity);

  els.viscosityFilter.innerHTML = '<option value="">すべての粘度</option>';

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    els.viscosityFilter.appendChild(option);
  });

  if (values.includes(current)) els.viscosityFilter.value = current;
}

function groupSummary(rows) {
  const viscosityMap = new Map();

  rows.forEach((row) => {
    if (!viscosityMap.has(row.viscosity)) {
      viscosityMap.set(row.viscosity, {
        viscosity: row.viscosity,
        totalQuantity: 0,
        productMap: new Map(),
        products: [],
      });
    }

    const group = viscosityMap.get(row.viscosity);
    group.totalQuantity += Number(row.quantity || 0);

    const productKey = row.productCode && row.productCode !== "00000000"
      ? row.productCode
      : normalizeCompareText(row.productName);

    if (!group.productMap.has(productKey)) {
      group.productMap.set(productKey, {
        productCode: row.productCode,
        productName: row.productName,
        quantity: 0,
        categories: new Set(),
      });
    }

    const product = group.productMap.get(productKey);
    product.quantity += Number(row.quantity || 0);
    product.categories.add(row.category);
  });

  viscosityMap.forEach((group) => {
    group.products = [...group.productMap.values()].map((product) => ({
      ...product,
      unitLabel: product.categories.size === 1 && product.categories.has("量り売り") ? "件" : "缶",
    }));
    delete group.productMap;
  });

  return viscosityMap;
}

function resolveGroupUnit(products) {
  const units = new Set(products.map((product) => product.unitLabel));
  if (units.size === 1) return [...units][0];
  return "点";
}

function cleanDisplayOilName(productName) {
  return String(productName || "")
    .normalize("NFKC")
    .replace(/\\s+/g, " ")
    .replace(/^(MR\\.AUTOBACS|AUTOBACS|Castrol|カストロール|Mobil|モービル|QUAKER STATE|クエーカーステート)\\s*/i, (match) => match.trim() + " ")
    .trim();
}

function shortenOilName(productName) {
  const name = cleanDisplayOilName(productName);
  return name.length > 34 ? `${name.slice(0, 34)}…` : name;
}


function renderSummary() {
  let groups = [...groupSummary(getVisibleRows()).values()];

  if (els.sortSelect.value === "quantity-desc") {
    groups.sort((a, b) => b.totalQuantity - a.totalQuantity || compareViscosity(a.viscosity, b.viscosity));
  } else if (els.sortSelect.value === "product") {
    groups.sort((a, b) => (a.products[0]?.productName || "").localeCompare(b.products[0]?.productName || "", "ja"));
  } else {
    groups.sort((a, b) => compareViscosity(a.viscosity, b.viscosity));
  }

  els.summaryContainer.innerHTML = "";

  if (groups.length === 0) {
    els.summaryContainer.innerHTML = '<div class="empty-state">表示できる集計データがありません。</div>';
    return;
  }

  groups.forEach((group, index) => {
    const details = document.createElement("details");
    details.className = "viscosity-card oil-summary-card";
    details.open = index < 5 || group.viscosity === "粘度不明";

    const products = [...group.products].sort((a, b) =>
      b.quantity - a.quantity || a.productName.localeCompare(b.productName, "ja")
    );

    const totalUnit = resolveGroupUnit(products);

    details.innerHTML = `
      <summary class="oil-summary-head oil-summary-head-simple">
        <div class="oil-viscosity-main">
          <span class="oil-viscosity-label">粘度</span>
          <strong class="viscosity-name oil-viscosity-name">${escapeHtml(group.viscosity)}</strong>
          <span class="viscosity-meta oil-product-count">${group.products.length}種類</span>
        </div>
        <div class="oil-total-box oil-total-box-wide">
          <span>この粘度の合計</span>
          <strong>${group.totalQuantity.toLocaleString("ja-JP")}${escapeHtml(totalUnit)}</strong>
        </div>
      </summary>
      <div class="product-list oil-product-list">
        <div class="oil-list-header">
          <span>オイル名</span>
          <span>販売数</span>
        </div>
        ${products.map((product) => `
          <div class="product-row oil-product-row">
            <div class="oil-product-main">
              <div class="product-name oil-product-name">${escapeHtml(cleanDisplayOilName(product.productName))}</div>
              <div class="oil-product-sub">
                <span class="product-code">${escapeHtml(product.productCode)}</span>
                <span>${escapeHtml(product.unitLabel === "件" ? "量り売り" : "缶商品")}</span>
              </div>
            </div>
            <div class="product-qty oil-qty-badge">
              <strong>${product.quantity.toLocaleString("ja-JP")}</strong>
              <span>${escapeHtml(product.unitLabel)}</span>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    els.summaryContainer.appendChild(details);
  });
}

function renderDetailTable() {
  const rows = getVisibleRows();
  els.detailTableBody.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.rowId = row.id;

    tr.innerHTML = `
      <td><strong>${escapeHtml(row.sourceFile)}</strong><br><small>${row.pageNumber}ページ</small></td>
      <td><input data-field="productCode" inputmode="numeric" maxlength="8" value="${escapeAttribute(row.productCode)}" aria-label="商品コード"></td>
      <td><input data-field="productName" value="${escapeAttribute(row.productName)}" aria-label="商品名"></td>
      <td><input data-field="viscosity" list="viscosityOptions" class="${row.viscosity === "粘度不明" ? "unknown-input" : ""}" value="${escapeAttribute(row.viscosity)}" aria-label="粘度"></td>
      <td><input data-field="quantity" type="number" min="0" step="1" value="${Number(row.quantity)}" aria-label="販売数"></td>
      <td>
        <select data-field="category" aria-label="区分">
          <option value="缶商品" ${row.category === "缶商品" ? "selected" : ""}>缶商品</option>
          <option value="量り売り" ${row.category === "量り売り" ? "selected" : ""}>量り売り</option>
        </select>
      </td>
      <td><button class="delete-row-button" type="button">削除</button></td>
    `;

    tr.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("change", () => updateRowFromInput(row.id, input));
    });

    tr.querySelector(".delete-row-button").addEventListener("click", () => {
      state.rows = state.rows.filter((candidate) => candidate.id !== row.id);
      renderAll();
      saveData(false);
    });

    els.detailTableBody.appendChild(tr);
  });
}

function updateRowFromInput(rowId, input) {
  const row = state.rows.find((candidate) => candidate.id === rowId);
  if (!row) return;

  const field = input.dataset.field;
  let value = input.value;

  if (field === "quantity") value = Math.max(0, Number.parseInt(value, 10) || 0);
  if (field === "productCode") {
    value = normalizeProductCode(value);
    input.value = value;
  }

  if (field === "productName") {
    value = cleanProductName(value);
    row.productName = value;
    row.category = detectCategory(value);
    if (row.viscosity === "粘度不明") row.viscosity = detectViscosity(value);
  } else {
    row[field] = value;
  }

  if (field === "viscosity") row.viscosity = value.trim() || "粘度不明";

  rememberProduct(row);
  renderAll();
  saveData(false);
}

function addBlankRow() {
  state.rows.push(makeRow({
    sourceFile: "手入力",
    pageNumber: 1,
    productCode: "00000000",
    productName: "",
    viscosity: "粘度不明",
    quantity: 0,
  }));

  renderAll();
  activateTab("detail");

  requestAnimationFrame(() => {
    els.detailTableBody.querySelector("tr:last-child input[data-field='productName']")?.focus();
  });
}

function reparseRawText() {
  const text = els.ocrTextArea.value;
  const rows = [];

  text.split(/^===== .+? =====$/m).forEach((chunk, index) => {
    rows.push(...parseTextRows(chunk, "OCR原文再解析", index + 1));
  });

  if (rows.length === 0) {
    showMessage("OCR原文から商品行を抽出できませんでした。明細タブから手入力してください。", true);
    return;
  }

  const dictionary = getProductDictionary();
  state.rows = mergeExactDuplicateRows(rows.map((row) => applyDictionary(row, dictionary)));
  state.rawText = text;

  renderAll();
  saveData(false);
  showMessage(`${rows.length}件をOCR原文から再解析しました。`);
  activateTab("detail");
}

function activateTab(tabName) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));

  const target = {
    summary: $("#summaryTab"),
    detail: $("#detailTab"),
    ocr: $("#ocrTab"),
  }[tabName];

  target?.classList.add("active");
}

function saveData(showToast) {
  const payload = {
    version: 7,
    savedAt: new Date().toISOString(),
    rows: state.rows,
    rawText: state.rawText,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if (showToast) showMessage("現在のデータをこの端末に保存しました。");
}

function loadSavedData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");

    if (!saved?.rows?.length) {
      showMessage("復元できる保存データがありません。", true);
      return;
    }

    state.rows = saved.rows.map((row) => ({
      ...makeRow(row),
      id: row.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    }));
    state.rawText = saved.rawText || "";

    renderAll();
    showMessage(`${state.rows.length}件の保存データを復元しました。`);
  } catch (error) {
    console.error(error);
    showMessage("保存データを読み込めませんでした。", true);
  }
}

function resetAllData() {
  if (!window.confirm("読み取り結果と端末保存データをすべて削除します。よろしいですか？")) return;

  state.rows = [];
  state.rawText = "";
  localStorage.removeItem(STORAGE_KEY);
  els.searchInput.value = "";
  els.viscosityFilter.value = "";
  els.resultsSection.classList.add("hidden");

  renderAll();
  showMessage("集計データを削除しました。");
}

function exportSummaryCsv() {
  const lines = [["粘度", "商品コード", "商品名", "販売数", "単位"]];
  const groups = [...groupSummary(getVisibleRows()).values()].sort((a, b) => compareViscosity(a.viscosity, b.viscosity));

  groups.forEach((group) => {
    group.products
      .sort((a, b) => b.quantity - a.quantity)
      .forEach((product) => {
        lines.push([group.viscosity, product.productCode, product.productName, product.quantity, product.unitLabel]);
      });
  });

  downloadCsv(lines, `エンジンオイル_粘度別商品集計_${dateStamp()}.csv`);
}

function exportDetailCsv() {
  const lines = [["PDF名", "ページ", "商品コード", "商品名", "粘度", "販売数", "区分"]];

  getVisibleRows().forEach((row) => {
    lines.push([row.sourceFile, row.pageNumber, row.productCode, row.productName, row.viscosity, row.quantity, row.category]);
  });

  downloadCsv(lines, `エンジンオイル_読み取り明細_${dateStamp()}.csv`);
}

function exportJson() {
  downloadBlob(
    JSON.stringify({
      version: 7,
      exportedAt: new Date().toISOString(),
      rows: state.rows,
      rawText: state.rawText,
    }, null, 2),
    `エンジンオイル集計バックアップ_${dateStamp()}.json`,
    "application/json;charset=utf-8"
  );
}

function downloadCsv(rows, filename) {
  const text = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  downloadBlob(`\uFEFF${text}`, filename, "text/csv;charset=utf-8");
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function showProgress(label, percent, detail = "") {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));

  els.progressArea.classList.remove("hidden");
  els.progressLabel.textContent = label;
  els.progressPercent.textContent = `${Math.round(safePercent)}%`;
  els.progressBar.style.width = `${safePercent}%`;
  els.progressDetail.textContent = detail;
}

function showMessage(message, isError = false) {
  els.messageBox.textContent = message;
  els.messageBox.classList.remove("hidden", "error");
  if (isError) els.messageBox.classList.add("error");
}

function hideMessage() {
  els.messageBox.classList.add("hidden");
  els.messageBox.classList.remove("error");
}

function compareViscosity(a, b) {
  if (a === "粘度不明") return 1;
  if (b === "粘度不明") return -1;

  const parse = (value) => {
    const match = String(value).match(/^(\d+)W-(\d+)$/);
    return match ? [Number(match[1]), Number(match[2])] : [999, 999];
  };

  const [aCold, aHot] = parse(a);
  const [bCold, bHot] = parse(b);

  return aCold - bCold || aHot - bHot || String(a).localeCompare(String(b), "ja");
}

function normalizeCompareText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s+/g, "");
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function isPdf(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function dateStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
