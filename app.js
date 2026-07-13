import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.0.227/build/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@6.0.227/build/pdf.worker.min.mjs";

const STORAGE_KEY="engineOilViscosityCounter.v1";
const PRODUCT_DICTIONARY_KEY="engineOilProductDictionary.v1";
const state={files:[],rows:[],rawText:"",isProcessing:false,worker:null};
const $=(s)=>document.querySelector(s);
const els={
 fileInput:$("#fileInput"),dropZone:$("#dropZone"),fileList:$("#fileList"),analyzeButton:$("#analyzeButton"),clearFilesButton:$("#clearFilesButton"),loadSavedButton:$("#loadSavedButton"),
 progressArea:$("#progressArea"),progressLabel:$("#progressLabel"),progressPercent:$("#progressPercent"),progressBar:$("#progressBar"),progressDetail:$("#progressDetail"),messageBox:$("#messageBox"),
 resultsSection:$("#resultsSection"),totalQuantityKpi:$("#totalQuantityKpi"),viscosityCountKpi:$("#viscosityCountKpi"),productCountKpi:$("#productCountKpi"),unknownCountKpi:$("#unknownCountKpi"),
 searchInput:$("#searchInput"),viscosityFilter:$("#viscosityFilter"),sortSelect:$("#sortSelect"),summaryContainer:$("#summaryContainer"),detailTableBody:$("#detailTableBody"),ocrTextArea:$("#ocrTextArea"),
 reparseButton:$("#reparseButton"),addRowButton:$("#addRowButton"),exportSummaryButton:$("#exportSummaryButton"),exportDetailButton:$("#exportDetailButton"),exportJsonButton:$("#exportJsonButton"),saveButton:$("#saveButton"),resetButton:$("#resetButton"),
 ocrScaleInput:$("#ocrScaleInput"),quantityXInput:$("#quantityXInput"),quantityToleranceInput:$("#quantityToleranceInput"),productNameEndInput:$("#productNameEndInput"),rowToleranceInput:$("#rowToleranceInput"),includeBulkInput:$("#includeBulkInput")
};

bindEvents();renderFiles();setButtons();

function bindEvents(){
 els.fileInput.addEventListener("change",e=>{addFiles([...e.target.files]);e.target.value=""});
 ["dragenter","dragover"].forEach(t=>els.dropZone.addEventListener(t,e=>{e.preventDefault();els.dropZone.classList.add("dragover")}));
 ["dragleave","drop"].forEach(t=>els.dropZone.addEventListener(t,e=>{e.preventDefault();els.dropZone.classList.remove("dragover")}));
 els.dropZone.addEventListener("drop",e=>addFiles([...e.dataTransfer.files]));
 els.analyzeButton.addEventListener("click",analyzeFiles);els.clearFilesButton.addEventListener("click",clearFiles);els.loadSavedButton.addEventListener("click",loadSavedData);
 els.saveButton.addEventListener("click",()=>saveData(true));els.resetButton.addEventListener("click",resetAllData);
 els.searchInput.addEventListener("input",renderAll);els.viscosityFilter.addEventListener("change",renderAll);els.sortSelect.addEventListener("change",renderAll);els.includeBulkInput.addEventListener("change",renderAll);
 els.reparseButton.addEventListener("click",reparseRawText);els.addRowButton.addEventListener("click",addBlankRow);
 els.exportSummaryButton.addEventListener("click",exportSummaryCsv);els.exportDetailButton.addEventListener("click",exportDetailCsv);els.exportJsonButton.addEventListener("click",exportJson);
 document.querySelectorAll(".tab-button").forEach(b=>b.addEventListener("click",()=>activateTab(b.dataset.tab)));
}
function addFiles(files){
 const accepted=files.filter(f=>f.type==="application/pdf"||f.name.toLowerCase().endsWith(".pdf")||f.type.startsWith("image/"));
 const keys=new Set(state.files.map(f=>`${f.name}-${f.size}`));accepted.forEach(f=>{const k=`${f.name}-${f.size}`;if(!keys.has(k)){state.files.push(f);keys.add(k)}});
 if(accepted.length!==files.length)showMessage("PDFまたは画像ファイルだけを選択してください。");else hideMessage();renderFiles();setButtons();
}
function clearFiles(){if(state.isProcessing)return;state.files=[];renderFiles();setButtons()}
function renderFiles(){els.fileList.innerHTML="";state.files.forEach(f=>{const d=document.createElement("div");d.className="file-chip";d.innerHTML=`<span>${escapeHtml(f.name)}</span><span>${formatFileSize(f.size)}</span>`;els.fileList.appendChild(d)})}
function setButtons(){els.analyzeButton.disabled=!state.files.length||state.isProcessing;els.clearFilesButton.disabled=!state.files.length||state.isProcessing}

async function analyzeFiles(){
 if(!state.files.length||state.isProcessing)return;state.isProcessing=true;setButtons();hideMessage();showProgress("OCRを準備しています",0,"初回は日本語データの読み込みに時間がかかります。");
 const newRows=[],rawChunks=[];let totalPages=0,completedPages=0;
 try{
  for(const f of state.files)totalPages+=await countPages(f);
  const worker=await getOcrWorker(m=>{if(m.status==="recognizing text"){const p=Number.isFinite(m.progress)?m.progress:0;showProgress("文字を読み取っています",totalPages?((completedPages+p)/totalPages)*100:p*100,`${Math.min(completedPages+1,totalPages)} / ${totalPages}ページ`)}});
  for(const f of state.files){const r=isPdf(f)?await processPdf(f,worker,completedPages,totalPages):await processImage(f,worker,completedPages,totalPages);newRows.push(...r.rows);rawChunks.push(r.rawText);completedPages+=r.pageCount}
  const dict=getProductDictionary();state.rows=mergeExactDuplicateRows([...state.rows,...newRows.map(r=>applyDictionary(r,dict))]);state.rawText=[state.rawText,...rawChunks].filter(Boolean).join("\n\n");
  showProgress("集計が完了しました",100,`${newRows.length}行を読み取りました。`);els.resultsSection.classList.remove("hidden");renderAll();saveData(false);
  if(!newRows.length){showMessage("商品行を自動抽出できませんでした。OCR原文または読み取り設定を確認してください。",true);activateTab("ocr")}else showMessage(`${newRows.length}件の商品行を追加しました。粘度未判定の商品があれば明細で修正してください。`);
 }catch(err){console.error(err);showMessage(`読み取り中にエラーが発生しました：${err.message}`,true)}finally{state.isProcessing=false;setButtons()}
}
async function countPages(file){if(!isPdf(file))return 1;const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;const n=pdf.numPages;await pdf.destroy();return n}
async function processPdf(file,worker,completedPages,totalPages){
 const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;const rows=[],raw=[];const pageCount=pdf.numPages;
 for(let n=1;n<=pageCount;n++){
  showProgress("ページを画像化しています",((completedPages+n-1)/totalPages)*100,`${file.name}：${n} / ${pageCount}ページ`);
  const page=await pdf.getPage(n),canvas=await renderPageToCanvas(page),processed=preprocessCanvas(canvas),result=await worker.recognize(processed,{}, {text:true,tsv:true});
  const text=result.data.text||"",tsv=result.data.tsv||"";raw.push(`===== ${file.name} / ${n}ページ =====\n${text}`);
  const pos=parseTsvRows(tsv,processed.width,processed.height,file.name,n),fallback=parseTextRows(text,file.name,n);rows.push(...(pos.length>=Math.max(2,fallback.length*.55)?pos:fallback));page.cleanup();
 }
 await pdf.destroy();return{rows,rawText:raw.join("\n\n"),pageCount};
}
async function processImage(file,worker,completedPages,totalPages){
 showProgress("画像を読み取っています",(completedPages/totalPages)*100,file.name);const canvas=await imageFileToCanvas(file),processed=preprocessCanvas(canvas),result=await worker.recognize(processed,{}, {text:true,tsv:true});
 const text=result.data.text||"",tsv=result.data.tsv||"",pos=parseTsvRows(tsv,processed.width,processed.height,file.name,1),fallback=parseTextRows(text,file.name,1);
 return{rows:pos.length>=Math.max(2,fallback.length*.55)?pos:fallback,rawText:`===== ${file.name} / 1ページ =====\n${text}`,pageCount:1};
}
async function getOcrWorker(logger){
 if(state.worker)return state.worker;if(!window.Tesseract)throw new Error("Tesseract.jsを読み込めませんでした。インターネット接続を確認してください。");
 state.worker=await window.Tesseract.createWorker(["jpn","eng"],window.Tesseract.OEM.LSTM_ONLY,{logger,errorHandler:e=>console.error("Tesseract error",e)});
 await state.worker.setParameters({tessedit_pageseg_mode:window.Tesseract.PSM.SINGLE_BLOCK,preserve_interword_spaces:"1",user_defined_dpi:"300"});return state.worker;
}
async function renderPageToCanvas(page){const scale=clamp(Number(els.ocrScaleInput.value),1.5,3.5,2.3),viewport=page.getViewport({scale}),canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:ctx,viewport,background:"white"}).promise;return canvas}
function preprocessCanvas(src){const c=document.createElement("canvas");c.width=src.width;c.height=src.height;const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(src,0,0);const im=x.getImageData(0,0,c.width,c.height),d=im.data;for(let i=0;i<d.length;i+=4){const g=Math.round(d[i]*.299+d[i+1]*.587+d[i+2]*.114),v=g>242?255:Math.max(0,Math.min(255,(g-128)*1.35+128));d[i]=d[i+1]=d[i+2]=v}x.putImageData(im,0,0);return c}
async function imageFileToCanvas(file){const b=await createImageBitmap(file),s=b.width>2600?2600/b.width:1,c=document.createElement("canvas");c.width=Math.round(b.width*s);c.height=Math.round(b.height*s);c.getContext("2d").drawImage(b,0,0,c.width,c.height);b.close();return c}

function parseTsvRows(tsv,width,height,sourceFile,pageNumber){
 if(!tsv.trim())return[];
 const words=tsv.split(/\r?\n/).slice(1).map(l=>l.split("\t")).filter(c=>c.length>=12).map(c=>({level:+c[0],left:+c[6],top:+c[7],width:+c[8],height:+c[9],confidence:+c[10],text:c.slice(11).join("\t").trim()})).filter(w=>w.level===5&&w.text&&Number.isFinite(w.left)&&Number.isFinite(w.top)&&w.confidence>-1).map(w=>({...w,centerX:w.left+w.width/2,centerY:w.top+w.height/2})).sort((a,b)=>a.centerY-b.centerY||a.left-b.left);
 const rowTol=height*(clamp(Number(els.rowToleranceInput.value),.3,2,.9)/100),clusters=[];
 for(const w of words){let c=clusters.find(x=>Math.abs(x.centerY-w.centerY)<=rowTol);if(!c){c={centerY:w.centerY,words:[]};clusters.push(c)}c.words.push(w);c.centerY=c.words.reduce((s,i)=>s+i.centerY,0)/c.words.length}
 const qtyX=width*(clamp(Number(els.quantityXInput.value),70,95,87.5)/100),qtyTol=width*(clamp(Number(els.quantityToleranceInput.value),1,8,3)/100),nameEnd=width*(clamp(Number(els.productNameEndInput.value),65,85,78.5)/100),rows=[];
 for(const c of clusters){const ws=[...c.words].sort((a,b)=>a.left-b.left),ci=ws.findIndex(w=>{const code=normalizeProductCode(w.text),r=w.centerX/width;return code.length===8&&r>=.25&&r<=.62});if(ci<0)continue;const cw=ws[ci],code=normalizeProductCode(cw.text),q=ws.filter(w=>Math.abs(w.centerX-qtyX)<=qtyTol&&isIntegerToken(w.text)).sort((a,b)=>Math.abs(a.centerX-qtyX)-Math.abs(b.centerX-qtyX))[0];if(!q)continue;const quantity=parseInteger(q.text);if(!Number.isFinite(quantity)||quantity<0||quantity>100000)continue;const name=cleanProductName(ws.filter(w=>w.left>cw.left+cw.width*.6&&w.centerX<nameEnd).map(w=>w.text).join(" "));if(!name||name.length<3)continue;rows.push(makeRow({sourceFile,pageNumber,productCode:code,productName:name,viscosity:detectViscosity(name),quantity}))}
 return dedupePageRows(rows);
}
function parseTextRows(text,sourceFile,pageNumber){const lines=normalizeOcrText(text).split("\n"),rows=[];for(let i=0;i<lines.length;i++){const cur=lines[i].trim();if(!cur)continue;const cs=[cur];if(i+1<lines.length)cs.push(`${cur} ${lines[i+1].trim()}`);if(i+2<lines.length)cs.push(`${cur} ${lines[i+1].trim()} ${lines[i+2].trim()}`);let p=null;for(const x of cs){p=parseTextLine(x,sourceFile,pageNumber);if(p)break}if(p)rows.push(p)}return dedupePageRows(rows)}
function parseTextLine(line,sourceFile,pageNumber){const n=line.normalize("NFKC").replace(/(\d),\s+(?=\d)/g,"$1,").replace(/\s+/g," ").trim(),cm=n.match(/^([0-9OIl|]{7,9})\s+(.+)$/i);if(!cm)return null;const code=normalizeProductCode(cm[1]);if(code.length!==8)return null;const m=cm[2].match(/^(.+?\S)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)$/);if(!m)return null;const name=cleanProductName(m[1]),quantity=parseInteger(m[3]);if(!name||!Number.isFinite(quantity)||quantity<0||quantity>100000)return null;return makeRow({sourceFile,pageNumber,productCode:code,productName:name,viscosity:detectViscosity(name),quantity})}
function normalizeOcrText(t){return t.normalize("NFKC").replace(/\r/g,"").replace(/[‐‑‒–—―−ー]/g,"-").replace(/[ \t]+/g," ")}
function normalizeProductCode(v){const d=String(v||"").normalize("NFKC").toUpperCase().replace(/O/g,"0").replace(/[IL|]/g,"1").replace(/\D/g,"");return d.length>=7&&d.length<=8?d.padStart(8,"0"):d.slice(0,8)}
function isIntegerToken(v){return /^\d+$/.test(String(v).normalize("NFKC").replace(/[OＯ]/g,"0").replace(/[Il|]/g,"1").replace(/[,\s]/g,""))}
function parseInteger(v){return Number.parseInt(String(v).normalize("NFKC").replace(/[OＯ]/g,"0").replace(/[Il|]/g,"1").replace(/[^\d-]/g,""),10)}
function cleanProductName(v){return String(v||"").normalize("NFKC").replace(/[‐‑‒–—―−ー]/g,"-").replace(/\s+/g," ").replace(/^[\s:：・.]+|[\s:：・.]+$/g,"").trim()}
function detectViscosity(name){let v=String(name).normalize("NFKC").toUpperCase().replace(/[‐‑‒–—―−ー]/g,"-").replace(/Ｏ/g,"O").replace(/０/g,"0").replace(/\bO(?=\s*W)/g,"0").replace(/VV/g,"W");const m=v.match(/(?:^|[^0-9])((?:0|5|10|15|20))\s*W\s*-?\s*(8|12|16|20|30|40|50)(?:[^0-9]|$)/);return m?`${Number(m[1])}W-${Number(m[2])}`:"粘度不明"}
function makeRow(d){const name=cleanProductName(d.productName||"");return{id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,sourceFile:d.sourceFile||"手入力",pageNumber:+d.pageNumber||1,productCode:normalizeProductCode(d.productCode||""),productName:name,viscosity:d.viscosity||detectViscosity(name),quantity:Math.max(0,+d.quantity||0),category:d.category||detectCategory(name)}}
function detectCategory(name){return /(量り売り|量売り|量売|L迄|Lまで|レデマ|ﾚﾃﾞﾏ)/i.test(String(name).normalize("NFKC"))?"量り売り":"缶商品"}
function dedupePageRows(rows){const m=new Map();rows.forEach(r=>{const k=[r.sourceFile,r.pageNumber,r.productCode,normalizeCompareText(r.productName),r.quantity].join("|");if(!m.has(k))m.set(k,r)});return[...m.values()]}
function mergeExactDuplicateRows(rows){return dedupePageRows(rows)}
function getProductDictionary(){try{return JSON.parse(localStorage.getItem(PRODUCT_DICTIONARY_KEY)||"{}")}catch{return{}}}
function applyDictionary(r,d){const s=d[r.productCode];if(!s)return r;const name=s.productName||r.productName;return{...r,productName:name,viscosity:s.viscosity||detectViscosity(name),category:s.category||detectCategory(name)}}
function rememberProduct(r){if(!r.productCode||r.productCode==="00000000")return;const d=getProductDictionary();d[r.productCode]={productName:r.productName,viscosity:r.viscosity,category:r.category};localStorage.setItem(PRODUCT_DICTIONARY_KEY,JSON.stringify(d))}

function renderAll(){if(state.rows.length)els.resultsSection.classList.remove("hidden");renderKpis();renderViscosityFilter();renderSummary();renderDetailTable();els.ocrTextArea.value=state.rawText}
function getVisibleRows(){const s=normalizeCompareText(els.searchInput.value),v=els.viscosityFilter.value,includeBulk=els.includeBulkInput.checked;return state.rows.filter(r=>{if(!includeBulk&&r.category==="量り売り")return false;if(v&&r.viscosity!==v)return false;if(!s)return true;return[r.viscosity,r.productName,r.productCode,r.sourceFile].some(x=>normalizeCompareText(x).includes(s))})}
function renderKpis(){const rows=getVisibleRows(),total=rows.reduce((s,r)=>s+(+r.quantity||0),0),vis=new Set(rows.map(r=>r.viscosity)),products=new Set(rows.map(r=>`${r.productCode}|${normalizeCompareText(r.productName)}`)),unknown=rows.filter(r=>r.viscosity==="粘度不明").reduce((s,r)=>s+(+r.quantity||0),0);els.totalQuantityKpi.textContent=total.toLocaleString("ja-JP");els.viscosityCountKpi.textContent=vis.size.toLocaleString("ja-JP");els.productCountKpi.textContent=products.size.toLocaleString("ja-JP");els.unknownCountKpi.textContent=unknown.toLocaleString("ja-JP")}
function renderViscosityFilter(){const current=els.viscosityFilter.value,values=[...new Set(state.rows.map(r=>r.viscosity))].sort(compareViscosity);els.viscosityFilter.innerHTML='<option value="">すべての粘度</option>';values.forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;els.viscosityFilter.appendChild(o)});if(values.includes(current))els.viscosityFilter.value=current}
function groupSummary(rows){const vm=new Map();rows.forEach(r=>{if(!vm.has(r.viscosity))vm.set(r.viscosity,{viscosity:r.viscosity,totalQuantity:0,productMap:new Map(),products:[]});const g=vm.get(r.viscosity);g.totalQuantity+=+r.quantity||0;const key=r.productCode&&r.productCode!=="00000000"?r.productCode:normalizeCompareText(r.productName);if(!g.productMap.has(key))g.productMap.set(key,{productCode:r.productCode,productName:r.productName,quantity:0,categories:new Set()});const p=g.productMap.get(key);p.quantity+=+r.quantity||0;p.categories.add(r.category)});vm.forEach(g=>{g.products=[...g.productMap.values()].map(p=>({...p,unitLabel:p.categories.size===1&&p.categories.has("量り売り")?"件":"缶"}));delete g.productMap});return vm}
function renderSummary(){let groups=[...groupSummary(getVisibleRows()).values()];if(els.sortSelect.value==="quantity-desc")groups.sort((a,b)=>b.totalQuantity-a.totalQuantity||compareViscosity(a.viscosity,b.viscosity));else if(els.sortSelect.value==="product")groups.sort((a,b)=>(a.products[0]?.productName||"").localeCompare(b.products[0]?.productName||"","ja"));else groups.sort((a,b)=>compareViscosity(a.viscosity,b.viscosity));els.summaryContainer.innerHTML="";if(!groups.length){els.summaryContainer.innerHTML='<div class="empty-state">表示できる集計データがありません。</div>';return}groups.forEach((g,i)=>{const d=document.createElement("details");d.className="viscosity-card";d.open=i<3||g.viscosity==="粘度不明";const products=[...g.products].sort((a,b)=>b.quantity-a.quantity||a.productName.localeCompare(b.productName,"ja"));d.innerHTML=`<summary><span class="viscosity-name">${escapeHtml(g.viscosity)}</span><span class="viscosity-meta">${g.products.length}商品</span><span class="viscosity-total"><strong>${g.totalQuantity.toLocaleString("ja-JP")}</strong><span>販売数量合計</span></span></summary><div class="product-list">${products.map(p=>`<div class="product-row"><span class="product-code">${escapeHtml(p.productCode)}</span><span class="product-name">${escapeHtml(p.productName)}</span><span class="product-qty">${p.quantity.toLocaleString("ja-JP")}${escapeHtml(p.unitLabel)}</span></div>`).join("")}</div>`;els.summaryContainer.appendChild(d)})}
function renderDetailTable(){const rows=getVisibleRows();els.detailTableBody.innerHTML="";rows.forEach(r=>{const tr=document.createElement("tr");tr.dataset.rowId=r.id;tr.innerHTML=`<td><strong>${escapeHtml(r.sourceFile)}</strong><br><small>${r.pageNumber}ページ</small></td><td><input data-field="productCode" inputmode="numeric" maxlength="8" value="${escapeAttribute(r.productCode)}" aria-label="商品コード"></td><td><input data-field="productName" value="${escapeAttribute(r.productName)}" aria-label="商品名"></td><td><input data-field="viscosity" list="viscosityOptions" class="${r.viscosity==="粘度不明"?"unknown-input":""}" value="${escapeAttribute(r.viscosity)}" aria-label="粘度"></td><td><input data-field="quantity" type="number" min="0" step="1" value="${+r.quantity}" aria-label="販売数"></td><td><select data-field="category"><option value="缶商品" ${r.category==="缶商品"?"selected":""}>缶商品</option><option value="量り売り" ${r.category==="量り売り"?"selected":""}>量り売り</option></select></td><td><button class="delete-row-button" type="button">削除</button></td>`;tr.querySelectorAll("[data-field]").forEach(input=>input.addEventListener("change",()=>updateRowFromInput(r.id,input)));tr.querySelector(".delete-row-button").addEventListener("click",()=>{state.rows=state.rows.filter(x=>x.id!==r.id);renderAll();saveData(false)});els.detailTableBody.appendChild(tr)})}
function updateRowFromInput(id,input){const r=state.rows.find(x=>x.id===id);if(!r)return;const f=input.dataset.field;let v=input.value;if(f==="quantity")v=Math.max(0,Number.parseInt(v,10)||0);if(f==="productCode"){v=normalizeProductCode(v);input.value=v}if(f==="productName"){v=cleanProductName(v);r.productName=v;r.category=detectCategory(v);if(r.viscosity==="粘度不明")r.viscosity=detectViscosity(v)}else r[f]=v;if(f==="viscosity")r.viscosity=v.trim()||"粘度不明";rememberProduct(r);renderAll();saveData(false)}
function addBlankRow(){state.rows.push(makeRow({sourceFile:"手入力",pageNumber:1,productCode:"00000000",productName:"",viscosity:"粘度不明",quantity:0}));renderAll();activateTab("detail");requestAnimationFrame(()=>els.detailTableBody.querySelector("tr:last-child input[data-field='productName']")?.focus())}
function reparseRawText(){const text=els.ocrTextArea.value,chunks=text.split(/^===== .+? =====$/m),rows=[];chunks.forEach((c,i)=>rows.push(...parseTextRows(c,"OCR原文再解析",i+1)));if(!rows.length){showMessage("OCR原文から商品行を抽出できませんでした。明細タブから手入力してください。",true);return}const d=getProductDictionary();state.rows=mergeExactDuplicateRows(rows.map(r=>applyDictionary(r,d)));state.rawText=text;renderAll();saveData(false);showMessage(`${rows.length}件をOCR原文から再解析しました。`);activateTab("detail")}
function activateTab(name){document.querySelectorAll(".tab-button").forEach(b=>{const a=b.dataset.tab===name;b.classList.toggle("active",a);b.setAttribute("aria-selected",String(a))});document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));({summary:$("#summaryTab"),detail:$("#detailTab"),ocr:$("#ocrTab")})[name]?.classList.add("active")}

function saveData(showToast){const p={version:1,savedAt:new Date().toISOString(),rows:state.rows,rawText:state.rawText};localStorage.setItem(STORAGE_KEY,JSON.stringify(p));if(showToast)showMessage("現在のデータをこの端末に保存しました。")} 
function loadSavedData(){try{const s=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");if(!s?.rows?.length){showMessage("復元できる保存データがありません。",true);return}state.rows=s.rows.map(r=>({...makeRow(r),id:r.id||(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`)}));state.rawText=s.rawText||"";renderAll();showMessage(`${state.rows.length}件の保存データを復元しました。`)}catch(e){console.error(e);showMessage("保存データを読み込めませんでした。",true)}}
function resetAllData(){if(!window.confirm("読み取り結果と端末保存データをすべて削除します。よろしいですか？"))return;state.rows=[];state.rawText="";localStorage.removeItem(STORAGE_KEY);els.searchInput.value="";els.viscosityFilter.value="";els.resultsSection.classList.add("hidden");renderAll();showMessage("集計データを削除しました。")} 
function exportSummaryCsv(){const lines=[["粘度","商品コード","商品名","販売数","単位"]],groups=[...groupSummary(getVisibleRows()).values()].sort((a,b)=>compareViscosity(a.viscosity,b.viscosity));groups.forEach(g=>g.products.sort((a,b)=>b.quantity-a.quantity).forEach(p=>lines.push([g.viscosity,p.productCode,p.productName,p.quantity,p.unitLabel])));downloadCsv(lines,`エンジンオイル_粘度別商品集計_${dateStamp()}.csv`)}
function exportDetailCsv(){const lines=[["PDF名","ページ","商品コード","商品名","粘度","販売数","区分"]];getVisibleRows().forEach(r=>lines.push([r.sourceFile,r.pageNumber,r.productCode,r.productName,r.viscosity,r.quantity,r.category]));downloadCsv(lines,`エンジンオイル_読み取り明細_${dateStamp()}.csv`)}
function exportJson(){downloadBlob(JSON.stringify({version:1,exportedAt:new Date().toISOString(),rows:state.rows,rawText:state.rawText},null,2),`エンジンオイル集計バックアップ_${dateStamp()}.json`,"application/json;charset=utf-8")}
function downloadCsv(rows,name){downloadBlob("\uFEFF"+rows.map(r=>r.map(csvEscape).join(",")).join("\r\n"),name,"text/csv;charset=utf-8")}
function downloadBlob(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
function csvEscape(v){const t=String(v??"");return /[",\r\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t}
function showProgress(label,percent,detail=""){const p=Math.max(0,Math.min(100,+percent||0));els.progressArea.classList.remove("hidden");els.progressLabel.textContent=label;els.progressPercent.textContent=`${Math.round(p)}%`;els.progressBar.style.width=`${p}%`;els.progressDetail.textContent=detail}
function showMessage(msg,isError=false){els.messageBox.textContent=msg;els.messageBox.classList.remove("hidden","error");if(isError)els.messageBox.classList.add("error")}
function hideMessage(){els.messageBox.classList.add("hidden");els.messageBox.classList.remove("error")}
function compareViscosity(a,b){if(a==="粘度不明")return 1;if(b==="粘度不明")return-1;const p=v=>{const m=String(v).match(/^(\d+)W-(\d+)$/);return m?[+m[1],+m[2]]:[999,999]},[ac,ah]=p(a),[bc,bh]=p(b);return ac-bc||ah-bh||String(a).localeCompare(String(b),"ja")}
function normalizeCompareText(v){return String(v??"").normalize("NFKC").toUpperCase().replace(/\s+/g,"")}
function formatFileSize(b){if(b<1024)return`${b} B`;if(b<1024**2)return`${(b/1024).toFixed(1)} KB`;return`${(b/1024**2).toFixed(1)} MB`}
function isPdf(f){return f.type==="application/pdf"||f.name.toLowerCase().endsWith(".pdf")}
function clamp(v,min,max,fallback){return Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback}
function dateStamp(){const n=new Date(),p=v=>String(v).padStart(2,"0");return`${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}`}
function escapeHtml(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}
function escapeAttribute(v){return escapeHtml(v).replace(/`/g,"&#096;")}
