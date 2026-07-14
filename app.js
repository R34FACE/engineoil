import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const STORAGE_KEY = "engineOilViscosityCounter.v2";
const PRODUCT_DICTIONARY_KEY = "engineOilProductDictionary.v2";
const $ = (selector) => document.querySelector(selector);
const state = { files: [], rows: [], rawText: "", isProcessing: false, worker: null };

const els = {
  fileInput: $("#fileInput"), dropZone: $("#dropZone"), fileList: $("#fileList"),
  analyzeButton: $("#analyzeButton"), clearFilesButton: $("#clearFilesButton"), loadSavedButton: $("#loadSavedButton"),
  progressArea: $("#progressArea"), progressLabel: $("#progressLabel"), progressPercent: $("#progressPercent"), progressBar: $("#progressBar"), progressDetail: $("#progressDetail"), messageBox: $("#messageBox"),
  resultsSection: $("#resultsSection"), totalQuantityKpi: $("#totalQuantityKpi"), viscosityCountKpi: $("#viscosityCountKpi"), productCountKpi: $("#productCountKpi"), unknownCountKpi: $("#unknownCountKpi"),
  searchInput: $("#searchInput"), viscosityFilter: $("#viscosityFilter"), sortSelect: $("#sortSelect"), summaryContainer: $("#summaryContainer"), detailTableBody: $("#detailTableBody"), ocrTextArea: $("#ocrTextArea"),
  reparseButton: $("#reparseButton"), addRowButton: $("#addRowButton"), exportSummaryButton: $("#exportSummaryButton"), exportDetailButton: $("#exportDetailButton"), exportJsonButton: $("#exportJsonButton"), saveButton: $("#saveButton"), resetButton: $("#resetButton"),
  ocrScaleInput: $("#ocrScaleInput"), quantityXInput: $("#quantityXInput"), quantityToleranceInput: $("#quantityToleranceInput"), productNameEndInput: $("#productNameEndInput"), rowToleranceInput: $("#rowToleranceInput"), includeBulkInput: $("#includeBulkInput")
};

bindEvents();
renderFiles();
setButtons();

function bindEvents() {
  els.fileInput.addEventListener("change", (event) => { addFiles([...event.target.files]); event.target.value = ""; });
  ["dragenter", "dragover"].forEach((type) => els.dropZone.addEventListener(type, (event) => { event.preventDefault(); els.dropZone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((type) => els.dropZone.addEventListener(type, (event) => { event.preventDefault(); els.dropZone.classList.remove("dragover"); }));
  els.dropZone.addEventListener("drop", (event) => addFiles([...event.dataTransfer.files]));
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
  document.querySelectorAll(".tab-button").forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.tab)));
}

function addFiles(files) {
  const accepted = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") || file.type.startsWith("image/"));
  const keys = new Set(state.files.map((file) => `${file.name}-${file.size}`));
  for (const file of accepted) {
    const key = `${file.name}-${file.size}`;
    if (!keys.has(key)) { state.files.push(file); keys.add(key); }
  }
  if (accepted.length !== files.length) showMessage("PDFまたは画像ファイルだけを選択してください。", true); else hideMessage();
  renderFiles(); setButtons();
}

function clearFiles() { if (state.isProcessing) return; state.files = []; renderFiles(); setButtons(); }
function renderFiles() { els.fileList.innerHTML = ""; state.files.forEach((file) => { const div = document.createElement("div"); div.className = "file-chip"; div.innerHTML = `<span>${escapeHtml(file.name)}</span><span>${formatFileSize(file.size)}</span>`; els.fileList.appendChild(div); }); }
function setButtons() { els.analyzeButton.disabled = !state.files.length || state.isProcessing; els.clearFilesButton.disabled = !state.files.length || state.isProcessing; }

async function analyzeFiles() {
  if (!state.files.length || state.isProcessing) return;
  state.isProcessing = true; setButtons(); hideMessage(); showProgress("PDFを確認しています", 0, "");
  const newRows = []; const rawChunks = []; let totalPages = 0; let completedPages = 0;
  try {
    for (const file of state.files) totalPages += await countPages(file);
    const worker = await getOcrWorker((message) => {
      if (message.status === "recognizing text") {
        const inner = Number.isFinite(message.progress) ? message.progress : 0;
        showProgress("文字を読み取っています", totalPages ? ((completedPages + inner) / totalPages) * 100 : inner * 100, `${Math.min(completedPages + 1, totalPages)} / ${totalPages}ページ`);
      }
    });
    for (const file of state.files) {
      const result = isPdf(file) ? await processPdf(file, worker, completedPages, totalPages) : await processImage(file, worker, completedPages, totalPages);
      newRows.push(...result.rows); rawChunks.push(result.rawText); completedPages += result.pageCount;
    }
    const dictionary = getProductDictionary();
    state.rows = mergeRows([...state.rows, ...newRows.map((row) => applyDictionary(row, dictionary))]);
    state.rawText = [state.rawText, ...rawChunks].filter(Boolean).join("\n\n");
    showProgress("集計が完了しました", 100, `${newRows.length}行を読み取りました。`);
    els.resultsSection.classList.remove("hidden"); renderAll(); saveData(false);
    if (!newRows.length) { showMessage("商品行を自動抽出できませんでした。OCR原文または読み取り設定を確認してください。", true); activateTab("ocr"); }
    else showMessage(`${newRows.length}件の商品行を追加しました。粘度未判定の商品があれば明細で修正してください。`);
  } catch (error) {
    console.error(error);
    showMessage(`読み取り中にエラーが発生しました：${error.message || error}`, true);
  } finally {
    state.isProcessing = false; setButtons();
  }
}

async function loadPdfDocument(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false });
  return await task.promise;
}

async function countPages(file) {
  if (!isPdf(file)) return 1;
  const pdf = await loadPdfDocument(file);
  return pdf.numPages || 1;
}

async function processPdf(file, worker, completedPages, totalPages) {
  const pdf = await loadPdfDocument(file);
  const rows = []; const raw = []; const pageCount = pdf.numPages || 1;
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    showProgress("ページを画像化しています", ((completedPages + pageNumber - 1) / totalPages) * 100, `${file.name}：${pageNumber} / ${pageCount}ページ`);
    const page = await pdf.getPage(pageNumber);
    const textRows = await readTextLayer(page, file.name, pageNumber);
    let pageRows = textRows;
    let rawText = textRows.map((row) => `${row.productCode} ${row.productName} ${row.quantity}`).join("\n");
    if (textRows.length < 5) {
      const canvas = await renderPageToCanvas(page);
      const processed = preprocessCanvas(canvas);
      const result = await worker.recognize(processed, {}, { text: true, tsv: true });
      const ocrText = result.data.text || "";
      const tsv = result.data.tsv || "";
      rawText = ocrText;
      const positionalRows = parseTsvRows(tsv, processed.width, processed.height, file.name, pageNumber);
      const fallbackRows = parseTextRows(ocrText, file.name, pageNumber);
      pageRows = positionalRows.length >= Math.max(2, fallbackRows.length * 0.55) ? positionalRows : fallbackRows;
    }
    raw.push(`===== ${file.name} / ${pageNumber}ページ =====\n${rawText}`);
    rows.push(...pageRows);
    if (typeof page.cleanup === "function") page.cleanup();
  }
  return { rows, rawText: raw.join("\n\n"), pageCount };
}

async function readTextLayer(page, sourceFile, pageNumber) {
  try {
    const content = await page.getTextContent();
    const lines = groupTextItemsIntoLines(content.items || []);
    return parseTextRows(lines.join("\n"), sourceFile, pageNumber);
  } catch { return []; }
}

function groupTextItemsIntoLines(items) {
  const prepared = items.map((item) => ({ text: item.str || "", x: item.transform?.[4] || 0, y: item.transform?.[5] || 0 })).filter((item) => item.text.trim());
  prepared.sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x);
  const lines = [];
  for (const item of prepared) {
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) < 3);
    if (!line) { line = { y: item.y, parts: [] }; lines.push(line); }
    line.parts.push(item);
  }
  return lines.sort((a, b) => b.y - a.y).map((line) => line.parts.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "));
}

async function processImage(file, worker, completedPages, totalPages) {
  showProgress("画像を読み取っています", (completedPages / totalPages) * 100, file.name);
  const canvas = await imageFileToCanvas(file);
  const processed = preprocessCanvas(canvas);
  const result = await worker.recognize(processed, {}, { text: true, tsv: true });
  const text = result.data.text || ""; const tsv = result.data.tsv || "";
  const positionalRows = parseTsvRows(tsv, processed.width, processed.height, file.name, 1);
  const fallbackRows = parseTextRows(text, file.name, 1);
  return { rows: positionalRows.length >= Math.max(2, fallbackRows.length * 0.55) ? positionalRows : fallbackRows, rawText: `===== ${file.name} / 1ページ =====\n${text}`, pageCount: 1 };
}

async function getOcrWorker(logger) {
  if (state.worker) return state.worker;
  if (!window.Tesseract) throw new Error("OCRライブラリを読み込めませんでした。通信状況を確認してください。");
  const oem = window.Tesseract.OEM?.LSTM_ONLY;
  state.worker = await window.Tesseract.createWorker("jpn+eng", oem, { logger, errorHandler: (error) => console.error("Tesseract error", error) });
  await state.worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1", user_defined_dpi: "300" });
  return state.worker;
}

async function renderPageToCanvas(page) {
  const scale = clamp(Number(els.ocrScaleInput.value), 1.5, 3.5, 2.3);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas"); const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: context, viewport, background: "white" }).promise;
  return canvas;
}

function preprocessCanvas(source) {
  const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height); const data = image.data;
  for (let i = 0; i < data.length; i += 4) { const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114); const value = gray > 242 ? 255 : Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128)); data[i] = data[i + 1] = data[i + 2] = value; }
  context.putImageData(image, 0, 0); return canvas;
}

async function imageFileToCanvas(file) {
  const bitmap = await createImageBitmap(file); const scale = bitmap.width > 2600 ? 2600 / bitmap.width : 1;
  const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); return canvas;
}

function parseTsvRows(tsv, width, height, sourceFile, pageNumber) {
  if (!tsv.trim()) return [];
  const words = tsv.split(/\r?\n/).slice(1).map((line) => line.split("\t")).filter((cols) => cols.length >= 12).map((cols) => ({ level: Number(cols[0]), left: Number(cols[6]), top: Number(cols[7]), width: Number(cols[8]), height: Number(cols[9]), confidence: Number(cols[10]), text: cols.slice(11).join("\t").trim() })).filter((word) => word.level === 5 && word.text && Number.isFinite(word.left) && Number.isFinite(word.top) && word.confidence > -1).map((word) => ({ ...word, centerX: word.left + word.width / 2, centerY: word.top + word.height / 2 })).sort((a, b) => a.centerY - b.centerY || a.left - b.left);
  const rowTolerance = height * (clamp(Number(els.rowToleranceInput.value), 0.3, 2, 0.9) / 100);
  const clusters = [];
  for (const word of words) { let cluster = clusters.find((candidate) => Math.abs(candidate.centerY - word.centerY) <= rowTolerance); if (!cluster) { cluster = { centerY: word.centerY, words: [] }; clusters.push(cluster); } cluster.words.push(word); cluster.centerY = cluster.words.reduce((sum, item) => sum + item.centerY, 0) / cluster.words.length; }
  const quantityX = width * (clamp(Number(els.quantityXInput.value), 70, 95, 87.5) / 100);
  const quantityTolerance = width * (clamp(Number(els.quantityToleranceInput.value), 1, 8, 3) / 100);
  const productNameEnd = width * (clamp(Number(els.productNameEndInput.value), 65, 85, 78.5) / 100);
  const rows = [];
  for (const cluster of clusters) {
    const lineWords = [...cluster.words].sort((a, b) => a.left - b.left);
    const codeIndex = lineWords.findIndex((word) => { const code = normalizeProductCode(word.text); const ratio = word.centerX / width; return code.length === 8 && ratio >= 0.25 && ratio <= 0.62; });
    if (codeIndex < 0) continue;
    const codeWord = lineWords[codeIndex]; const code = normalizeProductCode(codeWord.text);
    const quantityWord = lineWords.filter((word) => Math.abs(word.centerX - quantityX) <= quantityTolerance && isIntegerToken(word.text)).sort((a, b) => Math.abs(a.centerX - quantityX) - Math.abs(b.centerX - quantityX))[0];
    if (!quantityWord) continue;
    const quantity = parseInteger(quantityWord.text); if (!Number.isFinite(quantity) || quantity < 0 || quantity > 100000) continue;
    const name = cleanProductName(lineWords.filter((word) => word.left > codeWord.left + codeWord.width * 0.6 && word.centerX < productNameEnd).map((word) => word.text).join(" "));
    if (!name || name.length < 3) continue;
    rows.push(makeRow({ sourceFile, pageNumber, productCode: code, productName: name, viscosity: detectViscosity(name), quantity }));
  }
  return dedupeRows(rows);
}

function parseTextRows(text, sourceFile, pageNumber) {
  const lines = normalizeOcrText(text).split("\n"); const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i].trim(); if (!current) continue;
    const candidates = [current]; if (i + 1 < lines.length) candidates.push(`${current} ${lines[i + 1].trim()}`); if (i + 2 < lines.length) candidates.push(`${current} ${lines[i + 1].trim()} ${lines[i + 2].trim()}`);
    for (const candidate of candidates) { const parsed = parseTextLine(candidate, sourceFile, pageNumber); if (parsed) { rows.push(parsed); break; } }
  }
  return dedupeRows(rows);
}

function parseTextLine(line, sourceFile, pageNumber) {
  const normalized = line.normalize("NFKC").replace(/(\d),\s+(?=\d)/g, "$1,").replace(/\s+/g, " ").trim();
  const codeMatch = normalized.match(/^([0-9OIl|]{7,9})\s+(.+)$/i); if (!codeMatch) return null;
  const code = normalizeProductCode(codeMatch[1]); if (code.length !== 8) return null;
  const match = codeMatch[2].match(/^(.+?\S)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)$/); if (!match) return null;
  const productName = cleanProductName(match[1]); const quantity = parseInteger(match[3]);
  if (!productName || !Number.isFinite(quantity) || quantity < 0 || quantity > 100000) return null;
  return makeRow({ sourceFile, pageNumber, productCode: code, productName, viscosity: detectViscosity(productName), quantity });
}

function normalizeOcrText(text) { return String(text || "").normalize("NFKC").replace(/\r/g, "").replace(/[‐‑‒–—―−ー]/g, "-").replace(/[ \t]+/g, " "); }
function normalizeProductCode(value) { const digits = String(value || "").normalize("NFKC").toUpperCase().replace(/O/g, "0").replace(/[IL|]/g, "1").replace(/\D/g, ""); return digits.length >= 7 && digits.length <= 8 ? digits.padStart(8, "0") : digits.slice(0, 8); }
function isIntegerToken(value) { return /^\d+$/.test(String(value).normalize("NFKC").replace(/[OＯ]/g, "0").replace(/[Il|]/g, "1").replace(/[,\s]/g, "")); }
function parseInteger(value) { return Number.parseInt(String(value).normalize("NFKC").replace(/[OＯ]/g, "0").replace(/[Il|]/g, "1").replace(/[^\d-]/g, ""), 10); }
function cleanProductName(value) { return String(value || "").normalize("NFKC").replace(/[‐‑‒–—―−ー]/g, "-").replace(/\s+/g, " ").replace(/^[\s:：・.]+|[\s:：・.]+$/g, "").trim(); }
function detectViscosity(name) { const value = String(name).normalize("NFKC").toUpperCase().replace(/[‐‑‒–—―−ー]/g, "-").replace(/Ｏ/g, "O").replace(/０/g, "0").replace(/\bO(?=\s*W)/g, "0").replace(/VV/g, "W"); const match = value.match(/(?:^|[^0-9])((?:0|5|10|15|20))\s*W\s*-?\s*(8|12|16|20|30|40|50)(?:[^0-9]|$)/); return match ? `${Number(match[1])}W-${Number(match[2])}` : "粘度不明"; }
function detectCategory(name) { return /(量り売り|量売り|量売|L迄|Lまで|レデマ|ﾚﾃﾞﾏ|L迄|L迄)/i.test(String(name).normalize("NFKC")) ? "量り売り" : "缶商品"; }
function makeRow(data) { const productName = cleanProductName(data.productName || ""); return { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, sourceFile: data.sourceFile || "手入力", pageNumber: Number(data.pageNumber) || 1, productCode: normalizeProductCode(data.productCode || ""), productName, viscosity: data.viscosity || detectViscosity(productName), quantity: Math.max(0, Number(data.quantity) || 0), category: data.category || detectCategory(productName) }; }
function normalizeCompareText(value) { return String(value || "").normalize("NFKC").toUpperCase().replace(/\s+/g, ""); }
function dedupeRows(rows) { const map = new Map(); rows.forEach((row) => { const key = [row.sourceFile, row.pageNumber, row.productCode, normalizeCompareText(row.productName), row.quantity].join("|"); if (!map.has(key)) map.set(key, row); }); return [...map.values()]; }
function mergeRows(rows) { return dedupeRows(rows); }
function getProductDictionary() { try { return JSON.parse(localStorage.getItem(PRODUCT_DICTIONARY_KEY) || "{}"); } catch { return {}; } }
function applyDictionary(row, dictionary) { const saved = dictionary[row.productCode]; if (!saved) return row; const productName = saved.productName || row.productName; return { ...row, productName, viscosity: saved.viscosity || detectViscosity(productName), category: saved.category || detectCategory(productName) }; }
function rememberProduct(row) { if (!row.productCode || row.productCode === "00000000") return; const dictionary = getProductDictionary(); dictionary[row.productCode] = { productName: row.productName, viscosity: row.viscosity, category: row.category }; localStorage.setItem(PRODUCT_DICTIONARY_KEY, JSON.stringify(dictionary)); }

function renderAll() { if (state.rows.length) els.resultsSection.classList.remove("hidden"); renderKpis(); renderViscosityFilter(); renderSummary(); renderDetailTable(); els.ocrTextArea.value = state.rawText; }
function getVisibleRows() { const search = normalizeCompareText(els.searchInput.value); const viscosity = els.viscosityFilter.value; const includeBulk = els.includeBulkInput.checked; return state.rows.filter((row) => { if (!includeBulk && row.category === "量り売り") return false; if (viscosity && row.viscosity !== viscosity) return false; if (!search) return true; return [row.viscosity, row.productName, row.productCode, row.sourceFile].some((value) => normalizeCompareText(value).includes(search)); }); }
function renderKpis() { const rows = getVisibleRows(); const total = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0); const viscosities = new Set(rows.map((row) => row.viscosity)); const products = new Set(rows.map((row) => `${row.productCode}|${normalizeCompareText(row.productName)}`)); const unknown = rows.filter((row) => row.viscosity === "粘度不明").reduce((sum, row) => sum + (Number(row.quantity) || 0), 0); els.totalQuantityKpi.textContent = total.toLocaleString("ja-JP"); els.viscosityCountKpi.textContent = viscosities.size.toLocaleString("ja-JP"); els.productCountKpi.textContent = products.size.toLocaleString("ja-JP"); els.unknownCountKpi.textContent = unknown.toLocaleString("ja-JP"); }
function renderViscosityFilter() { const current = els.viscosityFilter.value; const values = [...new Set(state.rows.map((row) => row.viscosity))].sort(compareViscosity); els.viscosityFilter.innerHTML = '<option value="">すべての粘度</option>'; values.forEach((value) => { const option = document.createElement("option"); option.value = value; option.textContent = value; els.viscosityFilter.appendChild(option); }); if (values.includes(current)) els.viscosityFilter.value = current; }
function groupSummary(rows) { const viscosityMap = new Map(); rows.forEach((row) => { if (!viscosityMap.has(row.viscosity)) viscosityMap.set(row.viscosity, { viscosity: row.viscosity, totalQuantity: 0, productMap: new Map(), products: [] }); const group = viscosityMap.get(row.viscosity); group.totalQuantity += Number(row.quantity) || 0; const key = row.productCode && row.productCode !== "00000000" ? row.productCode : normalizeCompareText(row.productName); if (!group.productMap.has(key)) group.productMap.set(key, { productCode: row.productCode, productName: row.productName, quantity: 0, categories: new Set() }); const product = group.productMap.get(key); product.quantity += Number(row.quantity) || 0; product.categories.add(row.category); }); viscosityMap.forEach((group) => { group.products = [...group.productMap.values()].map((product) => ({ ...product, unitLabel: product.categories.size === 1 && product.categories.has("量り売り") ? "件" : "缶" })); delete group.productMap; }); return viscosityMap; }
function renderSummary() { let groups = [...groupSummary(getVisibleRows()).values()]; if (els.sortSelect.value === "quantity-desc") groups.sort((a, b) => b.totalQuantity - a.totalQuantity || compareViscosity(a.viscosity, b.viscosity)); else if (els.sortSelect.value === "product") groups.sort((a, b) => (a.products[0]?.productName || "").localeCompare(b.products[0]?.productName || "", "ja")); else groups.sort((a, b) => compareViscosity(a.viscosity, b.viscosity)); els.summaryContainer.innerHTML = ""; if (!groups.length) { els.summaryContainer.innerHTML = '<div class="empty-state">表示できる集計データがありません。</div>'; return; } groups.forEach((group, index) => { const details = document.createElement("details"); details.className = "viscosity-card"; details.open = index < 3 || group.viscosity === "粘度不明"; const products = [...group.products].sort((a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName, "ja")); details.innerHTML = `<summary><span class="viscosity-name">${escapeHtml(group.viscosity)}</span><span class="viscosity-meta">${group.products.length}商品</span><span class="viscosity-total"><strong>${group.totalQuantity.toLocaleString("ja-JP")}</strong><span>販売数量合計</span></span></summary><div class="product-list">${products.map((product) => `<div class="product-row"><span class="product-code">${escapeHtml(product.productCode)}</span><span class="product-name">${escapeHtml(product.productName)}</span><span class="product-qty">${product.quantity.toLocaleString("ja-JP")}${escapeHtml(product.unitLabel)}</span></div>`).join("")}</div>`; els.summaryContainer.appendChild(details); }); }
function renderDetailTable() { const rows = getVisibleRows(); els.detailTableBody.innerHTML = ""; rows.forEach((row) => { const tr = document.createElement("tr"); tr.dataset.rowId = row.id; tr.innerHTML = `<td><strong>${escapeHtml(row.sourceFile)}</strong><br><small>${row.pageNumber}ページ</small></td><td><input data-field="productCode" inputmode="numeric" maxlength="8" value="${escapeAttribute(row.productCode)}" aria-label="商品コード"></td><td><input data-field="productName" value="${escapeAttribute(row.productName)}" aria-label="商品名"></td><td><input data-field="viscosity" list="viscosityOptions" class="${row.viscosity === "粘度不明" ? "unknown-input" : ""}" value="${escapeAttribute(row.viscosity)}" aria-label="粘度"></td><td><input data-field="quantity" type="number" min="0" step="1" value="${Number(row.quantity)}" aria-label="販売数"></td><td><select data-field="category"><option value="缶商品" ${row.category === "缶商品" ? "selected" : ""}>缶商品</option><option value="量り売り" ${row.category === "量り売り" ? "selected" : ""}>量り売り</option></select></td><td><button class="delete-row-button" type="button">削除</button></td>`; tr.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("change", () => updateRowFromInput(row.id, input))); tr.querySelector(".delete-row-button").addEventListener("click", () => { state.rows = state.rows.filter((candidate) => candidate.id !== row.id); renderAll(); saveData(false); }); els.detailTableBody.appendChild(tr); }); }
function updateRowFromInput(id, input) { const row = state.rows.find((candidate) => candidate.id === id); if (!row) return; const field = input.dataset.field; let value = input.value; if (field === "quantity") value = Math.max(0, Number.parseInt(value, 10) || 0); if (field === "productCode") { value = normalizeProductCode(value); input.value = value; } if (field === "productName") { value = cleanProductName(value); row.productName = value; row.category = detectCategory(value); if (row.viscosity === "粘度不明") row.viscosity = detectViscosity(value); } else row[field] = value; if (field === "viscosity") row.viscosity = value.trim() || "粘度不明"; rememberProduct(row); renderAll(); saveData(false); }
function addBlankRow() { state.rows.push(makeRow({ sourceFile: "手入力", pageNumber: 1, productCode: "00000000", productName: "", viscosity: "粘度不明", quantity: 0 })); renderAll(); activateTab("detail"); requestAnimationFrame(() => els.detailTableBody.querySelector("tr:last-child input[data-field='productName']")?.focus()); }
function reparseRawText() { const text = els.ocrTextArea.value; const chunks = text.split(/^===== .+? =====$/m); const rows = []; chunks.forEach((chunk, index) => rows.push(...parseTextRows(chunk, "OCR原文再解析", index + 1))); if (!rows.length) { showMessage("OCR原文から商品行を抽出できませんでした。明細タブから手入力してください。", true); return; } const dictionary = getProductDictionary(); state.rows = mergeRows(rows.map((row) => applyDictionary(row, dictionary))); state.rawText = text; renderAll(); saveData(false); showMessage(`${rows.length}件をOCR原文から再解析しました。`); activateTab("detail"); }
function activateTab(name) { document.querySelectorAll(".tab-button").forEach((button) => { const active = button.dataset.tab === name; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); }); document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active")); ({ summary: $("#summaryTab"), detail: $("#detailTab"), ocr: $("#ocrTab") })[name]?.classList.add("active"); }

function saveData(showToast) { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, savedAt: new Date().toISOString(), rows: state.rows, rawText: state.rawText })); if (showToast) showMessage("現在のデータをこの端末に保存しました。"); }
function loadSavedData() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem("engineOilViscosityCounter.v1") || "null"); if (!saved?.rows?.length) { showMessage("復元できる保存データがありません。", true); return; } state.rows = saved.rows.map((row) => ({ ...makeRow(row), id: row.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`) })); state.rawText = saved.rawText || ""; renderAll(); showMessage(`${state.rows.length}件の保存データを復元しました。`); } catch (error) { console.error(error); showMessage("保存データを読み込めませんでした。", true); } }
function resetAllData() { if (!window.confirm("読み取り結果と端末保存データをすべて削除します。よろしいですか？")) return; state.rows = []; state.rawText = ""; localStorage.removeItem(STORAGE_KEY); localStorage.removeItem("engineOilViscosityCounter.v1"); els.searchInput.value = ""; els.viscosityFilter.value = ""; els.resultsSection.classList.add("hidden"); renderAll(); showMessage("集計データを削除しました。"); }
function exportSummaryCsv() { const lines = [["粘度", "商品コード", "商品名", "販売数", "単位"]]; [...groupSummary(getVisibleRows()).values()].sort((a, b) => compareViscosity(a.viscosity, b.viscosity)).forEach((group) => group.products.sort((a, b) => b.quantity - a.quantity).forEach((product) => lines.push([group.viscosity, product.productCode, product.productName, product.quantity, product.unitLabel]))); downloadCsv(lines, `エンジンオイル_粘度別商品集計_${dateStamp()}.csv`); }
function exportDetailCsv() { const lines = [["PDF名", "ページ", "商品コード", "商品名", "粘度", "販売数", "区分"]]; getVisibleRows().forEach((row) => lines.push([row.sourceFile, row.pageNumber, row.productCode, row.productName, row.viscosity, row.quantity, row.category])); downloadCsv(lines, `エンジンオイル_読み取り明細_${dateStamp()}.csv`); }
function exportJson() { downloadBlob(JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), rows: state.rows, rawText: state.rawText }, null, 2), `エンジンオイル集計バックアップ_${dateStamp()}.json`, "application/json;charset=utf-8"); }
function downloadCsv(rows, filename) { downloadBlob("\uFEFF" + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n"), filename, "text/csv;charset=utf-8"); }
function downloadBlob(content, filename, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }
function csvEscape(value) { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function compareViscosity(a, b) { if (a === "粘度不明") return 1; if (b === "粘度不明") return -1; const parse = (value) => { const match = String(value).match(/^(\d+)W-(\d+)$/); return match ? [Number(match[1]), Number(match[2])] : [999, 999]; }; const [aCold, aHot] = parse(a); const [bCold, bHot] = parse(b); return aCold - bCold || aHot - bHot || String(a).localeCompare(String(b), "ja"); }
function showProgress(label, percent, detail = "") { const safePercent = Math.max(0, Math.min(100, Number(percent) || 0)); els.progressArea.classList.remove("hidden"); els.progressLabel.textContent = label; els.progressPercent.textContent = `${Math.round(safePercent)}%`; els.progressBar.style.width = `${safePercent}%`; els.progressDetail.textContent = detail; }
function showMessage(message, isError = false) { els.messageBox.textContent = message; els.messageBox.classList.remove("hidden", "error"); if (isError) els.messageBox.classList.add("error"); }
function hideMessage() { els.messageBox.classList.add("hidden"); els.messageBox.classList.remove("error"); }
function formatFileSize(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 ** 2).toFixed(1)} MB`; }
function isPdf(file) { return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"); }
function clamp(value, min, max, fallback) { if (!Number.isFinite(value)) return fallback; return Math.min(max, Math.max(min, value)); }
function dateStamp() { const now = new Date(); const pad = (value) => String(value).padStart(2, "0"); return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`; }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
