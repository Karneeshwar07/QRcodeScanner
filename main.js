import { BrowserMultiFormatReader } from '@zxing/browser';
import QRCode from 'qrcode';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const STORAGE_KEY = 'universal-scanner-premium-v1';
const reader = new BrowserMultiFormatReader();
let scannerControls = null;
let cameraStarting = false;
let scanHandled = false;
let devices = [];
let activeDevice = 0;
let cameraDeviceChosen = false;
let torchOn = false;
let deferredInstallPrompt = null;
let currentTemplate = 'text';
let currentQrValue = '';
let lastScan = { value: '', at: 0 };

const templates = [
  { id: 'text', icon: 'T', label: 'Text' },
  { id: 'url', icon: '⌁', label: 'Website' },
  { id: 'wifi', icon: '◉', label: 'Wi‑Fi' },
  { id: 'contact', icon: '☻', label: 'Contact' },
  { id: 'email', icon: '✉', label: 'Email' },
  { id: 'phone', icon: '☎', label: 'Phone' },
];

const storeRewards = [
  { id: 'voucher-25', icon: '🎟️', title: '₹25 voucher', description: 'Demo reward for your future store', cost: 2500 },
  { id: 'voucher-50', icon: '🎁', title: '₹50 voucher', description: 'Preview redemption reward', cost: 4500 },
  { id: 'scanner-pro', icon: '✨', title: 'Scanner Pro badge', description: 'A profile collectible', cost: 1000 },
];

const achievementDefinitions = [
  { icon: '🌱', title: 'First scan', detail: 'Scan one code', test: (s) => s.scans.length >= 1 },
  { icon: '🎯', title: 'Ten scans', detail: 'Scan ten codes', test: (s) => s.scans.length >= 10 },
  { icon: '🏆', title: 'QR master', detail: 'Scan 100 codes', test: (s) => s.scans.length >= 100 },
  { icon: '📦', title: 'Barcode hunter', detail: 'Scan a product barcode', test: (s) => s.scans.some((x) => x.type === 'product') },
  { icon: '🔥', title: 'On fire', detail: 'Maintain a 7-day streak', test: (s) => s.streak.count >= 7 },
  { icon: '✦', title: 'Creator', detail: 'Generate your first QR', test: (s) => s.generatedTotal >= 1 },
];

const freshState = () => ({
  coins: 0,
  scans: [],
  redeemed: [],
  generatedTotal: 0,
  streak: { count: 0, lastDay: null },
  missions: { day: today(), scans: 0, products: 0, generated: 0, claimed: {} },
  settings: { sound: true, haptic: true },
});

function today() { return new Date().toISOString().slice(0, 10); }
function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }
function loadState() {
  try { return { ...freshState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return freshState(); }
}
let state = loadState();
if (!state.missions || state.missions.day !== today()) state.missions = freshState().missions;
state.settings = { sound: true, haptic: true, ...(state.settings || {}) };
state.streak = { count: 0, lastDay: null, ...(state.streak || {}) };
state.scans = Array.isArray(state.scans) ? state.scans : [];
state.redeemed = Array.isArray(state.redeemed) ? state.redeemed : [];

function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function short(value, count = 56) { return value.length > count ? `${value.slice(0, count - 1)}…` : value; }
function toast(message, error = false) {
  const item = document.createElement('div');
  item.className = `toast${error ? ' error' : ''}`;
  item.textContent = message;
  $('#toast-region').append(item);
  setTimeout(() => item.remove(), 3200);
}
function formatDate(timestamp) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp)); }

function goTo(page) {
  $$('.page').forEach((node) => node.classList.toggle('active', node.id === `${page}-page`));
  $$('.nav-item').forEach((node) => node.classList.toggle('active', node.dataset.page === page));
  if (page !== 'scan') stopCamera();
  if (page === 'history') renderHistory();
  if (page === 'rewards') renderRewards();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function classify(value) {
  const clean = String(value || '').trim();
  const lower = clean.toLowerCase();
  if (/^wifi:/i.test(clean)) return { type: 'wifi', icon: '◉', title: 'Wi‑Fi network', action: 'Copy network details', safe: true, value: clean };
  if (/^upi:\/\//i.test(clean)) return { type: 'upi', icon: '₹', title: 'UPI payment request', action: 'Payment preview', safe: true, value: clean };
  if (/^(https?:\/\/)/i.test(clean)) {
    const suspicious = /(bit\.ly|tinyurl|\.zip(?:\/|$)|\.click(?:\/|$)|free[-_]?gift|verify[-_]?account|login[-_]?secure)/i.test(clean);
    return { type: 'url', icon: '⌁', title: 'Website', action: 'Open website', safe: !suspicious, value: clean };
  }
  if (/^mailto:/i.test(clean) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { type: 'email', icon: '✉', title: 'Email address', action: 'Compose email', safe: true, value: clean.replace(/^mailto:/i, '') };
  if (/^(tel:)?\+?[0-9()\s-]{7,}$/i.test(clean)) return { type: 'phone', icon: '☎', title: 'Phone number', action: 'Call number', safe: true, value: clean.replace(/^tel:/i, '') };
  if (/^\d{8,14}$/.test(clean)) return { type: 'product', icon: '▦', title: 'Product barcode', action: 'Find product', safe: true, value: clean };
  return { type: 'text', icon: 'T', title: 'Text', action: 'Copy text', safe: true, value: clean || 'Empty code' };
}

function actionButton(label, callback, primary = false) {
  const button = document.createElement('button');
  button.textContent = label;
  if (primary) button.className = 'primary-action';
  button.addEventListener('click', callback);
  return button;
}
async function copyText(value) {
  try { await navigator.clipboard.writeText(value); toast('Copied to clipboard'); }
  catch { toast('Copy is not available in this browser', true); }
}
async function shareText(data) {
  if (navigator.share) {
    try { await navigator.share(data); } catch { /* User dismissed the share sheet. */ }
  } else copyText(data.url || data.text || '');
}

function showResult(item, reward = 0) {
  $('#result-card').classList.remove('hidden');
  $('#result-icon').textContent = item.icon;
  $('#result-title').textContent = item.title;
  $('#result-kicker').textContent = item.type === 'product' ? 'BARCODE DETECTED' : 'CODE DETECTED';
  $('#result-value').textContent = item.value;
  $('#coins-earned').textContent = reward ? `+${reward} coins earned` : 'Saved to your history';
  const safety = $('#safety-pill');
  safety.className = `safety-pill ${item.safe ? 'safe' : 'warning'}`;
  safety.textContent = item.safe ? '🛡 Looks safe based on a quick local check' : '⚠ Link looks suspicious — inspect before opening';
  const actions = $('#result-actions');
  actions.replaceChildren();
  const primaryLabel = item.type === 'url' ? 'Open' : item.type === 'product' ? 'Find product' : item.type === 'phone' ? 'Call' : item.type === 'email' ? 'Email' : item.type === 'upi' ? 'Preview' : 'Copy';
  actions.append(actionButton(primaryLabel, () => performPrimaryAction(item), true));
  actions.append(actionButton('Copy', () => copyText(item.value)));
  actions.append(actionButton('Share', () => shareText({ title: item.title, text: item.value, url: item.type === 'url' ? item.value : undefined })));
}
function performPrimaryAction(item) {
  if (item.type === 'url') { if (!item.safe && !confirm('This link may be unsafe. Open it anyway?')) return; window.open(item.value, '_blank', 'noopener'); return; }
  if (item.type === 'product') { window.open(`https://www.google.com/search?q=${encodeURIComponent(`${item.value} barcode product`)}`, '_blank', 'noopener'); return; }
  if (item.type === 'phone') { window.location.href = `tel:${item.value}`; return; }
  if (item.type === 'email') { window.location.href = `mailto:${item.value}`; return; }
  if (item.type === 'upi') { window.location.href = item.value; return; }
  copyText(item.value);
}

function awardCompletedMissions() {
  const missions = [
    { key: 'scans', target: 3, coins: 100, label: '3 scans' },
    { key: 'products', target: 1, coins: 50, label: 'a barcode' },
    { key: 'generated', target: 1, coins: 25, label: 'a QR creation' },
  ];
  missions.forEach((mission) => {
    if (state.missions[mission.key] >= mission.target && !state.missions.claimed[mission.key]) {
      state.missions.claimed[mission.key] = true;
      state.coins += mission.coins;
      toast(`Mission complete: ${mission.label} +${mission.coins} coins`);
    }
  });
}
function updateStreak() {
  if (state.streak.lastDay === today()) return;
  state.streak.count = state.streak.lastDay === yesterday() ? state.streak.count + 1 : 1;
  state.streak.lastDay = today();
}
function playSuccessFeedback() {
  if (state.settings.haptic && navigator.vibrate) navigator.vibrate(35);
  if (!state.settings.sound) return;
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.frequency.setValueAtTime(720, context.currentTime); gain.gain.setValueAtTime(.05, context.currentTime);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .08);
  } catch { /* Audio is optional. */ }
}
function recordScan(value, format = '') {
  const now = Date.now();
  if (lastScan.value === value && now - lastScan.at < 2200) { stopCamera(); toast('This code was just scanned.'); return; }
  lastScan = { value, at: now };
  const item = { id: crypto.randomUUID?.() || `${now}`, ...classify(value), format, createdAt: now, favorite: false };
  const reward = item.type === 'product' ? 15 : 10;
  state.scans.unshift(item); state.scans = state.scans.slice(0, 150);
  state.coins += reward; state.missions.scans += 1;
  if (item.type === 'product') state.missions.products += 1;
  updateStreak(); awardCompletedMissions(); persist(); renderAll(); showResult(item, reward); stopCamera();
}

async function startCamera() {
  if (cameraStarting || scannerControls) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Camera requires HTTPS (or localhost) and a supported browser.', true);
    $('#camera-status').textContent = 'CAMERA NOT AVAILABLE';
    return;
  }
  cameraStarting = true;
  scanHandled = false;
  const video = $('#scanner-video');

  try {
    // Do not guess a device ID before permission is granted. On some phones
    // labels are hidden until permission and the last device may be a virtual cam.
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.muted = true;
    video.style.display = 'block';
    $('#camera-placeholder').style.display = 'none';
    $('#result-card').classList.add('hidden');
    $('#camera-card').classList.remove('detected');
    $('#camera-card').classList.add('scanning');
    $('#camera-status').textContent = 'REQUESTING CAMERA…';
    $('#camera-button').innerHTML = '<span>■</span><span>Stop scan</span>';
    $('#camera-button').disabled = true;

    const selectedDevice = cameraDeviceChosen ? devices[activeDevice] : null;
    const videoConstraint = selectedDevice?.deviceId
      ? { deviceId: { exact: selectedDevice.deviceId } }
      : { facingMode: { ideal: 'environment' } };
    const constraints = { audio: false, video: videoConstraint };
    let controls;
    try {
      controls = await reader.decodeFromConstraints(constraints, video, (result) => {
        if (!result || scanHandled) return;
        scanHandled = true;
        $('#camera-card').classList.add('detected');
        $('#camera-status').textContent = '✓ CODE DETECTED';
        playSuccessFeedback();
        const text = result.getText();
        const format = result.getBarcodeFormat?.() || '';
        window.setTimeout(() => recordScan(text, format), 360);
      });
    } catch (firstError) {
      // Fallback for browsers that do not support the constraints-based ZXing path.
      controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (!result || scanHandled) return;
        scanHandled = true;
        $('#camera-card').classList.add('detected');
        $('#camera-status').textContent = '✓ CODE DETECTED';
        playSuccessFeedback();
        const text = result.getText();
        const format = result.getBarcodeFormat?.() || '';
        window.setTimeout(() => recordScan(text, format), 360);
      });
    }
    scannerControls = controls;
    const stream = video.srcObject;
    const track = stream?.getVideoTracks?.()[0];
    devices = await reader.listVideoInputDevices().catch(() => []);
    const settings = track?.getSettings?.() || {};
    const foundDevice = devices.findIndex((d) => d.deviceId === settings.deviceId);
    if (foundDevice >= 0) activeDevice = foundDevice;
    cameraDeviceChosen = true;
    const capabilities = track?.getCapabilities?.() || {};
    const hasTorch = Boolean(capabilities.torch);
    $('#flash-button').disabled = !hasTorch;
    $('#flash-button').title = hasTorch ? 'Toggle camera torch' : 'Flash is not supported by this camera';
    $('#camera-switch').disabled = devices.length < 2;
    $('#camera-status').textContent = 'SCANNING • ALIGN CODE IN FRAME';
    await video.play().catch(() => {});
  } catch (error) {
    stopCamera();
    const message = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
      ? 'Camera permission is blocked. Allow camera access for this site, then reload.'
      : error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError'
        ? 'No camera was found. Check that your camera is connected.'
        : error?.name === 'NotReadableError' || error?.name === 'TrackStartError'
          ? 'The camera is busy. Close Camera/Teams/Zoom and try again.'
          : error?.name === 'OverconstrainedError'
            ? 'This camera cannot use the requested mode. Try switching cameras.'
            : `Camera failed: ${error?.message || error?.name || 'unknown error'}`;
    $('#camera-status').textContent = 'CAMERA ERROR';
    toast(message, true);
  } finally {
    cameraStarting = false;
    $('#camera-button').disabled = false;
  }
}

function stopCamera() {
  try { scannerControls?.stop?.(); } catch { /* Camera may already be stopped. */ }
  scannerControls = null;
  const video = $('#scanner-video');
  try { video.srcObject?.getTracks?.().forEach((track) => track.stop()); } catch { /* Ignore cleanup errors. */ }
  video.srcObject = null;
  video.style.display = 'none';
  $('#camera-placeholder').style.display = 'grid';
  $('#camera-card').classList.remove('scanning', 'detected');
  $('#camera-status').textContent = 'CAMERA OFF';
  $('#camera-button').innerHTML = '<span>⌁</span><span>Start scan</span>';
  $('#flash-button').disabled = true;
  $('#camera-switch').disabled = true;
  $('#flash-button').style.color = '';
  torchOn = false;
  scanHandled = false;
}

async function switchCamera() {
  if (devices.length < 2) return;
  activeDevice = (activeDevice + 1) % devices.length;
  cameraDeviceChosen = true;
  stopCamera();
  await startCamera();
}

async function toggleFlash() {
  const track = $('#scanner-video').srcObject?.getVideoTracks?.()[0];
  if (!track) { toast('Start scanning before using flash.', true); return; }
  const capabilities = track.getCapabilities?.() || {};
  if (!capabilities.torch) {
    $('#flash-button').disabled = true;
    toast('Flash is not supported by this camera. Try a phone rear camera.', true);
    return;
  }
  try {
    const next = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: next }] });
    torchOn = next;
    $('#flash-button').style.color = torchOn ? 'var(--amber)' : '';
    toast(torchOn ? 'Flash on' : 'Flash off');
  } catch (error) {
    toast(`Could not change flash: ${error?.message || 'camera does not allow torch control'}`, true);
  }
}

async function scanGallery(file) {
  if (!file) return;
  stopCamera();
  try {
    toast('Reading image…');
    const url = URL.createObjectURL(file);
    try {
      const result = await reader.decodeFromImageUrl(url);
      recordScan(result.getText(), result.getBarcodeFormat?.() || '');
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    toast('No readable QR code or barcode was found in that image. Try a sharper, well-lit photo.', true);
  } finally {
    $('#gallery-input').value = '';
  }
}

function fieldsFor(template) {
  const field = (label, name, placeholder, textarea = false) => `<label class="field"><span>${label}</span>${textarea ? `<textarea name="${name}" placeholder="${placeholder}" required></textarea>` : `<input name="${name}" placeholder="${placeholder}" required />`}</label>`;
  if (template === 'url') return field('Website address', 'url', 'https://example.com');
  if (template === 'wifi') return `${field('Network name', 'ssid', 'Home Wi‑Fi')}${field('Password', 'password', 'Password')}<label class="field"><span>Security</span><select name="security"><option>WPA</option><option>WEP</option><option>nopass</option></select></label>`;
  if (template === 'contact') return `${field('Full name', 'name', 'Alex Morgan')}${field('Phone number', 'phone', '+91 98765 43210')}${field('Email', 'email', 'alex@example.com')}`;
  if (template === 'email') return `${field('Email address', 'email', 'hello@example.com')}${field('Subject', 'subject', 'Hello')}${field('Message', 'message', 'Write your message', true)}`;
  if (template === 'phone') return field('Phone number', 'phone', '+91 98765 43210');
  return field('Your text', 'text', 'Write something useful', true);
}
function renderTemplates() {
  $('#template-grid').innerHTML = templates.map((template) => `<button class="template-card ${template.id === currentTemplate ? 'active' : ''}" data-template="${template.id}"><span>${template.icon}</span>${template.label}</button>`).join('');
  $('#generator-fields').innerHTML = fieldsFor(currentTemplate);
}
function generateValue(data) {
  if (currentTemplate === 'url') return data.get('url').match(/^https?:\/\//i) ? data.get('url') : `https://${data.get('url')}`;
  if (currentTemplate === 'wifi') return `WIFI:T:${data.get('security')};S:${data.get('ssid')};P:${data.get('password')};;`;
  if (currentTemplate === 'contact') return `BEGIN:VCARD\nVERSION:3.0\nFN:${data.get('name')}\nTEL:${data.get('phone')}\nEMAIL:${data.get('email')}\nEND:VCARD`;
  if (currentTemplate === 'email') return `mailto:${data.get('email')}?subject=${encodeURIComponent(data.get('subject'))}&body=${encodeURIComponent(data.get('message'))}`;
  if (currentTemplate === 'phone') return `tel:${data.get('phone')}`;
  return data.get('text');
}
async function generateQr(event) {
  event.preventDefault(); currentQrValue = generateValue(new FormData(event.currentTarget));
  try {
    await QRCode.toCanvas($('#qr-canvas'), currentQrValue, { width: 280, margin: 2, color: { dark: '#061a2b', light: '#ffffff' } });
    $('#qr-preview-label').textContent = `${templates.find((x) => x.id === currentTemplate).label} QR ready to save or share`;
    $('#download-qr').disabled = false; $('#share-qr').disabled = false;
    state.generatedTotal += 1; state.missions.generated += 1; awardCompletedMissions(); persist(); renderAll(); toast('QR code created');
  } catch { toast('Could not generate that QR code.', true); }
}
function downloadQr() { const link = document.createElement('a'); link.download = 'universal-scanner-qr.png'; link.href = $('#qr-canvas').toDataURL('image/png'); link.click(); }
function shareQr() {
  $('#qr-canvas').toBlob(async (blob) => {
    const file = new File([blob], 'universal-scanner-qr.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ title: 'My QR code', files: [file] }); } catch { /* User dismissed share. */ } }
    else downloadQr();
  });
}

function renderHistory() {
  const query = $('#history-search').value.trim().toLowerCase(); const filter = $('#history-filter').value;
  const scans = state.scans.filter((item) => (filter === 'all' || item.type === filter) && `${item.title} ${item.value}`.toLowerCase().includes(query));
  const productCount = state.scans.filter((item) => item.type === 'product').length;
  $('#statistics').innerHTML = `<div class="stat-box"><strong>${state.scans.length}</strong><span>Total scans</span></div><div class="stat-box"><strong>${state.scans.filter((x) => new Date(x.createdAt).toDateString() === new Date().toDateString()).length}</strong><span>Today</span></div><div class="stat-box"><strong>${productCount}</strong><span>Barcodes</span></div>`;
  $('#history-list').innerHTML = scans.length ? scans.map((item) => `<article class="history-item"><span class="type-dot">${item.icon}</span><main><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(short(item.value, 72))}</p><time>${formatDate(item.createdAt)}</time></main><button data-favorite="${item.id}" aria-label="Favorite">${item.favorite ? '★' : '☆'}</button><button data-delete="${item.id}" aria-label="Delete">×</button></article>`).join('') : '<div class="empty-state">No scans here yet.<br />Your useful codes will be saved automatically.</div>';
}
function renderMissions() {
  const definitions = [{ key: 'scans', label: 'Scan 3 codes', target: 3, coins: 100 }, { key: 'products', label: 'Scan a barcode', target: 1, coins: 50 }, { key: 'generated', label: 'Use the generator', target: 1, coins: 25 }];
  const total = Math.round(definitions.reduce((sum, m) => sum + Math.min(state.missions[m.key] / m.target, 1), 0) / definitions.length * 100);
  $('#mission-total').textContent = `${total}%`; $('#scan-mission-strip').innerHTML = `<strong>Today’s mission:</strong> ${state.missions.scans}/${3} scans · ${total}% complete`;
  $('#mission-list').innerHTML = definitions.map((m) => { const progress = Math.min(state.missions[m.key], m.target); const complete = progress === m.target; return `<div class="mission-row"><strong>${complete ? '✓ ' : ''}${m.label}</strong><span>+${m.coins} 🪙</span><small>${progress} / ${m.target}${complete ? ' · complete' : ''}</small><div class="progress-track"><i style="width:${progress / m.target * 100}%"></i></div></div>`; }).join('');
}
function renderRewards() {
  const level = Math.floor(state.coins / 400) + 1; const levelProgress = state.coins % 400;
  $('#reward-coins').textContent = `${state.coins.toLocaleString()} coins`; $('#coin-count').textContent = state.coins.toLocaleString(); $('#level-badge').textContent = `LVL ${level}`; $('#streak-count').textContent = state.streak.count; $('#level-progress').style.width = `${levelProgress / 4}%`; $('#level-copy').textContent = `${400 - levelProgress || 400} coins to level ${level + 1}`;
  renderMissions();
  $('#achievement-grid').innerHTML = achievementDefinitions.map((achievement) => `<div class="achievement ${achievement.test(state) ? '' : 'locked'}"><span>${achievement.icon}</span><div><strong>${achievement.title}</strong><small>${achievement.detail}</small></div></div>`).join('');
  $('#store-list').innerHTML = storeRewards.map((reward) => { const redeemed = state.redeemed.some((x) => x.id === reward.id); return `<div class="store-item"><span>${reward.icon}</span><main><h3>${reward.title}</h3><p>${reward.description}</p></main><button data-redeem="${reward.id}" ${redeemed ? 'disabled' : ''}>${redeemed ? 'REDEEMED' : `${reward.cost} 🪙`}</button></div>`; }).join('');
  $('#redemption-list').innerHTML = state.redeemed.length ? state.redeemed.map((x) => `<p>✓ ${escapeHtml(x.title)} redeemed ${formatDate(x.redeemedAt)}</p>`).join('') : '';
}
function renderSettings() { $('#sound-toggle').checked = state.settings.sound; $('#haptic-toggle').checked = state.settings.haptic; $('#sound-button').textContent = state.settings.sound ? '🔊' : '🔇'; }
function renderAll() { renderHistory(); renderRewards(); renderSettings(); }
function redeemReward(id) {
  const reward = storeRewards.find((item) => item.id === id); if (!reward || state.redeemed.some((item) => item.id === id)) return;
  if (state.coins < reward.cost) { toast(`You need ${reward.cost - state.coins} more coins for this reward.`, true); return; }
  if (!confirm(`Redeem ${reward.title} for ${reward.cost} coins?`)) return;
  state.coins -= reward.cost; state.redeemed.unshift({ id, title: reward.title, redeemedAt: Date.now() }); persist(); renderAll(); toast(`${reward.title} redeemed in local preview`);
}

$('#camera-button').addEventListener('click', () => { if (scannerControls || cameraStarting) stopCamera(); else startCamera(); });
$('#camera-switch').addEventListener('click', switchCamera); $('#flash-button').addEventListener('click', toggleFlash); $('#gallery-input').addEventListener('change', (event) => scanGallery(event.target.files[0]));
$('#result-close').addEventListener('click', () => $('#result-card').classList.add('hidden'));
$('#template-grid').addEventListener('click', (event) => { const button = event.target.closest('[data-template]'); if (!button) return; currentTemplate = button.dataset.template; renderTemplates(); });
$('#generator-form').addEventListener('submit', generateQr); $('#download-qr').addEventListener('click', downloadQr); $('#share-qr').addEventListener('click', shareQr);
$$('.nav-item').forEach((button) => button.addEventListener('click', () => goTo(button.dataset.page))); $$('[data-go]').forEach((button) => button.addEventListener('click', () => goTo(button.dataset.go)));
$('#history-search').addEventListener('input', renderHistory); $('#history-filter').addEventListener('change', renderHistory);
$('#history-list').addEventListener('click', (event) => { const fav = event.target.closest('[data-favorite]'); const remove = event.target.closest('[data-delete]'); if (fav) { const item = state.scans.find((x) => x.id === fav.dataset.favorite); item.favorite = !item.favorite; persist(); renderHistory(); } if (remove) { state.scans = state.scans.filter((x) => x.id !== remove.dataset.delete); persist(); renderAll(); } });
$('#clear-history').addEventListener('click', () => { if (state.scans.length && confirm('Delete all saved scan history from this device?')) { state.scans = []; persist(); renderAll(); toast('Local history cleared'); } });
$('#store-list').addEventListener('click', (event) => { const button = event.target.closest('[data-redeem]'); if (button) redeemReward(button.dataset.redeem); });
$('#sound-toggle').addEventListener('change', (event) => { state.settings.sound = event.target.checked; persist(); renderSettings(); }); $('#haptic-toggle').addEventListener('change', (event) => { state.settings.haptic = event.target.checked; persist(); }); $('#sound-button').addEventListener('click', () => { state.settings.sound = !state.settings.sound; persist(); renderSettings(); });

window.addEventListener('online', updateConnection); window.addEventListener('offline', updateConnection);
function updateConnection() { const online = navigator.onLine; $('#connection-chip').textContent = online ? '● Online' : '● Offline'; $('#connection-chip').style.color = online ? 'var(--mint)' : 'var(--amber)'; }
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; $('#install-button').disabled = false; });
$('#install-button').addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('#install-button').disabled = true; });
$('#update-button').addEventListener('click', async () => { try { const registration = await navigator.serviceWorker?.getRegistration(); await registration?.update(); toast('Update check complete'); } catch { toast('Update check is unavailable.', true); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});

renderTemplates(); renderAll(); updateConnection();
