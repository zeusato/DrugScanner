/*
 * Main script for the drug scanner PWA.
 *
 * This file orchestrates capturing two photos (label and barcode),
 * extracting identity fields using Gemini 3.0 flash via the Google
 * Generative AI SDK, sending the extracted data to the backend for
 * lookup against public drug databases, and presenting the results
 * to the user. It also manages storing the user's Gemini API key
 * locally in IndexedDB and showing a modal when the key is missing.
 */

// Simple IndexedDB helper functions for storing/retrieving the API key
const DB_NAME = 'drug-scanner-db';
const STORE_NAME = 'settings';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function getApiKey() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get('apiKey');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function setApiKey(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(STORE_NAME);
    store.put(key, 'apiKey');
  });
}

// UI element references
const apiModal = document.getElementById('api-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key');
const startScanBtn = document.getElementById('start-scan');
const scanContainer = document.getElementById('scan-container');
const cameraVideo = document.getElementById('camera');
const overlay = document.getElementById('overlay');
const captureBtn = document.getElementById('capture-btn');
const previewContainer = document.getElementById('preview-container');
const preview1Img = document.getElementById('preview1');
const preview2Img = document.getElementById('preview2');
const submitBtn = document.getElementById('submit-btn');
const retakeBtn = document.getElementById('retake-btn');
const resultContainer = document.getElementById('result-container');
const resultContent = document.getElementById('result-content');
const newScanBtn = document.getElementById('new-scan');
const loadingOverlay = document.getElementById('loading-overlay');

// Global state
let apiKey = null;
let currentStream = null;
let step = 0;
const capturedImages = [];

async function init() {
  apiKey = await getApiKey();
  if (!apiKey) {
    // Show modal for API key
    apiModal.classList.remove('hidden');
  }
  registerServiceWorker();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      console.warn('Service worker registration failed');
    });
  }
}

saveApiKeyBtn.addEventListener('click', async () => {
  const value = apiKeyInput.value.trim();
  if (!value) return;
  apiKey = value;
  await setApiKey(apiKey);
  apiModal.classList.add('hidden');
});

startScanBtn.addEventListener('click', async () => {
  // Reset state
  capturedImages.length = 0;
  step = 0;
  resultContainer.classList.add('hidden');
  previewContainer.classList.add('hidden');
  startScanBtn.parentElement.classList.add('hidden');
  scanContainer.classList.remove('hidden');
  overlay.textContent = 'Chụp ảnh nhãn thuốc (mặt trước)';
  try {
    await startCamera();
  } catch (err) {
    alert('Không thể truy cập camera. Vui lòng cấp quyền.');
    console.error(err);
  }
});

async function startCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
  }
  const constraints = {
    video: {
      facingMode: 'environment'
    }
  };
  currentStream = await navigator.mediaDevices.getUserMedia(constraints);
  cameraVideo.srcObject = currentStream;
  await cameraVideo.play();
}

captureBtn.addEventListener('click', async () => {
  if (!currentStream) return;
  // Capture a frame from the video
  const canvas = document.createElement('canvas');
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  capturedImages.push(dataUrl);
  step++;
  if (step === 1) {
    overlay.textContent = 'Chụp ảnh mã vạch (QR) hoặc ảnh bổ sung';
  }
  if (step >= 2) {
    // Stop camera and show preview
    currentStream.getTracks().forEach((t) => t.stop());
    scanContainer.classList.add('hidden');
    previewContainer.classList.remove('hidden');
    preview1Img.src = capturedImages[0];
    preview2Img.src = capturedImages[1];
  }
});

retakeBtn.addEventListener('click', () => {
  // Reset and restart scanning
  capturedImages.length = 0;
  step = 0;
  previewContainer.classList.add('hidden');
  startScanBtn.parentElement.classList.add('hidden');
  resultContainer.classList.add('hidden');
  scanContainer.classList.remove('hidden');
  overlay.textContent = 'Chụp ảnh nhãn thuốc (mặt trước)';
  startCamera().catch((err) => {
    console.error(err);
  });
});

submitBtn.addEventListener('click', async () => {
  if (!apiKey) {
    apiModal.classList.remove('hidden');
    return;
  }
  loadingOverlay.classList.remove('hidden');
  try {
    // Extract identity fields via Gemini
    const identity = await extractIdentity(capturedImages);
    // Attempt to decode barcode from second image if supported
    let barcodeStr = '';
    try {
      if ('BarcodeDetector' in window && capturedImages[1]) {
        const bd = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code', 'data_matrix'] });
        const img = await loadImageBitmap(capturedImages[1]);
        const detections = await bd.detect(img);
        if (detections.length > 0) {
          barcodeStr = detections[0].rawValue || '';
        }
      }
    } catch (err) {
      console.warn('Barcode detection failed', err);
    }
    // Send to backend
    const response = await fetch('/api/identify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ identity, barcode: barcodeStr })
    });
    const result = await response.json();
    showResult(result);
  } catch (err) {
    console.error(err);
    showResult({ status: 'Not_Found' });
  } finally {
    loadingOverlay.classList.add('hidden');
  }
});

newScanBtn.addEventListener('click', () => {
  resultContainer.classList.add('hidden');
  capturedImages.length = 0;
  step = 0;
  startScanBtn.parentElement.classList.remove('hidden');
});

// Utility: load an image into an ImageBitmap for BarcodeDetector
async function loadImageBitmap(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return await createImageBitmap(blob);
}

// Use the Google Generative AI SDK to extract structured identity
// information from the captured images. Returns an object with
// fields such as ndc, brand_name, generic_name, dosage_form, etc.
async function extractIdentity(images) {
  // Dynamically import the SDK
  // Import the Google Generative AI SDK from a CDN. Using esm.run allows
  // us to load the package directly in the browser without bundling. The
  // package exports the GoogleGenerativeAI class along with HarmCategory
  // and HarmBlockThreshold enums.
  const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = await import('https://esm.run/@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  // Build the prompt. Provide the images as base64 within parts.
  const contents = [
    {
      role: 'user',
      parts: images.map((dataUrl) => {
        const base64 = dataUrl.split(',')[1];
        return { inline_data: { mime_type: 'image/jpeg', data: base64 } };
      })
    },
    {
      role: 'user',
      parts: [
        {
          text: [
            'You are an assistant that extracts structured pharmaceutical identification fields from images of drug packaging.\n',
            'The first image is the front label of the medicine, the second image is either the barcode/QR code or a supplemental view.\n',
            'Return a JSON object containing as many of the following fields as possible: ndc, product_ndc, gtin, barcode (digits only), brand_name, generic_name, dosage_form, strength, route.\n',
            'If a field cannot be confidently determined, omit it from the output.\n',
            'Respond ONLY with a JSON object without markdown formatting.'
          ].join('')
        }
      ]
    }
  ];
  const generationConfig = {
    temperature: 0.0,
    maxOutputTokens: 512,
    response_mime_type: 'application/json'
  };
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
  ];
  const result = await model.generateContent({ contents, generationConfig, safetySettings });
  let json;
  try {
    json = JSON.parse(result.response.candidates[0].content.parts[0].text);
  } catch (err) {
    console.warn('Failed to parse identity JSON', err);
    json = {};
  }
  return json;
}

function showResult(result) {
  resultContainer.classList.remove('hidden');
  startScanBtn.parentElement.classList.add('hidden');
  previewContainer.classList.add('hidden');
  scanContainer.classList.add('hidden');
  if (result.status === 'OK' && result.drug) {
    const d = result.drug;
    // Build a friendly display
    const pieces = [];
    pieces.push(`<h2>${d.brand_name || d.generic_name || 'Thuốc'}</h2>`);
    if (d.generic_name) pieces.push(`<p><strong>Hoạt chất:</strong> ${d.generic_name}</p>`);
    if (d.dosage_form) pieces.push(`<p><strong>Dạng bào chế:</strong> ${d.dosage_form}</p>`);
    if (d.ndc) pieces.push(`<p><strong>NDC:</strong> ${d.ndc}</p>`);
    if (d.route) pieces.push(`<p><strong>Đường dùng:</strong> ${d.route}</p>`);
    if (d.strength) pieces.push(`<p><strong>Hàm lượng:</strong> ${d.strength}</p>`);
    if (d.active_ingredients) {
      pieces.push(`<p><strong>Thành phần hoạt chất:</strong> ${Array.isArray(d.active_ingredients) ? d.active_ingredients.join(', ') : d.active_ingredients}</p>`);
    }
    if (d.indications) pieces.push(`<p><strong>Chỉ định:</strong> ${d.indications}</p>`);
    if (d.dosage) pieces.push(`<p><strong>Liều dùng và cách dùng:</strong> ${d.dosage}</p>`);
    if (d.warnings) pieces.push(`<p><strong>Cảnh báo:</strong> ${d.warnings}</p>`);
    pieces.push('<h3>Nguồn</h3>');
    if (result.sources && result.sources.length > 0) {
      pieces.push('<ul>');
      for (const s of result.sources) {
        pieces.push(`<li><a href="${s.url}" target="_blank" rel="noopener">${s.name}</a></li>`);
      }
      pieces.push('</ul>');
    } else {
      pieces.push('<p>Không tìm thấy nguồn.</p>');
    }
    resultContent.innerHTML = pieces.join('');
  } else {
    resultContent.innerHTML = '<p>Không tìm thấy thông tin thuốc. Vui lòng kiểm tra lại ảnh và thử lại.</p>';
  }
}

// Initialize the app on load
window.addEventListener('DOMContentLoaded', init);