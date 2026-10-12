// Patchline Lab v2 — reviewed UI integration. Built by Rishik Rontala.
import { lab } from './lab-app.js';
import { CHANNELS, DEFAULT_PROTOCOL, createSyntheticTrace } from './lab-engine.js';
import { DEFAULT_PROFILE, DEFAULT_COMPARISON, KEYS, scanCSV, suggestProfile, validateProfile,
  parseMappedCSV, validateResearchProtocol, serializeProtocol, restoreProtocol,
  compareRecordings, validateComparisonOptions, serializeWorkspace, restoreWorkspace } from './research-engine.js';
import { ECONOMICS_DEFAULTS, SCENARIOS, calculateEconomics, serializeEconomics } from './economics-engine.js';
import { UCI_TEMPERATURE_CSV } from './samples/uci-temperature.js';

const $ = id => document.getElementById(id);
function node(tag, text, cls) {const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(cls)element.className=cls;return element;}
function message(id,text) {const element=$(id);element.textContent=text||'';element.hidden=!text;}
function download(name,text,type='application/json') {const url=URL.createObjectURL(new Blob([text],{type}));const a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function number(id) {const field=$(id);if(!field.value.trim())throw new Error(`${field.closest('label')?.textContent.trim()||id}: enter a number.`);const value=Number(field.value);if(!Number.isFinite(value))throw new Error('All settings need finite numeric values.');return value;}
function inputLabel(parent,title,id,value,options={}) {const label=node('label',title);const input=node('input');input.id=id;input.type=options.type||'number';input.value=value;input.step='any';if(options.min!==undefined)input.min=options.min;if(options.max!==undefined)input.max=options.max;label.append(input);parent.append(label);return input;}
function selectLabel(parent,title,id,values) {const label=node('label',title);const select=node('select');select.id=id;for(const [value,text] of values){const option=node('option',text);option.value=value;select.append(option);}label.append(select);parent.append(label);return select;}
function action(buttonId, errorId, callback) {$(buttonId).addEventListener('click',()=>{try{callback();message(errorId,'');}catch(error){message(errorId,error.message);}});}
const channelName = key => CHANNELS.find(ch=>ch.key===key)?.name || key;
const f = value => value===null||value===undefined?'—':Number(value).toFixed(3);
const money = value => value===null?'Unavailable':`$${value.toFixed(2)}`;
let currentProfile=validateProfile(DEFAULT_PROFILE);
let pendingImport=null;
let reference=null;
let comparison=null;
let comparisonOptions=validateComparisonOptions(DEFAULT_COMPARISON);
const PAIR_PAGE_SIZE=12;
let comparisonPage=0;
let comparisonFilter='review';
let referenceRead=0;
let protocolRead=0;
let workspaceRead=0;
let applyingWorkspace=false;
let financeInputs={...ECONOMICS_DEFAULTS};

const sourceUnits={temperature:[['C','Celsius (°C)'],['F','Fahrenheit (°F)'],['K','Kelvin (K)']],moisture:[['%','Percent (%)'],['fraction','Fraction (0–1)']],ph:[['pH','Dimensionless pH']],glucose:[['AU','Arbitrary units (AU)']]};
function showMapping(text,name,target='recording') {
  const {headers,rows}=scanCSV(text);
  pendingImport={text,name,headers,target};
  const suggestion=suggestProfile(headers);
  const compatible=Object.values(currentProfile.channels).every(mapping=>headers.includes(mapping.column))&&headers.includes(currentProfile.timeColumn);
  const profile=compatible?currentProfile:suggestion;
  $('mappingSummary').textContent=`${name} · ${rows.length} rows · ${headers.length} columns. Confirm every selected channel and unit.`;
  $('profileName').value=profile?.name||'Research CSV';
  $('importTarget').value=target;
  $('mapTime').replaceChildren(...headers.map(h=>{const option=node('option',h);option.value=h;return option;}));
  $('mapTime').value=profile?.timeColumn||headers[0];
  $('mapTimeUnit').value=profile?.timeUnit||'s';
  const grid=$('channelMappings');grid.replaceChildren();
  for(const key of KEYS) {
    const row=node('div',undefined,'mapping-row');
    const column=selectLabel(row,channelName(key),`map-${key}`,[['','Not recorded'],...headers.map(h=>[h,h])]);
    const unit=selectLabel(row,'Source unit',`unit-${key}`,sourceUnits[key]);
    column.value=profile?.channels[key]?.column||'';unit.value=profile?.channels[key]?.unit||sourceUnits[key][0][0];
    grid.append(row);
  }
  message('mappingError','');$('mappingPanel').hidden=false;$('mappingTitle').focus();
}
function mappedProfile() {
  const channels={};for(const key of KEYS)if($(`map-${key}`).value)channels[key]={column:$(`map-${key}`).value,unit:$(`unit-${key}`).value};
  return validateProfile({name:$('profileName').value,timeColumn:$('mapTime').value,timeUnit:$('mapTimeUnit').value,channels},pendingImport.headers);
}
function confirmImport() {
  if(!pendingImport)throw new Error('Choose a CSV first.');
  const profile=mappedProfile();const imported=parseMappedCSV(pendingImport.text,profile,pendingImport.name);
  const target=$('importTarget').value;
  if(target==='reference')setReference(imported);
  else {currentProfile=profile;lab.loadRecording(imported);}
  pendingImport=null;$('mappingPanel').hidden=true;
  $(target==='reference'?'btnCompare':'btnApply').focus();
}
function setReference(trace) {
  reference=trace;comparison=null;comparisonPage=0;
  $('referenceSource').textContent=`${trace.name} · ${trace.samples.length} samples · ${trace.kind==='synthetic'?'Generated control':'User-supplied recording; provenance unverified'}`;
  refreshComparisonChannels();renderComparison();
}
function refreshComparisonChannels() {
  const old=$('compareChannel').value;
  const main=lab.getState().trace;const keys=(main?.channels||KEYS).filter(key=>!reference?.channels||reference.channels.includes(key));
  $('compareChannel').replaceChildren(...keys.map(key=>{const option=node('option',channelName(key));option.value=key;return option;}));
  if(keys.includes(old))$('compareChannel').value=old;
  $('btnCompare').disabled=!reference||!main||!keys.length;
}
function readOptions() {
  return validateComparisonOptions({channel:$('compareChannel').value,role:$('compareRole').value,tolerance:number('compareTolerance'),uncertainty:number('compareUncertainty'),timeOffsetSeconds:number('compareOffset'),maxMatchDistance:number('compareDistance'),maxReferenceStep:number('compareStep'),minCoverage:number('compareCoverage'),minPairs:number('comparePairs')});
}
function fillOptions(options) {
  const map={compareChannel:'channel',compareRole:'role',compareTolerance:'tolerance',compareUncertainty:'uncertainty',compareOffset:'timeOffsetSeconds',compareDistance:'maxMatchDistance',compareStep:'maxReferenceStep',compareCoverage:'minCoverage',comparePairs:'minPairs'};
  for(const [id,key] of Object.entries(map))$(id).value=options[key];
}
function runComparison() {
  const {trace,result}=lab.getState();if(!trace||!result||!reference)throw new Error('Load both a current recording and comparison recording.');
  const options=readOptions();
  comparison=compareRecordings({...trace,samples:result.samples},reference,options);
  comparisonOptions=options;comparisonPage=0;renderComparison();
}
function comparisonPlot(result) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 940 230');svg.setAttribute('role','img');svg.setAttribute('aria-label','Difference from comparison recording over time; gaps have no connecting line');svg.classList.add('difference-chart');
  const make=(tag,attrs)=>{const e=document.createElementNS(svg.namespaceURI,tag);for(const [key,value] of Object.entries(attrs))e.setAttribute(key,value);svg.append(e);return e;};
  const pairs=result.pairs;const first=pairs[0].time,last=pairs.at(-1).time;const limit=result.options.tolerance;
  let ymax=limit*1.5;for(const pair of pairs)if(pair.delta!==null)ymax=Math.max(ymax,Math.abs(pair.delta)*1.1);
  const x=t=>58+(t-first)/(last-first||1)*850;const y=v=>110-v/ymax*85;
  make('line',{x1:58,y1:110,x2:908,y2:110,stroke:'#C9D0C9'});
  for(const sign of [-1,1]){make('line',{x1:58,y1:y(sign*limit),x2:908,y2:y(sign*limit),stroke:'#667670','stroke-dasharray':'5 4'});const text=make('text',{x:4,y:y(sign*limit)+4,fill:'#667670','font-size':12});text.textContent=(sign*limit).toFixed(2);}
  let path='',pen=false;const step=Math.max(1,Math.ceil(pairs.length/600));
  for(let i=0;i<pairs.length;i++) {
    const pair=pairs[i];if(pair.status==='unavailable'){pen=false;continue;}
    if(i%step!==0 && i!==pairs.length-1 && pair.status!=='exceeds')continue;
    path+=`${pen?'L':'M'}${x(pair.time).toFixed(2)} ${y(pair.delta).toFixed(2)} `;pen=true;
  }
  make('path',{d:path,fill:'none',stroke:'#151A18','stroke-width':1.7});
  for(const pair of pairs.filter(p=>p.status==='exceeds').filter((_,i)=>i%step===0))make('circle',{cx:x(pair.time),cy:y(pair.delta),r:3,fill:'#CE5B3A'});
  const text=make('text',{x:58,y:222,fill:'#667670','font-size':12});text.textContent=`Elapsed time ${f(first)}–${f(last)} s · Δ current − comparison · dashed lines: declared tolerance`;
  return svg;
}
function renderComparison() {
  const out=$('comparisonOut');out.replaceChildren();$('btnExportComparison').disabled=!comparison;
  if(!comparison){out.append(node('p',reference?'Comparison ready. Choose settings and compare the current recording.':'Load a reference or repeat recording to compare.', 'help'));return;}
  const c=comparison.counts;const matched=c.within+c.exceeds+c.uncertain;
  const label=comparison.decision==='discrepancy'?'A discrepancy needs review':comparison.decision==='within-tolerance'?'Aligned readings are within the declared tolerance':'Evidence is inconclusive';
  out.append(node('p',label,'comparison-decision'),node('p',`${channelName(comparison.options.channel)} · ${comparison.options.role==='repeat'?'Repeat-run comparison':'Supplied-reference comparison'} · ${matched}/${comparison.pairs.length} usable pairs (${(comparison.coverage*100).toFixed(1)}% coverage).`),node('p',`${c.exceeds} exceed tolerance · ${c.within} within · ${c.uncertain} uncertain · ${c.unavailable} unavailable.`),node('p',`RMSE ${f(comparison.summary.rmse)} · Mean difference ${f(comparison.summary.meanDelta)} · Maximum absolute difference ${f(comparison.summary.maxAbsDelta)}. These describe aligned readings, not reference accuracy.`,'help'),comparisonPlot(comparison));
  out.append(node('p',`Applied tolerance ${comparison.options.tolerance}, uncertainty bound ±${comparison.options.uncertainty}; maximum timestamp mismatch ${comparison.options.maxMatchDistance} s; minimum coverage ${comparison.options.minCoverage}; minimum usable pairs ${comparison.options.minPairs}.`,'help'));
  const filters=node('div',undefined,'row');const select=selectLabel(filters,'Evidence to inspect','comparisonFilter',[['review','Needs review'],['all','All pairs']]);select.value=comparisonFilter;select.addEventListener('change',()=>{comparisonFilter=select.value;comparisonPage=0;renderComparison();$('comparisonFilter').focus();});out.append(filters);
  const filtered=comparisonFilter==='review'?comparison.pairs.filter(p=>p.status!=='within'):comparison.pairs;
  if(!filtered.length)out.append(node('p','No pairs need review. Select All pairs to inspect the aligned values.','help'));
  const shown=filtered.slice(comparisonPage*PAIR_PAGE_SIZE,(comparisonPage+1)*PAIR_PAGE_SIZE);const table=node('table',undefined,'evidence-table');const head=node('thead');const row=node('tr');for(const text of ['Current sample','Comparison sample','Current','Comparison','Δ','Result'])row.append(node('th',text));head.append(row);table.append(head);const body=node('tbody');
  for(const pair of shown){const tr=node('tr');const td=node('td');const button=node('button',String(pair.sampleIndex+1));button.type='button';button.setAttribute('aria-label',`Inspect current sample ${pair.sampleIndex+1}`);button.addEventListener('click',()=>{lab.selectSample(pair.sampleIndex);$('sampleRow').scrollIntoView({block:'center'});});td.append(button);tr.append(td);for(const text of [pair.referenceIndex===null?'—':String(pair.referenceIndex+1),f(pair.value),f(pair.referenceValue),f(pair.delta),`${pair.status}${pair.reason?' · '+pair.reason:''}`])tr.append(node('td',text));body.append(tr);}
  table.append(body);const wrapper=node('div',undefined,'table-wrap');wrapper.append(table);out.append(wrapper);
  const pager=node('div',undefined,'row');pager.append(node('p',`Pairs ${filtered.length?comparisonPage*PAIR_PAGE_SIZE+1:0}–${Math.min((comparisonPage+1)*PAIR_PAGE_SIZE,filtered.length)} of ${filtered.length} ${comparisonFilter==='review'?'review':'total'} pairs. All pairs are included in the export.`,'help'));
  for(const delta of [-1,1]){const button=node('button',delta<0?'Previous pairs':'Next pairs');button.type='button';button.disabled=comparisonPage+delta<0||(comparisonPage+delta)*PAIR_PAGE_SIZE>=filtered.length;button.addEventListener('click',()=>{comparisonPage+=delta;renderComparison();out.tabIndex=-1;out.focus();});pager.append(button);}out.append(pager,node('p',comparison.scope,'help'));
}

function renderProtocolEditor() {
  const protocol=lab.getState().configuredProtocol;$('protocolName').value=protocol.name;$('protocolRevision').value=protocol.revision;$('protocolGap').value=protocol.maxGapSeconds;$('protocolFlatline').checked=Boolean(protocol.flatline);
  const table=node('table',undefined,'evidence-table');const header=node('tr');for(const value of ['Channel','Minimum','Maximum','Isolated spike threshold'])header.append(node('th',value));const thead=node('thead');thead.append(header);table.append(thead);const tbody=node('tbody');
  for(const ch of CHANNELS){const tr=node('tr');tr.append(node('th',`${ch.name} (${ch.unit})`));for(const [suffix,value] of [['min',protocol.ranges[ch.key][0]],['max',protocol.ranges[ch.key][1]],['spike',protocol.spikes[ch.key]]]){const td=node('td');inputLabel(td,`${ch.name} ${suffix}`,`protocol-${ch.key}-${suffix}`,value);tr.append(td);}tbody.append(tr);}table.append(tbody);$('protocolRows').replaceChildren(table);
}
function protocolFromEditor() {const ranges={},spikes={};for(const key of KEYS){ranges[key]=[number(`protocol-${key}-min`),number(`protocol-${key}-max`)];spikes[key]=number(`protocol-${key}-spike`);}return validateResearchProtocol({name:$('protocolName').value,revision:$('protocolRevision').value,channels:KEYS,ranges,spikes,maxGapSeconds:number('protocolGap'),flatline:$('protocolFlatline').checked});}
async function readFile(file,limit) {if(!file)throw new Error('Choose a file.');if(file.size>limit)throw new Error(`File exceeds ${limit} bytes.`);return file.text();}
function stateChanged(event) {
  $('workspaceStatus').textContent='';$('protocolStatus').textContent='';
  if(!applyingWorkspace){comparison=null;comparisonPage=0;message('comparisonError','');}
  if(event.detail.reason==='loaded'){pendingImport=null;$('mappingPanel').hidden=true;currentProfile=lab.getState().trace.importProfile||currentProfile;}
  refreshComparisonChannels();renderComparison();renderProtocolEditor();
}
function restoreBundle(bundle) {
  const restoredComparison=bundle.reference?compareRecordings({...bundle.trace,samples:bundle.derivedSamples},bundle.reference,bundle.comparisonOptions):null;
  applyingWorkspace=true;
  try{currentProfile=bundle.profile;reference=bundle.reference;comparisonOptions=bundle.comparisonOptions;comparison=null;lab.restoreRecording(bundle);refreshComparisonChannels();fillOptions(comparisonOptions);comparison=restoredComparison;comparisonPage=0;renderComparison();$('referenceSource').textContent=reference?`${reference.name} · ${reference.samples.length} samples · Restored, provenance unverified`:'No comparison recording loaded.';$('workspaceStatus').textContent='Workspace restored locally. Measurement checks and comparisons were recomputed; saved operation descriptions remain unverified.';}
  finally{applyingWorkspace=false;}
}
function printComparison(section) {
  if(!comparison)return;section.append(node('h3','Reference / repeat comparison'),node('p',`${reference.name}; ${comparison.decision}; ${comparison.counts.exceeds} outside tolerance; ${comparison.counts.uncertain} uncertain; ${(comparison.coverage*100).toFixed(1)}% coverage.`),node('p',`Applied settings: ${JSON.stringify(comparison.options)}.`),node('p',comparison.scope));
  const table=node('table');const header=node('tr');for(const title of ['Sample','Comparison sample','Current','Comparison','Delta','Status'])header.append(node('th',title));table.append(header);for(const pair of comparison.pairs.filter(p=>p.status!=='within').slice(0,32)){const row=node('tr');for(const value of [pair.sampleIndex+1,pair.referenceIndex===null?'—':pair.referenceIndex+1,f(pair.value),f(pair.referenceValue),f(pair.delta),pair.status])row.append(node('td',String(value)));table.append(row);}section.append(table,node('p','Selected comparison evidence only. The JSON report and workspace contain every pair and the complete comparison recording.'));
}

const financeLabels={teams:'Active labs',price:'Monthly price ($/lab)',supportHours:'Monthly support hours / lab',laborRate:'Founder labor value ($/h)',fixed:'Shared monthly overhead ($)',onboardingHours:'Onboarding hours / new lab',cac:'Acquisition cost / new lab ($)',churn:'Monthly churn fraction',feeRate:'Payment fee fraction',pilotPrice:'Pilot price ($)',pilotHours:'Pilot delivery hours',runsPerMonth:'Customer runs / month',minutesSaved:'Minutes saved / run',researchHourlyRate:'Customer time value ($/h)'};
function renderFinanceInputs() {const container=$('economicsInputs');container.replaceChildren();for(const [key,title] of Object.entries(financeLabels)){const field=inputLabel(container,title,`finance-${key}`,financeInputs[key],{min:0,max:key==='churn'||key==='feeRate'?1:1000000});field.addEventListener('input',()=>{for(const scenario of ['Downside','Base','Upside'])$(`biz${scenario}`).setAttribute('aria-pressed','false');renderFinance();});}}
function getFinanceInputs() {const values={};for(const key of Object.keys(financeLabels))values[key]=number(`finance-${key}`);return values;}
function renderFinance() {
  const out=$('bizOut');out.replaceChildren();try {
    const result=calculateEconomics(getFinanceInputs());financeInputs=result.inputs;message('financeError','');
    const stats=node('div',undefined,'finance-results');for(const [label,value] of [['Monthly revenue',result.monthlyRevenue],['Ongoing surplus after stated costs',result.monthlySurplus],['First month: all labs newly acquired',result.firstMonthSurplus],['Pilot margin after delivery labor + fees',result.pilotMargin]]){const block=node('div');block.append(node('p',label,'help'),node('p',money(value),'metric'));stats.append(block);}out.append(stats);
    out.append(node('p',`Ongoing costs: support ${money(result.supportCost)} + transaction fees ${money(result.transactionCost)} + replacement acquisition/onboarding ${money(result.replacementCost)} + shared overhead ${money(result.inputs.fixed)} = ${money(result.monthlyCosts)}.`),node('p',`Contribution / lab ${money(result.contribution)}. Break-even ${result.breakEvenTeams===null?'unavailable under these assumptions':result.breakEvenTeams+' labs'}. Acquisition + onboarding / new lab ${money(result.acquisitionCostPerTeam)}.`),node('p',`Illustrative acquisition payback ${result.paybackMonths===null?'unavailable':result.paybackMonths.toFixed(2)+' months'}. Constant-size replacement model; these are scenarios, not growth forecasts.`),node('p',`Customer monthly time-value assumption ${money(result.customerMonthlyTimeValue)}. At these assumptions, ${result.runsBreakEvenForCustomer===null?'no finite number of runs offsets the price':result.runsBreakEvenForCustomer+' runs / month offsets the price'}. Savings have not been observed.`),node('p',result.scope,'help'));
  }catch(error){message('financeError',error.message);out.append(node('p','Correct the inputs to calculate the scenario.','help'));}
}
function init() {
  const controls=$('comparisonControls');selectLabel(controls,'Channel','compareChannel',KEYS.map(k=>[k,channelName(k)]));selectLabel(controls,'Purpose','compareRole',[['reference','Supplied reference'],['repeat','Repeat run']]);
  for(const [label,id,key] of [['Tolerance','compareTolerance','tolerance'],['Reference uncertainty bound','compareUncertainty','uncertainty'],['Timestamp offset (s)','compareOffset','timeOffsetSeconds'],['Max match distance (s)','compareDistance','maxMatchDistance'],['Max reference step','compareStep','maxReferenceStep'],['Minimum coverage (0–1)','compareCoverage','minCoverage'],['Minimum usable pairs','comparePairs','minPairs']])inputLabel(controls,label,id,DEFAULT_COMPARISON[key]);
  fillOptions(comparisonOptions);renderProtocolEditor();refreshComparisonChannels();renderComparison();renderFinanceInputs();renderFinance();
  lab.setImportHandler((text,name)=>showMapping(text,name));
  document.addEventListener('patchline:state',stateChanged);
  lab.setReportExtension(()=>({comparison,reference:reference?{...reference,kind:reference.kind==='synthetic'?'synthetic':'imported'}:null,profile:currentProfile}),printComparison);
  action('btnConfirmImport','mappingError',confirmImport);
  $('btnCancelImport').addEventListener('click',()=>{pendingImport=null;$('mappingPanel').hidden=true;$('fileInput').focus();});
  $('referenceFile').addEventListener('change',async event=>{const file=event.target.files[0];const token=++referenceRead;event.target.value='';try{const text=await readFile(file,1048576);if(token!==referenceRead)return;showMapping(text,file.name,'reference');message('comparisonError','');}catch(error){if(token===referenceRead)message('comparisonError',error.message);}});
  action('btnUseOriginal','comparisonError',()=>{const {trace}=lab.getState();if(!trace)throw new Error('Load a recording first.');referenceRead++;setReference(trace);});
  action('btnClearReference','comparisonError',()=>{referenceRead++;reference=null;comparison=null;$('referenceSource').textContent='No comparison recording loaded.';refreshComparisonChannels();renderComparison();});
  action('btnCompare','comparisonError',runComparison);
  action('btnExportComparison','comparisonError',()=>{if(!comparison)throw new Error('Run a comparison first.');download('patchline-comparison.json',JSON.stringify(comparison,null,2));});
  controls.addEventListener('input',()=>{if(comparison)message('comparisonError','Settings changed. The displayed comparison and export retain the last applied settings until you compare again.');});
  action('btnSaveProtocol','protocolError',()=>{lab.setProtocol(protocolFromEditor());$('protocolStatus').textContent='Protocol applied to the complete recording. Controlled modifications were reset; compare again under this protocol.';});
  action('btnExportProtocol','protocolError',()=>download('patchline-protocol.json',serializeProtocol(lab.getState().configuredProtocol,currentProfile)));
  $('protocolFile').addEventListener('change',async event=>{const file=event.target.files[0],token=++protocolRead;event.target.value='';try{const text=await readFile(file,32768);if(token!==protocolRead)return;const bundle=restoreProtocol(text);currentProfile=bundle.profile;lab.setProtocol(bundle.protocol);message('protocolError','');$('protocolStatus').textContent='Protocol and import profile restored. Uploaded units and recording provenance remain your responsibility.';}catch(error){if(token===protocolRead)message('protocolError',error.message);}});
  action('btnExportWorkspace','workspaceError',()=>{const {trace,result,configuredProtocol}=lab.getState();if(!trace||!result)throw new Error('Load a recording first.');download('patchline-workspace.json',serializeWorkspace({trace,derivedSamples:result.samples,operations:result.operations,protocol:configuredProtocol,profile:currentProfile,reference,comparisonOptions:comparison?.options||readOptions()}));$('workspaceStatus').textContent='Complete originals, derived readings, protocol, import profile and comparison settings saved locally.';});
  $('workspaceFile').addEventListener('change',async event=>{const file=event.target.files[0],token=++workspaceRead;event.target.value='';try{const text=await readFile(file,4194304);if(token!==workspaceRead)return;restoreBundle(restoreWorkspace(text));message('workspaceError','');}catch(error){if(token===workspaceRead)message('workspaceError',error.message);}});
  action('btnInvestigation','comparisonError',()=>{referenceRead++;const trace=createSyntheticTrace('change',7);lab.setProtocol(DEFAULT_PROTOCOL);lab.loadRecording(trace);setReference(trace);fillOptions(DEFAULT_COMPARISON);lab.applyFault({type:'drift',channel:'temperature',index:8,severity:2.5,seed:7});runComparison();$('comparisonOut').scrollIntoView({block:'start'});});
  action('btnRecorded','workspaceError',()=>{referenceRead++;reference=null;comparison=null;currentProfile=validateProfile({name:'UCI environmental temperature',timeColumn:'timestamp_s',timeUnit:'s',channels:{temperature:{column:'temperature_c',unit:'C'}}});const protocol=validateResearchProtocol({...DEFAULT_PROTOCOL,name:'UCI temperature sampling review',revision:'1',channels:['temperature'],maxGapSeconds:60});lab.setProtocol(protocol);lab.loadRecording(parseMappedCSV(UCI_TEMPERATURE_CSV,currentProfile,'UCI-S1-temperature-5000.csv'));$('referenceSource').textContent='No comparison recording loaded.';$('workspaceStatus').textContent='Loaded credited environmental temperature data: 5,000 unchanged readings. Nominal 30-second cadence; gaps above the declared 60-second maximum remain visible.';$('source').scrollIntoView({block:'center'});});
  for(const name of ['Downside','Base','Upside'])action(`biz${name}`,'financeError',()=>{financeInputs={...ECONOMICS_DEFAULTS,...SCENARIOS[name.toLowerCase()].overrides};delete financeInputs.label;delete financeInputs.scope;renderFinanceInputs();renderFinance();for(const n of ['Downside','Base','Upside'])$(`biz${n}`).setAttribute('aria-pressed',String(n===name));});
  action('btnExportEconomics','financeError',()=>download('patchline-business-assumptions.json',serializeEconomics(getFinanceInputs())));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
