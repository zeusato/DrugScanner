/*
 * Drug Scanner PWA - Front-end Logic
 * Flow: Instruction -> Scan (Label) -> Review -> Confirm -> Scan (Barcode/Back) -> Review -> Confirm -> API
 */

// DOM Elements
const scanButton = document.getElementById('scanButton');
const instructionsDiv = document.getElementById('instructions');
const fileInput = document.getElementById('fileInput');
const resultsDiv = document.getElementById('results');
const keyModal = document.getElementById('keyModal');
const settingsModal = document.getElementById('settingsModal');
const settingsButton = document.getElementById('settingsButton');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveKeyButton = document.getElementById('saveKeyButton');
const changeKeyButton = document.getElementById('changeKeyButton');
const deleteKeyButton = document.getElementById('deleteKeyButton');
const closeSettingsButton = document.getElementById('closeSettingsButton');
const closeSettingsModalButton = document.getElementById('closeSettingsModalButton');
const keyStatus = document.getElementById('keyStatus');
// Review UI
const reviewContainer = document.getElementById('reviewContainer');
const reviewImage = document.getElementById('reviewImage');
const retakeButton = document.getElementById('retakeButton');
const confirmButton = document.getElementById('confirmButton');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const exportActions = document.getElementById('exportActions');
const exportPdfButton = document.getElementById('exportPdfButton');
const exportImageButton = document.getElementById('exportImageButton');

// Session Key
const SESSION_ID = 'drug_scanner_session';

// ========== STATE ==========
let imageCounter = 0; // 0: Front Label, 1: Back/Barcode
let capturedImages = [];
let currentDraft = null;
let isProcessingFile = false;
let lastResult = null;

// Instructions for each step
const INSTRUCTIONS = [
  'Bước 1/2: Chụp ảnh <strong>mặt trước (tên thuốc)</strong>',
  'Bước 2/2: Chụp ảnh <strong>mặt sau hoặc mã vạch</strong>'
];

// Trusted Search Sites
const TRUSTED_SITES = [
  'nhathuoclongchau.com.vn',
  'vinmec.com',
  'pharmacity.vn',
  'tamanhhospital.vn',
  'nhathuocankhang.com',
  'upharma.vn'
];

// ========== SHOW CURRENT STEP ==========
function showCurrentStep() {
  console.log('[UI] Showing step, counter =', imageCounter);

  // Reset UI states
  reviewContainer.classList.add('hidden');
  loadingOverlay.classList.add('hidden');
  resultsDiv.classList.add('hidden');

  if (imageCounter >= 2) return;

  // Show instruction
  instructionsDiv.innerHTML = `<p>${INSTRUCTIONS[imageCounter]}</p>`;
  scanButton.textContent = imageCounter === 0 ? 'SCAN' : 'TIẾP TỤC';
  scanButton.style.display = 'flex';
  scanButton.disabled = false;
}

// ========== SHOW REVIEW ==========
function showReview(dataUri) {
  console.log('[UI] Showing review');
  instructionsDiv.innerHTML = '';
  scanButton.style.display = 'none';

  reviewImage.src = dataUri;
  reviewContainer.classList.remove('hidden');
}

// ========== COMPRESS IMAGE ==========
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        const MAX = 1024; // Good balance for text readability
        if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ========== SCAN & INPUT ==========
scanButton.addEventListener('click', async (e) => {
  e.preventDefault();

  if (imageCounter >= 2) {
    // Reset flow
    await clearSession();
    imageCounter = 0;
    capturedImages = [];
    lastResult = null;
    resultsDiv.innerHTML = '';
    exportActions.classList.add('hidden');
    showCurrentStep();
    return;
  }

  if (isProcessingFile) return;

  fileInput.value = '';
  setTimeout(() => fileInput.click(), 50);
});

fileInput.addEventListener('change', async (e) => {
  if (isProcessingFile) return;
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  isProcessingFile = true;
  loadingOverlay.classList.remove('hidden'); // Short loading feedback
  loadingText.textContent = 'Đang xử lý ảnh...';

  try {
    const dataUri = await compressImage(file);
    currentDraft = dataUri;
    loadingOverlay.classList.add('hidden');
    showReview(currentDraft);
  } catch (err) {
    loadingOverlay.classList.add('hidden');
    alert('Lỗi xử lý ảnh: ' + err.message);
    showCurrentStep();
  } finally {
    isProcessingFile = false;
  }
});

// ========== REVIEW ACTIONS ==========
retakeButton.addEventListener('click', () => {
  currentDraft = null;
  showCurrentStep();
});

confirmButton.addEventListener('click', async () => {
  if (!currentDraft) return;

  capturedImages.push(currentDraft);
  imageCounter++;
  await saveSession(); // Save progress
  currentDraft = null;

  if (imageCounter >= 2) {
    processImages();
  } else {
    showCurrentStep();
  }
});

// ========== API PROCESSING ==========
async function processImages() {
  // Hide UI
  instructionsDiv.innerHTML = '';
  scanButton.style.display = 'none';
  reviewContainer.classList.add('hidden');
  loadingOverlay.classList.remove('hidden');
  loadingText.textContent = 'Đang phân tích dữ liệu...';

  try {
    const apiKey = await getKey();
    if (!apiKey) {
      throw new Error('Chưa cấu hình API Key. Vui lòng vào Cài đặt.');
    }

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    // Prepare inputs
    const imageParts = capturedImages.map(uri => {
      const base64Data = uri.split(',')[1];
      const mimeType = uri.split(';')[0].split(':')[1];
      return { inlineData: { data: base64Data, mimeType } };
    });

    const prompt = `
      Bạn là dược sĩ AI chuyên nghiệp. Hãy phân tích hình ảnh thuốc (mặt trước và mặt sau/mã vạch) và cung cấp thông tin chi tiết.

      Yêu cầu trả về JSON thuần túy (không có markdown code block) với cấu trúc sau:
      {
        "identity": {
          "name": "Tên thuốc",
          "active_ingredient": "Hoạt chất chính",
          "manufacturer": "Nhà sản xuất",
          "confidence": 0.95
        },
        "details": {
          "usage": "Chỉ định (Công dụng)",
          "dosage": [
            "Sơ sinh: ...",
            "Trẻ em 1-5 tuổi: ...",
            "Người lớn: ..."
          ],
          "contraindications": "Chống chỉ định (quan trọng)",
          "side_effects": "Tác dụng phụ thường gặp"
        },
        "warnings": ["Lưu ý quan trọng 1", "Lưu ý quan trọng 2"],
        "search_fallback": {
            "query": "Tên thuốc chính xác để tìm kiếm",
            "suggested_links": [
                {"title": "Long Châu", "url": "link tìm kiếm tại nhathuoclongchau.com.vn"},
                {"title": "Vinmec", "url": "link tìm kiếm tại vinmec.com"},
                {"title": "Pharmacity", "url": "link tìm kiếm tại pharmacity.vn"}
            ]
        }
      }

      LƯU Ý QUAN TRỌNG VỀ LIỀU DÙNG:
      - Bắt buộc phân chia liều dùng theo từng nhóm tuổi/đối tượng cụ thể.
      - Sắp xếp thứ tự từ nhỏ đến lớn: Sơ sinh -> Trẻ em (chia theo mốc tuổi) -> Người lớn -> Người già/Suy gan thận (nếu có).
      - Nếu thuốc không dùng cho đối tượng nào (ví dụ trẻ em), hãy ghi rõ "Chống chỉ định".

      Nếu không nhận diện được rõ ràng, hãy để confidence thấp và cung cấp "search_fallback" mạnh mẽ để người dùng tự tra cứu trên các trang uy tín sau: ${TRUSTED_SITES.join(', ')}.
    `;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text().replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    const data = JSON.parse(text);
    lastResult = data;
    displayResult(data);
    exportActions.classList.remove('hidden');

  } catch (err) {
    console.error(err);
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `<div class="error-msg">
      <h3>⚠️ Có lỗi xảy ra</h3>
      <p>${err.message}</p>
      <button class="outline-btn" onclick="location.reload()">Thử lại</button>
    </div>`;
  } finally {
    loadingOverlay.classList.add('hidden');
    // Reset state for new scan
    imageCounter = 2; // Keep at 2 to show "Scan New" logic if we wanted, but logic below handles it
    scanButton.textContent = 'QUÉT THUỐC KHÁC';
    scanButton.style.display = 'flex';
    scanButton.onclick = async () => {
      await clearSession();
      window.location.reload();
    };
    instructionsDiv.innerHTML = '<p>Đã hoàn thành.</p>';
    // Auto-scroll to show the "Scan New" button at top and results below
    setTimeout(() => {
      scanButton.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }
}

// ========== DISPLAY RESULT ==========
function displayResult(data) {
  resultsDiv.classList.remove('hidden');

  if (!data || !data.identity || data.identity.confidence < 0.4) {
    resultsDiv.innerHTML = `
      <h3>⚠️ Không nhận diện được thuốc</h3>
      <p>Hình ảnh có thể bị mờ hoặc không rõ tên thuốc.</p>
      ${data?.search_fallback ? buildFallbackLinks(data.search_fallback) : ''}
    `;
    return;
  }

  const { identity, details, warnings, search_fallback } = data;

  let html = `
    <h3>💊 ${identity.name}</h3>
    <p><strong>Hoạt chất:</strong> ${identity.active_ingredient}</p>
    <p><strong>NSX:</strong> ${identity.manufacturer}</p>
    <hr style="border: 0; border-top: 1px solid var(--border); margin: 10px 0;">
    
    <p><strong>Chỉ định:</strong> ${details.usage}</p>
    <div style="margin: 10px 0;">
        <strong>Liều dùng:</strong>
        ${Array.isArray(details.dosage)
      ? `<ul style="margin: 5px 0 0 20px; color: var(--text-secondary); list-style-type: disc;">${details.dosage.map(d => `<li>${d}</li>`).join('')}</ul>`
      : `<p style="display:inline;">${details.dosage}</p>`
    }
    </div>
    <p><strong>Chống chỉ định:</strong> ${details.contraindications}</p>
  `;

  if (warnings && warnings.length > 0) {
    html += `<div style="background: rgba(239, 68, 68, 0.1); padding: 10px; border-radius: 8px; margin-top: 10px;">
      <strong style="color: #fca5a5;">⚠️ Lưu ý quan trọng:</strong>
      <ul style="margin: 5px 0 0 20px; color: #fecaca;">
        ${warnings.map(w => `<li>${w}</li>`).join('')}
      </ul>
    </div>`;
  }

  html += buildFallbackLinks(search_fallback);

  resultsDiv.innerHTML = html;
}

function buildFallbackLinks(fallback) {
  if (!fallback) return '';

  // Generate links if AI didn't provide them perfectly, or strictly use AI's 
  // Ideally AI gives us good links, but we can also auto-generate reliable search links.
  const query = encodeURIComponent(fallback.query || 'thuốc');

  return `
      <div style="margin-top: 20px;">
        <p><strong>🔎 Tra cứu thêm tại:</strong></p>
        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
           <a href="https://nhathuoclongchau.com.vn/tim-kiem/${query}" target="_blank" class="outline-btn" style="padding: 8px 12px; font-size: 0.9em; text-decoration: none;">Long Châu</a>
           <a href="https://www.google.com/search?q=site:vinmec.com+${query}" target="_blank" class="outline-btn" style="padding: 8px 12px; font-size: 0.9em; text-decoration: none;">Vinmec</a>
           <a href="https://www.pharmacity.vn/tim-kiem/${query}" target="_blank" class="outline-btn" style="padding: 8px 12px; font-size: 0.9em; text-decoration: none;">Pharmacity</a>
        </div>
      </div>
    `;
}

// ========== INDEXEDDB & STORAGE ==========
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('DrugScannerDB', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      if (!db.objectStoreNames.contains('session')) db.createObjectStore('session');
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function getKey() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('settings', 'readonly').objectStore('settings').get('geminiKey');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveKey(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('settings', 'readwrite').objectStore('settings').put(key, 'geminiKey');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteKey() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('settings', 'readwrite').objectStore('settings').delete('geminiKey');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function saveSession() {
  try {
    const db = await openDB();
    const data = { imageCounter, capturedImages };
    const tx = db.transaction('session', 'readwrite');
    tx.objectStore('session').put(data, SESSION_ID);
  } catch (e) {
    console.error('Session save failed', e);
  }
}

async function loadSession() {
  try {
    const db = await openDB();
    const data = await new Promise(resolve => {
      const req = db.transaction('session', 'readonly').objectStore('session').get(SESSION_ID);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    if (data && typeof data.imageCounter === 'number') {
      imageCounter = data.imageCounter;
      capturedImages = data.capturedImages || [];
      return true;
    }
  } catch (e) { console.error(e); }
  return false;
}

async function clearSession() {
  try {
    const db = await openDB();
    const tx = db.transaction('session', 'readwrite');
    tx.objectStore('session').delete(SESSION_ID);
  } catch (e) { }
}

// ========== INITIALIZATION ==========
window.addEventListener('DOMContentLoaded', async () => {
  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
  }

  // PWA Install Logic
  let deferredPrompt;
  const installButton = document.getElementById('installButton');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installButton.classList.remove('hidden');
  });

  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    deferredPrompt = null;
    installButton.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    installButton.classList.add('hidden');
    deferredPrompt = null;
    console.log('PWA was installed');
  });

  // Modal Events
  const showModal = m => m.classList.add('show');
  const hideModal = m => m.classList.remove('show');

  // Check API Key
  const key = await getKey();
  if (!key) showModal(keyModal);
  keyStatus.textContent = key ? 'Đã lưu khóa API.' : 'Chưa có khóa API.';

  saveKeyButton.onclick = async () => {
    const val = apiKeyInput.value.trim();
    if (val) {
      await saveKey(val);
      hideModal(keyModal);
      keyStatus.textContent = 'Đã lưu khóa API.';
    }
  };

  // Settings Button Logic
  settingsButton.onclick = () => {
    // Check key status again when opening settings
    getKey().then(k => {
      keyStatus.textContent = k ? 'Đã lưu khóa API.' : 'Chưa có khóa API.';
      showModal(settingsModal);
    });
  };

  changeKeyButton.onclick = () => { hideModal(settingsModal); showModal(keyModal); };
  deleteKeyButton.onclick = async () => { await deleteKey(); hideModal(settingsModal); showModal(keyModal); keyStatus.textContent = 'Chưa có khóa API.'; };
  closeSettingsModalButton.onclick = () => hideModal(settingsModal);

  // Always start fresh on load (prevent auto-query or partial state restoration)
  showCurrentStep();
});

// ========== EXPORT: PDF ==========
exportPdfButton.addEventListener('click', () => exportPDF());

async function exportPDF() {
  if (!lastResult) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 210, H = 297;
  const M = 15;
  const CW = W - M * 2;
  let y = M;

  function addText(text, size, style, color, maxW) {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxW || CW);
    if (y + lines.length * (size * 0.45) > H - M) {
      doc.addPage();
      y = M;
    }
    doc.text(lines, M, y);
    y += lines.length * (size * 0.45) + 2;
  }

  function addLine() {
    doc.setDrawColor(200);
    doc.line(M, y, W - M, y);
    y += 4;
  }

  // -- Header --
  doc.setFillColor(13, 148, 136); // teal-600
  doc.rect(0, 0, W, 32, 'F');
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Drug Scanner', M, 15);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 240, 235);
  const now = new Date();
  doc.text(`Bao cao phan tich - ${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN')}`, M, 23);
  y = 40;

  // -- Captured Images --
  if (capturedImages.length > 0) {
    addText('ANH DA CHUP', 12, 'bold', [13, 148, 136]);
    y += 2;
    const imgW = (CW - 4) / 2;
    const imgH = imgW * 1.1;
    const labels = ['Mat truoc', 'Mat sau / Ma vach'];
    capturedImages.forEach((dataUri, i) => {
      const x = M + i * (imgW + 4);
      try {
        doc.addImage(dataUri, 'JPEG', x, y, imgW, imgH);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(120, 120, 120);
        doc.text(labels[i] || `Anh ${i + 1}`, x + imgW / 2, y + imgH + 4, { align: 'center' });
      } catch (e) {
        console.warn('[PDF] Image insert failed:', e);
      }
    });
    y += imgH + 10;
    addLine();
  }

  // -- Identity --
  if (lastResult.identity) {
    const id = lastResult.identity;
    addText('NHAN DIEN THUOC', 12, 'bold', [13, 148, 136]);
    if (id.name) addText(`Ten thuoc: ${id.name}`, 11, 'normal', [40, 40, 40]);
    if (id.active_ingredient) addText(`Hoat chat: ${id.active_ingredient}`, 10, 'normal', [90, 90, 90]);
    if (id.manufacturer) addText(`Nha san xuat: ${id.manufacturer}`, 10, 'normal', [90, 90, 90]);
    if (id.confidence) addText(`Do tin cay: ${Math.round(id.confidence * 100)}%`, 10, 'normal', [90, 90, 90]);
    y += 2;
    addLine();
  }

  // -- Details --
  if (lastResult.details) {
    const d = lastResult.details;
    addText('THONG TIN CHI TIET', 12, 'bold', [13, 148, 136]);
    if (d.usage) addText(`Chi dinh: ${d.usage}`, 10, 'normal', [40, 40, 40]);
    if (d.dosage) {
      addText('Lieu dung:', 10, 'bold', [40, 40, 40]);
      const doses = Array.isArray(d.dosage) ? d.dosage : [d.dosage];
      doses.forEach(dose => addText(`  - ${dose}`, 9, 'normal', [60, 60, 60]));
    }
    if (d.contraindications) addText(`Chong chi dinh: ${d.contraindications}`, 10, 'normal', [40, 40, 40]);
    if (d.side_effects) addText(`Tac dung phu: ${d.side_effects}`, 10, 'normal', [40, 40, 40]);
    y += 2;
    addLine();
  }

  // -- Warnings --
  if (lastResult.warnings?.length) {
    addText('LUU Y QUAN TRONG', 12, 'bold', [220, 50, 50]);
    lastResult.warnings.forEach(w => addText(`! ${w}`, 10, 'normal', [180, 60, 60]));
    y += 2;
    addLine();
  }

  // -- Search Fallback --
  if (lastResult.search_fallback?.query) {
    addText('TRA CUU THEM', 12, 'bold', [13, 148, 136]);
    addText(`Tu khoa tim kiem: ${lastResult.search_fallback.query}`, 10, 'normal', [40, 40, 40]);
    addText('Long Chau | Vinmec | Pharmacity', 9, 'italic', [90, 90, 90]);
  }

  // -- Footer --
  const pagesCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pagesCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text('Drug Scanner', M, H - 8);
    doc.text(`Trang ${p}/${pagesCount}`, W - M, H - 8, { align: 'right' });
  }

  const drugName = lastResult.identity?.name || 'DrugScan';
  doc.save(`${drugName.replace(/[^a-zA-Z0-9\u00C0-\u1EF9\s]/g, '')}_report.pdf`);
}

// ========== EXPORT: IMAGE ==========
exportImageButton.addEventListener('click', () => exportImage());

async function exportImage() {
  if (!resultsDiv || resultsDiv.classList.contains('hidden')) return;

  const origMaxH = resultsDiv.style.maxHeight;
  const origOverflow = resultsDiv.style.overflow;
  resultsDiv.style.maxHeight = 'none';
  resultsDiv.style.overflow = 'visible';

  try {
    const canvas = await html2canvas(resultsDiv, {
      backgroundColor: '#0f172a',
      scale: 2,
      useCORS: true,
      logging: false
    });
    const link = document.createElement('a');
    link.download = 'drug-scan-result.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('[EXPORT IMAGE] Error:', err);
    alert('Khong the tai anh. Vui long thu lai.');
  } finally {
    resultsDiv.style.maxHeight = origMaxH;
    resultsDiv.style.overflow = origOverflow;
  }
}