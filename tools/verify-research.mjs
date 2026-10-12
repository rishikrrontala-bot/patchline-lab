// Independent engineering cases: no patient labels or calibration ground truth.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { parseMappedCSV, compareRecordings, DEFAULT_COMPARISON, validateResearchProtocol } from '../research-engine.js';
import { DEFAULT_PROTOCOL, applyFault, inspectTrace } from '../lab-engine.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let seed=0x8a9120f1;
function random(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
const examples=[];
for(let caseIndex=0;caseIndex<120;caseIndex++) {
  const amplitude=0.5+random()*2,frequency=0.01+random()*0.08,phase=random()*6.28;
  let time=0;
  const samples=Array.from({length:80},(_,i)=>{time+=0.9+random()*0.2;return {t:time,temperature:25+amplitude*Math.sin(i*frequency+phase)+i*0.02,moisture:null,ph:null,glucose:null};});
  const reference={id:`reference-${caseIndex}`,name:'Analytical reference',kind:'imported',channels:['temperature'],samples};
  const category=['shared-changing-signal','declared-offset-exceeds','below-tolerance-change','uncertain-boundary','missing-reference','unstable-reference'][caseIndex%6];
  const current=structuredClone(reference);current.id=`current-${caseIndex}`;
  const supplied=structuredClone(reference);
  let expected;
  if(category==='shared-changing-signal')expected='within-tolerance';
  if(category==='declared-offset-exceeds'){for(const s of current.samples)s.temperature+=1+random()*0.3;expected='discrepancy';}
  if(category==='below-tolerance-change'){for(const s of current.samples)s.temperature+=0.1;expected='within-tolerance';}
  if(category==='uncertain-boundary'){for(const s of current.samples)s.temperature+=0.5;expected='inconclusive';}
  if(category==='missing-reference'){for(const s of supplied.samples)s.temperature=null;expected='inconclusive';}
  if(category==='unstable-reference'){for(const [i,s] of supplied.samples.entries())s.temperature+=(i%2?3:-3);expected='inconclusive';}
  const result=compareRecordings(current,supplied,DEFAULT_COMPARISON);
  examples.push({caseIndex,category,expected,actual:result.decision,counts:result.counts,coverage:result.coverage,passed:result.decision===expected});
}
const byCategory={};for(const example of examples){const row=byCategory[example.category]||={cases:0,passed:0};row.cases++;if(example.passed)row.passed++;}
const profile={name:'UCI recorded temperature',timeColumn:'timestamp_s',timeUnit:'s',channels:{temperature:{column:'temperature_c',unit:'C'}}};
const text=fs.readFileSync(path.join(root,'samples/uci-temperature-5000.csv'),'utf8');
const protocol=validateResearchProtocol({...DEFAULT_PROTOCOL,channels:['temperature'],maxGapSeconds:60});
const durations=[];let external;
for(let i=0;i<15;i++) {
  const start=performance.now();const trace=parseMappedCSV(text,profile,'UCI-S1-temperature-5000.csv');
  const quality=inspectTrace(trace.samples,protocol);
  const changed=applyFault(trace,{type:'drift',channel:'temperature',index:2500,severity:1,seed:123});
  const comparison=compareRecordings({...trace,samples:changed.samples},trace,DEFAULT_COMPARISON);
  durations.push(performance.now()-start);
  external={rows:trace.samples.length,qualityFindings:quality.findings.length,qualityCodes:[...new Set(quality.findings.map(f=>f.code))],comparisonDecision:comparison.decision,comparisonCounts:comparison.counts,coverage:comparison.coverage};
}
const sorted=[...durations].sort((a,b)=>a-b);
const report={version:'2.0.0',seed:'0x8a9120f1',cases:examples.length,passed:examples.filter(x=>x.passed).length,byCategory,examples,external,
  performance:{runtime:`Node ${process.version} ${process.platform}/${process.arch}`,repetitions:durations.length,work:'Parse 5,000 recorded temperature rows, inspect, inject labelled drift copy, compare with original control',medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],durationsMs:durations},
  scope:'Engineering cases independently constructed from analytic signals, using fixed declared options. They test expected comparison decisions, not real sensor-fault accuracy. The UCI sample validates recorded environmental temperature interoperability; injected modifications are simulated and the original is not calibrated ground truth.'};
fs.writeFileSync(path.join(root,'proof/research-verification.json'),JSON.stringify(report,null,2));
assert.equal(report.passed,report.cases,'Engineering cases must match their predeclared decision');
assert.equal(external.rows,5000);assert.equal(external.comparisonDecision,'discrepancy');
console.log(JSON.stringify({cases:report.cases,passed:report.passed,byCategory,external,performance:{medianMs:report.performance.medianMs,p95Ms:report.performance.p95Ms}}));
