import { VERSION, CHANNELS, DEFAULT_PROTOCOL, LIMITS, createSyntheticTrace, parseCSV, analyzeExperiment, runBenchmark, createReport, sampleCSV } from './lab-engine.js';

import { validateResearchProtocol, describeFinding } from './research-engine.js';

const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, children = []) => {
  const e = document.createElementNS ? document.createElementNS('http://www.w3.org/1999/xhtml', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  (children || []).forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
};
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const isNum = (n) => typeof n === 'number' && isFinite(n);

let activeTrace = null;
let activeResult = null;
let activeBenchmark = null;
let cursorIdx = 0;
let playTimer = null;
let readToken = 0;
const FINDING_PAGE_SIZE=12;
let findingPage = 0;
let configuredProtocol = validateResearchProtocol(DEFAULT_PROTOCOL);
let activeProtocol = configuredProtocol;
let importHandler = null;
let reportExtension = null;
let printExtension = null;
const presentChannels = () => CHANNELS.filter(ch => !activeTrace?.channels || activeTrace.channels.includes(ch.key));
function publishState(reason) { document.dispatchEvent(new CustomEvent('patchline:state', {detail:{reason}})); }
function currentProtocol() { return validateResearchProtocol({...configuredProtocol,channels:activeTrace?.channels || configuredProtocol.channels}); }
export const lab = {
  getState: () => ({trace:activeTrace,result:activeResult,benchmark:activeBenchmark,protocol:activeProtocol,configuredProtocol}),
  loadRecording: loadTrace,
  applyFault: applyAnalyze,
  setProtocol(protocol) { configuredProtocol=validateResearchProtocol(protocol);activeProtocol=currentProtocol();activeBenchmark=null;renderBenchmark(null);renderProtocol();if(activeTrace)applyAnalyze({type:'none'}); },
  setImportHandler(handler) { importHandler=handler; },
  setReportExtension(handler,printHandler) {reportExtension=handler;printExtension=printHandler;},
  restoreRecording(bundle) {const config=validateResearchProtocol(bundle.protocol);const protocol=validateResearchProtocol({...config,channels:bundle.trace.channels||config.channels});const result=analyzeExperiment(bundle.trace,{type:'none'},protocol,null,{samples:bundle.derivedSamples,operations:bundle.operations});stopPlay();activeTrace=bundle.trace;configuredProtocol=config;activeProtocol=protocol;activeBenchmark=null;renderBenchmark(null);activeResult=result;cursorIdx=0;findingPage=0;setSource(`${activeTrace.name} — Restored workspace (unverified provenance) — ${activeTrace.samples.length} samples.`);setFileError('');const channels=$('faultChannel');channels.replaceChildren(...presentChannels().map(ch=>el('option',{value:ch.key,text:ch.name})));refresh();publishState('restored');},
  selectSample(index) {if(activeResult && Number.isInteger(index)&&index>=0&&index<activeResult.samples.length){cursorIdx=index;renderCharts();renderSampleRow();}},
  getReport() {const r=createReport(activeTrace,activeResult,activeBenchmark,activeProtocol);if(reportExtension)r.research=reportExtension();return r;},
};
function refresh() {updateCursorBounds();renderCharts();renderSampleRow();renderFindings();renderOpLog();renderDecision();renderProtocol();}

function setSource(text) { $('source').textContent = text; }
function setFileError(text) {
  const e = $('fileError');
  if (text) { e.textContent = text; e.hidden = false; } else { e.hidden = true; e.textContent = ''; }
}
function setOpLog(text) { $('opLog').textContent = text; }

function stopPlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  const pb = $('btnPause'); if (pb) pb.disabled = true;
  const pp = $('btnPlay'); if (pp) pp.disabled = false;
}

function fmtVal(v, unit) {
  if (v === null || v === undefined || !isNum(v)) return '—';
  return `${(+v).toFixed(2)} ${unit || ''}`.trim();
}

function downsampleIndices(samples, max) {
  const n = samples.length;
  if (n <= max) return samples.map((_, i) => i);
  const step = n / max;
  const idx = [];
  for (let i = 0; i < max; i++) idx.push(Math.min(n - 1, Math.floor(i * step)));
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  return idx;
}

function buildPath(samples, idx, key, tMin, tMax, yMin, yMax, w, h) {
  const padL = 44, padR = 8, padT = 10, padB = 24;
  const iw = w - padL - padR, ih = h - padT - padB;
  const sx = (t) => padL + ((t - tMin) / (tMax - tMin || 1)) * iw;
  const sy = (v) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * ih;
  let d = '';
  let pen = false;
  let previous = -1;
  for (const i of idx) {
    // A skipped missing reading must still break the visual line.
    for (let j = previous + 1; j < i; j++) if (!isNum(samples[j][key])) pen = false;
    previous = i;
    const s = samples[i];
    const v = s[key];
    if (v === null || v === undefined || !isNum(v)) { pen = false; continue; }
    const x = sx(s.t), y = sy(v);
    if (!isNum(x) || !isNum(y)) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)} `;
    pen = true;
  }
  return d.trim();
}

function drawChart(parent, channel, samples, findings, cursor) {
  parent.textContent = '';
  const title = el('div', { class: 'chart-title', text: `${channel.name} (${channel.unit})` });
  parent.appendChild(title);
  const w = 400, h = 200;
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h, class: 'chart-svg', role: 'img' });
  svg.setAttribute('aria-label', `${channel.name} time series`);
  const padL = 44, padR = 8, padT = 10, padB = 24;
  const vals = samples.map((s) => s[channel.key]).filter(isNum);
  const ts = samples.map((s) => s.t);
  const tMin = ts.length ? Math.min(...ts) : 0;
  const tMax = ts.length ? Math.max(...ts) : 1;
  let yMin = vals.length ? Math.min(...vals) : 0;
  let yMax = vals.length ? Math.max(...vals) : 1;
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const yPad = (yMax - yMin) * 0.1;
  yMin -= yPad; yMax += yPad;
  const idx = [...new Set([...downsampleIndices(samples, 500), ...findings.filter(f => f.channel === channel.key).flatMap(f => f.sampleIndices)])].sort((a,b) => a-b);
  // axes
  svg.appendChild(svgEl('line', { x1: padL, y1: padT, x2: padL, y2: h - padB, class: 'axis' }));
  svg.appendChild(svgEl('line', { x1: padL, y1: h - padB, x2: w - padR, y2: h - padB, class: 'axis' }));
  // y labels
  for (let i = 0; i <= 4; i++) {
    const v = yMin + ((yMax - yMin) * i) / 4;
    const y = h - padB - ((h - padT - padB) * i) / 4;
    const t = svgEl('text', { x: padL - 4, y: y + 3, 'text-anchor': 'end', fill: '#667670', 'font-family': 'SFMono-Regular, Menlo, monospace', 'font-size': '9' });
    t.textContent = v.toFixed(1);
    svg.appendChild(t);
  }
  // x labels
  for (let i = 0; i <= 4; i++) {
    const v = tMin + ((tMax - tMin) * i) / 4;
    const x = padL + ((w - padL - padR) * i) / 4;
    const t = svgEl('text', { x, y: h - padB + 14, 'text-anchor': 'middle', fill: '#667670', 'font-family': 'SFMono-Regular, Menlo, monospace', 'font-size': '9' });
    t.textContent = v.toFixed(0) + 's';
    svg.appendChild(t);
  }
  // unit label
  const ul = svgEl('text', { x: 4, y: padT + 8, fill: '#151A18', 'font-family': 'SFMono-Regular, Menlo, monospace', 'font-size': '9' });
  ul.textContent = channel.unit;
  svg.appendChild(ul);
  // path
  const d = buildPath(samples, idx, channel.key, tMin, tMax, yMin, yMax, w, h);
  if (d) svg.appendChild(svgEl('path', { d, fill: 'none', stroke: '#151A18', 'stroke-width': '1.5' }));
  // finding highlights
  if (findings) {
    for (const f of findings) {
      if (f.channel !== channel.key) continue;
      const si = f.sampleIndices || [];
      for (const i of si) {
        if (i < 0 || i >= samples.length) continue;
        const s = samples[i];
        const v = s[channel.key];
        if (!isNum(v)) continue;
        const x = padL + ((s.t - tMin) / (tMax - tMin || 1)) * (w - padL - padR);
        const y = padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (h - padT - padB);
        svg.appendChild(svgEl('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: 3, fill: '#CE5B3A', stroke: '#F4F1EA', 'stroke-width': '1' }));
      }
    }
  }
  // cursor
  if (cursor >= 0 && cursor < samples.length) {
    const s = samples[cursor];
    const x = padL + ((s.t - tMin) / (tMax - tMin || 1)) * (w - padL - padR);
    svg.appendChild(svgEl('line', { x1: x.toFixed(2), y1: padT, x2: x.toFixed(2), y2: h - padB, stroke: '#CE5B3A', 'stroke-width': '1', 'stroke-dasharray': '3 3' }));
    const v = s[channel.key];
    if (isNum(v)) {
      const y = padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (h - padT - padB);
      svg.appendChild(svgEl('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: 3.5, fill: '#151A18' }));
    }
  }
  parent.appendChild(svg);
}

function renderCharts() {
  const container = $('charts');
  // preserve decision element if present
  let decision = container.querySelector('.experiment-decision');
  container.textContent = '';
  if (!activeTrace) {
    container.appendChild(el('p', { text: 'No recording loaded.' }));
    return;
  }
  const samples = (activeResult && activeResult.samples) || activeTrace.samples;
  const findings = activeResult?.quality?.findings || [];
  if (decision) container.appendChild(decision);
  for (const ch of presentChannels()) {
    const section = el('div', { class: 'chart' });
    container.appendChild(section);
    drawChart(section, ch, samples, findings, cursorIdx);
  }
}

function renderDecision() {
  const container = $('charts');
  let decision = container.querySelector('.experiment-decision');
  if (!decision) {
    decision = el('div', { class: 'experiment-decision' });
    container.insertBefore(decision, container.firstChild);
  }
  decision.textContent = '';
  if (!activeResult) return;
  const q = activeResult.quality || {};
  const d = activeResult.decision || {};
  decision.appendChild(el('h3', { text: 'Experiment decision' }));
  decision.appendChild(el('p', { class: 'decision-label', text: `Label: ${d.label || '—'}` }));
  decision.appendChild(el('p', { class: 'decision-rationale', text: d.rationale || '' }));
  decision.appendChild(el('p', { class: 'quality-count', text: `Full recording: ${q.sampleCount || 0} samples checked · ${q.findings?.length || 0} quality findings.` }));
  const ms = $('modelStatus');
  if (activeTrace.kind === 'imported') {
    ms.textContent = 'Model disabled for imported data (unverified provenance). No accuracy claims.';
  } else if (isNum(activeResult.modelStatus?.patternScore) || isNum(activeResult.patternScore)) {
    const ps = activeResult.patternScore ?? activeResult.modelStatus?.patternScore;
    ms.textContent = `Synthetic pattern score (not clinical risk): ${ps.toFixed(3)}. Model status: ${activeResult.modelStatus}.`;
  } else {
    ms.textContent = `Model status: ${activeResult.modelStatus}.`;
  }
}

function renderSampleRow() {
  const tr = $('sampleRow');
  tr.textContent = '';
  const samples = (activeResult && activeResult.samples) || (activeTrace && activeTrace.samples) || [];
  const s = samples[cursorIdx];
  const cells = [
    String(cursorIdx + 1),
    s ? s.t.toFixed(2) + ' s' : '—',
    s ? fmtVal(s.temperature, '°C') : '—',
    s ? fmtVal(s.moisture, '%') : '—',
    s ? fmtVal(s.ph, 'pH') : '—',
    s ? fmtVal(s.glucose, 'AU') : '—',
  ];
  for (const c of cells) tr.appendChild(el('td', { text: c }));
  updateCursorBounds();
}

function renderFindings() {
  const ul = $('findings');
  ul.textContent = '';
  if (!activeResult || !activeResult.quality || !activeResult.quality.findings) return;
  const all = activeResult.quality.findings;
  if (!all.length) ul.appendChild(el('li', {text: 'No quality findings under this protocol.'}));
  for (const f of all.slice(findingPage * FINDING_PAGE_SIZE, (findingPage + 1) * FINDING_PAGE_SIZE)) {
    const li = el('li');
    const btn = el('button', { type: 'button', class: 'finding-link' });
    const idx = f.sampleIndices && f.sampleIndices.length ? f.sampleIndices[0] : -1;
    btn.textContent = `${f.code} — ${f.channel || '—'} — sample ${idx >= 0 ? idx + 1 : '?'} — ${f.message || ''}`;
    btn.addEventListener('click', () => {
      if (idx >= 0 && idx < (activeResult.samples || []).length) {
        cursorIdx = idx;
        $('cursor').value = cursorIdx;
        renderCharts();
        renderSampleRow();
      }
    });
    li.appendChild(btn);
    const why = el('details', {class:'finding-detail'});
    why.appendChild(el('summary',{text:'Why was this flagged?'}));
    try {
      const detail=describeFinding(f,activeResult.samples,activeProtocol);
      why.appendChild(el('p',{text:detail.explanation}));
      why.appendChild(el('p',{class:'help',text:`Rule: ${detail.rule}`}));
      why.appendChild(el('p',{text:detail.nextStep}));
      why.appendChild(el('pre',{text:JSON.stringify(detail.evidence,null,2)}));
    } catch(error) {why.appendChild(el('p',{text:error.message}));}
    li.appendChild(why);
    ul.appendChild(li);
  }
  if (all.length > FINDING_PAGE_SIZE) {
    const pager = el('li', {text: `Findings ${findingPage*FINDING_PAGE_SIZE+1}–${Math.min((findingPage+1)*FINDING_PAGE_SIZE,all.length)} of ${all.length}. `});
    for (const delta of [-1,1]) {
      const button = el('button', {type:'button',text:delta<0?'Previous findings':'Next findings'});
      button.disabled = findingPage+delta<0 || (findingPage+delta)*FINDING_PAGE_SIZE>=all.length;
      button.addEventListener('click',()=>{findingPage+=delta;renderFindings();ul.tabIndex=-1;ul.focus()});pager.appendChild(button);
    }
    ul.appendChild(pager);
  }
}

function renderOpLog() {
  const p = $('opLog');
  if (!activeResult || !activeResult.operations || !activeResult.operations.length) {
    p.textContent = 'No operations applied.';
    return;
  }
  if (activeResult.operations.every(op=>op.type==='none')) {p.textContent='Original recording · No fault applied.';return;}
  const lines = activeResult.operations.map((op) => {
    const parts = [op.type, op.channel, `sample ${op.index + 1}`];
    if (op.before !== undefined) parts.push(`before ${op.before}`);
    if (op.after !== undefined) parts.push(`after ${op.after}`);
    if (op.seed !== undefined) parts.push(`seed ${op.seed}`);
    return parts.join(' · ');
  });
  p.textContent = (activeResult.operationProvenance?.startsWith('Restored') ? 'Restored descriptions; execution unverified · ' : '') + (activeResult.changed ? 'Modified copy · ' : 'Original recording / no change · ') + lines.join(' | ');
}

function updateCursorBounds() {
  const slider = $('cursor');
  const n = activeTrace ? activeTrace.samples.length : 0;
  slider.max = Math.max(0, n - 1);
  if (cursorIdx > n - 1) cursorIdx = Math.max(0, n - 1);
  slider.value = cursorIdx;
  $('faultIndex').max = n;
  $('cursorHelp').textContent = `Cursor preview: ${cursorIdx + 1} of ${n}. Quality check: full recording.`;
}

function loadTrace(trace) {
  stopPlay();
  activeTrace = trace;
  activeProtocol=currentProtocol();
  const channels=$('faultChannel');channels.replaceChildren(...presentChannels().map(ch=>el('option',{value:ch.key,text:ch.name})));
  activeResult = null;
  cursorIdx = 0;
  setSource(`${trace.name || 'Recording'} — ${trace.kind === 'imported' ? 'Imported (unverified provenance)' : 'Synthetic'} — ${trace.samples.length} samples.`);
  setFileError('');
  applyAnalyze({ type: 'none' });
  updateCursorBounds();
  renderCharts();
  renderSampleRow();
  renderFindings();
  renderOpLog();
  renderDecision();
  $('faultType').value = 'none'; $('faultSeverity').disabled=true;
  $('faultIndex').value = Math.min(12,trace.samples.length);
  renderProtocol(); publishState('loaded');
  const hero = $('heroSvg');
  const preview = $('charts').querySelector('.chart svg');
  if (preview) {hero.setAttribute('viewBox',preview.getAttribute('viewBox'));hero.replaceChildren(...Array.from(preview.children).map(node => node.cloneNode(true)));}
}

function applyAnalyze(fault) {
  if (!activeTrace) return;
  try {
    stopPlay();
    const next = analyzeExperiment(activeTrace, fault, activeProtocol);
    activeResult = next; findingPage = 0; setFileError('');
    cursorIdx = clamp(cursorIdx, 0, activeResult.samples.length - 1);
    updateCursorBounds();
    renderCharts();
    renderSampleRow();
    renderFindings();
    renderOpLog();
    renderDecision(); publishState('analyzed');
  } catch (err) {
    setFileError('Analysis error: ' + (err && err.message ? err.message : err));
  }
}

function setScenario(kind) {
  readToken++;
  stopPlay();
  try {
    const trace = createSyntheticTrace(kind, 1);
    loadTrace(trace);
    $('btnStable').setAttribute('aria-pressed', String(kind === 'stable'));
    $('btnChange').setAttribute('aria-pressed', String(kind === 'change'));
  } catch (err) {
    setFileError('Scenario error: ' + (err && err.message ? err.message : err));
  }
}

function handleFile(file) {
  const myToken = ++readToken;
  if (!file) return;
  if (file.size > LIMITS.maxBytes) {
    setFileError(`File too large. Max ${LIMITS.maxBytes} bytes. Got ${file.size}.`);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (myToken !== readToken) return; // superseded
    try {
      const text = String(reader.result || '');
      if(importHandler){importHandler(text,file.name);return;}
      const trace = parseCSV(text, file.name);
      if (trace.samples.length > LIMITS.maxRows) {
        setFileError(`Too many rows. Max ${LIMITS.maxRows}.`);
        return;
      }
      loadTrace(trace);
      $('btnStable').setAttribute('aria-pressed', 'false');
      $('btnChange').setAttribute('aria-pressed', 'false');
    } catch (err) {
      setFileError('Import failed: ' + (err && err.message ? err.message : err));
    }
  };
  reader.onerror = () => {
    if (myToken !== readToken) return;
    setFileError('File read error.');
  };
  reader.readAsText(file);
}

function downloadText(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function inputNumber(id, min, max, integer = false) {
  const value = $(id).value;
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new Error(`Enter a ${integer ? 'whole' : 'finite'} number between ${min} and ${max} for ${$(id).closest('label').textContent.trim()}.`);
  }
  return number;
}
function currentFault() {
  const type = $('faultType').value;
  if (type === 'none') return {type:'none'};
  const channel = $('faultChannel').value;
  const index = inputNumber('faultIndex',1,activeTrace.samples.length,true)-1;
  const seed = inputNumber('faultSeed',0,0xffffffff,true);
  const severity = type === 'dropout' ? 0 : inputNumber('faultSeverity',-1000000,1000000);
  if (type === 'gap' && severity <= 0) throw new Error('Gap must add a positive number of seconds.');
  if ((type === 'spike' || type === 'drift') && severity === 0) throw new Error('Choose a non-zero change.');
  return {type,channel,index,severity,seed};
}

function renderProtocol() {
  const div = $('protocolInfo');
  div.textContent = '';
  const p = activeProtocol;
  div.appendChild(el('h3', { text: 'Protocol disclosure' }));
  div.appendChild(el('p', { text: 'Experimental measurement assumptions for research sensor validation only. Not clinical thresholds.' }));
  const ul = el('ul');
  for (const ch of presentChannels()) {
    const r = p.ranges[ch.key];
    const sp = p.spikes[ch.key];
    ul.appendChild(el('li', { text: `${ch.name}: inclusive range ${r[0]}..${r[1]} ${ch.unit}; isolated spike threshold ${sp} ${ch.unit}.` }));
  }
  ul.appendChild(el('li', { text: `Max gap between samples: ${p.maxGapSeconds} s.` }));
  ul.appendChild(el('li', { text: 'pH is dimensionless. Glucose AU is arbitrary experimental signal, not blood glucose.' }));
  div.appendChild(ul);
}

function renderBenchmark(bm) {
  const div = $('benchmarkOut');
  div.textContent = '';
  if (!bm) return;
  if (bm.error) {
    div.appendChild(el('p', { class: 'error', text: bm.error }));
    return;
  }
  const r = bm.rates || {};
  const c = bm.counts || {};
  div.appendChild(el('h3', { text: 'Synthetic benchmark' }));
  div.appendChild(el('p', { text: `Seed ${bm.seed} · ${bm.cases} faulted + ${bm.cases} clean traces. Engine v${bm.version}.` }));
  div.appendChild(el('p', { text: `Recall: ${isNum(r.recall) ? r.recall.toFixed(3) : '—'} (${c.tp}/${c.tp + c.fn}). Precision: ${isNum(r.precision) ? r.precision.toFixed(3) : '—'}. False hold: ${isNum(r.falseHoldRate) ? r.falseHoldRate.toFixed(3) : '—'} (${c.fp}/${c.fp + c.tn}).` }));
  const tbl = el('table', { class: 'bm-table' });
  const thead = el('thead');
  const hr = el('tr');
  ['Type', 'Total', 'Detected', 'Missed'].forEach((t) => hr.appendChild(el('th', { text: t })));
  thead.appendChild(hr);
  tbl.appendChild(thead);
  const tbody = el('tbody');
  for (const bt of bm.byType || []) {
    const tr = el('tr');
    tr.appendChild(el('td', { text: bt.type }));
    tr.appendChild(el('td', { text: String(bt.total) }));
    tr.appendChild(el('td', { text: String(bt.detected) }));
    tr.appendChild(el('td', { text: String(bt.missed) }));
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  div.appendChild(tbl);
  div.appendChild(el('p', { class: 'bm-scope', text: bm.scope || '' }));
  div.appendChild(el('p', { class: 'bm-note', text: 'Smooth drift can pass these checks. A clean changing pattern is not a sensor fault. This benchmark is standalone and does not evaluate any uploaded recording against ground truth.' }));
}

function runBm() {
  const btn = $('btnBenchmark');
  let seed,cases;
  try {seed=inputNumber('bmSeed',0,1000000,true); cases=inputNumber('bmCases',10,300,true)}
  catch(error){activeBenchmark=null;renderBenchmark({error:error.message});return}
  $('bmSeed').value = seed;
  $('bmCases').value = cases;
  btn.disabled = true;
  const out = $('benchmarkOut');
  out.textContent = 'Running benchmark…';
  setTimeout(() => {
    try {
      const bm = runBenchmark({ seed, cases, protocol: DEFAULT_PROTOCOL });
      activeBenchmark = bm;
      renderBenchmark(bm);
    } catch (err) {
      activeBenchmark = null;
      out.textContent = '';
      renderBenchmark({ error: 'Benchmark error: ' + (err && err.message ? err.message : err) });
    } finally {
      btn.disabled = false;
    }
  }, 30);
}

function renderPrintReport() {
  const sec = $('printReport');
  sec.textContent = '';
  if (!activeTrace || !activeResult) return;
  const r = lab.getReport();
  sec.appendChild(el('h2', { text: 'Patchline Lab — Experiment Report' }));
  sec.appendChild(el('p', { text: `Source: ${activeTrace.name || '—'} (${activeTrace.kind}). Provenance: ${activeTrace.kind === 'imported' ? 'unverified' : 'synthetic'}.` }));
  sec.appendChild(el('p', { text: `Schema: ${r.schema}. Engine v${r.version}.` }));
  sec.appendChild(el('p', { text: `Original samples: ${r.originalSamples.length}. Derived samples: ${r.derivedSamples.length}.` }));
  sec.appendChild(el('h3', { text: 'Protocol' }));
  sec.appendChild(el('p', { text: `Ranges: ${JSON.stringify(r.protocol.ranges)}. Spikes: ${JSON.stringify(r.protocol.spikes)}. Max gap: ${r.protocol.maxGapSeconds} s.` }));
  sec.appendChild(el('h3', { text: 'Quality findings' }));
  const ul = el('ul');
  for (const f of (r.quality.findings || []).slice(0,100)) {
    ul.appendChild(el('li', { text: `${f.code} — ${f.channel} — samples ${(f.sampleIndices || []).map((i) => i + 1).join(',')} — ${f.message}` }));
  }
  if (!(r.quality.findings || []).length) ul.appendChild(el('li', { text: 'No findings.' }));
  sec.appendChild(ul);
  if(r.quality.findings.length>100) sec.appendChild(el('p',{text:`First 100 of ${r.quality.findings.length} findings. Full findings are in JSON.`}));
  sec.appendChild(el('p', { text: `Decision: ${r.decision.label}. ${r.decision.rationale}` }));
  sec.appendChild(el('p', { text: `Model status: ${r.model.status}. Pattern score: ${isNum(r.model.patternScore) ? r.model.patternScore.toFixed(3) : '—'}.` }));
  if (r.operations && r.operations.length) {
    sec.appendChild(el('h3', { text: 'Operations' }));
    const oul = el('ul');
    for (const op of r.operations) oul.appendChild(el('li', { text: `${op.type} ${op.channel} sample ${op.index+1} before ${op.before} after ${op.after} seed ${op.seed}` }));
    sec.appendChild(oul);
  }
  sec.appendChild(el('h3', { text: 'Sample values (source)' }));
  const tbl = el('table', { class: 'print-table' });
  const thead = el('thead');
  const hr = el('tr');
  ['Sample', 'Version', 't (s)', 'temp (°C)', 'wetness (%)', 'pH', 'glucose (AU)'].forEach((t) => hr.appendChild(el('th', { text: t })));
  thead.appendChild(hr);
  tbl.appendChild(thead);
  const tbody = el('tbody');
  const evidenceRows = [...new Set([0,r.originalSamples.length-1,cursorIdx, ...r.quality.findings.flatMap(f=>f.sampleIndices)])].slice(0,32).sort((a,b)=>a-b);
  sec.appendChild(el('p',{text:'Selected source evidence samples below; complete original and derived recordings are in the JSON export.'}));
  for (const i of evidenceRows) {
    for (const [version, sample] of [['Original',r.originalSamples[i]],['Derived',r.derivedSamples[i]]]) {
      const tr = el('tr');
      const values = [String(i+1),version,sample.t,...CHANNELS.map(ch=>sample[ch.key])];
      for (const value of values) tr.appendChild(el('td',{text:typeof value==='string'?value:isNum(value)?value.toFixed(2):'Missing'}));
      tbody.appendChild(tr);
    }
  }
  tbl.appendChild(tbody);
  sec.appendChild(tbl);
  if (r.benchmark) {
    sec.appendChild(el('h3', { text: 'Benchmark (standalone)' }));
    sec.appendChild(el('p', { text: `Seed ${r.benchmark.seed}, ${r.benchmark.cases} cases. Recall ${isNum(r.benchmark.rates?.recall) ? r.benchmark.rates.recall.toFixed(3) : '—'}. Precision ${isNum(r.benchmark.rates?.precision) ? r.benchmark.rates.precision.toFixed(3) : '—'}.` }));
    sec.appendChild(el('p', {text: `${r.benchmark.counts.tp} detected / ${r.benchmark.cases} faulted; ${r.benchmark.counts.fn} missed; ${r.benchmark.counts.fp} false holds / ${r.benchmark.cases} clean.`}));
    sec.appendChild(el('p', { text: r.benchmark.scope || '' }));
  }
  if(printExtension)printExtension(sec,r);
  sec.appendChild(el('p', { class: 'scope', text: r.scope || 'Research sensor validation only. Not clinical. Not a diagnosis or treatment tool.' }));
}

function init() {
  // scenario buttons
  $('btnStable').addEventListener('click', () => setScenario('stable'));
  $('btnChange').addEventListener('click', () => setScenario('change'));
  // template
  $('btnTemplate').addEventListener('click', () => downloadText('patchline-template.csv', sampleCSV(), 'text/csv'));
  // file
  $('fileInput').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
    e.target.value = '';
  });
  // play/pause
  $('btnPlay').addEventListener('click', () => {
    if (!activeTrace || !activeResult) return;
    if (cursorIdx >= activeResult.samples.length - 1) cursorIdx = 0;
    stopPlay();
    $('btnPlay').disabled = true;
    $('btnPause').disabled = false;
    playTimer = setInterval(() => {
      cursorIdx++;
      if (cursorIdx >= activeResult.samples.length) { cursorIdx = activeResult.samples.length - 1; stopPlay(); }
      $('cursor').value = cursorIdx;
      renderCharts();
      renderSampleRow();
    }, 400);
  });
  $('btnPause').addEventListener('click', stopPlay);
  // cursor
  $('cursor').addEventListener('input', (e) => {
    cursorIdx = clamp(parseInt(e.target.value, 10) || 0, 0, (activeResult?.samples.length || 1) - 1);
    renderCharts();
    renderSampleRow();
  });
  // fault
  $('btnApply').addEventListener('click', () => {
    if (!activeTrace) return;
    try {applyAnalyze(currentFault())} catch(error){setFileError(error.message)}
    $('btnApply').focus();
  });
  $('btnReset').addEventListener('click', () => {
    if (!activeTrace) return;
    $('faultType').value = 'none';
    applyAnalyze({ type: 'none' });
    stopPlay();
    $('btnReset').focus();
  });
  $('faultType').addEventListener('change', (e) => {
    const sev = $('faultSeverity');
    sev.disabled = ['none','dropout'].includes(e.target.value);
    sev.value = e.target.value === 'gap' ? 4 : e.target.value === 'spike' ? 5 : 1;
    sev.min = e.target.value === 'gap' ? '0.001' : '-1000000';
  });
  // benchmark
  $('btnBenchmark').addEventListener('click', runBm);
  // export
  $('btnExport').addEventListener('click', () => {
    if (!activeTrace || !activeResult) { setFileError('No active experiment to export.'); return; }
    try {
      const report = lab.getReport();
      downloadText('patchline-lab-experiment.json', JSON.stringify(report, null, 2), 'application/json');
    } catch (err) {
      setFileError('Export error: ' + (err && err.message ? err.message : err));
    }
  });
  // print
  $('btnPrint').addEventListener('click', () => {
    renderPrintReport();
    window.print();
  });
  window.addEventListener('beforeunload',stopPlay);
  // protocol
  renderProtocol();
  // initial trace
  setScenario('stable');

}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
