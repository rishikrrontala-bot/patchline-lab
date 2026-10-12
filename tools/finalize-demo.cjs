// Edit the real UI recording into the voiceover's seven chapters.
// No generated footage, rendered app results, audio, or network calls are used.
// Requires a full FFmpeg installation with a VP8 decoder. Set PATCHLINE_FFMPEG.
// Reproduce using --source FILE --edl proof/demo-edit-decision-list.json --mp4.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const argument = name => {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')) throw new Error(`${name} requires a file path.`);
  return process.argv[index + 1];
};
const raw = argument('--source') ? path.resolve(argument('--source')) : path.join(root, 'submission/Patchline-Lab-5-minute-silent.webm');
const output = path.join(root, 'submission/Patchline-Lab-5-minute-final.webm');
const ffmpeg = process.env.PATCHLINE_FFMPEG || 'ffmpeg';
const fps = 25;
const targetFrames = 7499; // 299.96 seconds, including the final frame.
const defaultSegments = [
  {chapter: 1, label: 'Problem and workflow', source: [0, 30], seconds: 30},
  {chapter: 2, label: 'Recorded import and selected channel', source: [30, 76], seconds: 15},
  {chapter: 2, label: 'Full-record sampling gaps and exact source row', source: [524, 542], seconds: 30},
  {chapter: 3, label: 'Labelled synthetic comparison and discrepancy plot', source: [542, 553], seconds: 20},
  {chapter: 3, label: 'Actual pairs and exact source sample', source: [553, 565], seconds: 25},
  {chapter: 3, label: 'Original versus derived readings and evidence export', source: [565, 575], seconds: 20},
  {chapter: 4, label: 'Workspace export, restore and recomputation', source: [575, 588], seconds: 20},
  {chapter: 4, label: 'Unverified restored provenance and reusable protocol', source: [588, 594], seconds: 15},
  {chapter: 5, label: 'Pure engines and local architecture', source: [594, 603], seconds: 16},
  {chapter: 5, label: 'Actual comparison source and uncertainty boundary', source: [603, 617], seconds: 24},
  {chapter: 6, label: 'Executed engineering proof and scope', source: [617, 632], seconds: 17},
  {chapter: 6, label: 'Inherited generated-fault benchmark and explicit misses', source: [632, 647], seconds: 18},
  {chapter: 7, label: 'Bounded pilot offer', source: [1016.5, 1021.5], seconds: 12},
  {chapter: 7, label: 'Transparent seller economics', source: [1021.5, 1024.5], seconds: 12},
  {chapter: 7, label: 'Hypothetical buyer value shortfall', source: [1024.5, 1040], seconds: 14},
  {chapter: 7, label: 'Unvalidated demand and builder credit', source: [1135, 1152.24], seconds: 11.96},
];
const customEdit = argument('--edl') ? JSON.parse(fs.readFileSync(path.resolve(argument('--edl')), 'utf8')) : null;
const segments = structuredClone(customEdit ? customEdit.segments : defaultSegments);
const expectedInputSHA256 = customEdit ? customEdit.inputSHA256 : '3d2ea6a0b05da307d2572f74175d582d92f446dadf62ecf1d5cba10b8ce6db02';
if (!Array.isArray(segments) || segments.length < 7 || segments.length > 80 || !/^[a-f0-9]{64}$/.test(expectedInputSHA256 || '')) throw new Error('An edit list requires 7–80 segments and the exact inputSHA256.');
let elapsed = 0;
let previousSourceEnd = 0;
for (const segment of segments) {
  if (!Number.isInteger(segment.chapter) || segment.chapter < 1 || segment.chapter > 7 || typeof segment.label !== 'string' ||
      !Array.isArray(segment.source) || segment.source.length !== 2 || !segment.source.every(Number.isFinite) ||
      segment.source[0] < previousSourceEnd || segment.source[1] <= segment.source[0] ||
      !Number.isFinite(segment.seconds) || segment.seconds <= 0) throw new Error('Edit segments require ordered source ranges, valid chapters and positive finite durations.');
  previousSourceEnd = segment.source[1];
  segment.output = [elapsed, elapsed + segment.seconds];
  elapsed += segment.seconds;
}
if (Math.abs(elapsed - targetFrames / fps) > 1e-7) throw new Error('Edit must match the five-minute frame budget.');
const chapterOrder = [...new Set(segments.map(segment => segment.chapter))];
if (JSON.stringify(chapterOrder) !== JSON.stringify([1, 2, 3, 4, 5, 6, 7]) || segments.some((segment, index) => index > 0 && segment.chapter < segments[index - 1].chapter)) throw new Error('The seven chapters must appear once, in order.');
const chapterSeconds = [30, 45, 65, 35, 40, 35, 49.96];
for (const chapter of chapterOrder) {
  const duration = segments.filter(segment => segment.chapter === chapter).reduce((sum, segment) => sum + segment.seconds, 0);
  if (Math.abs(duration - chapterSeconds[chapter - 1]) > 1e-7) throw new Error(`Chapter ${chapter} does not match the narration timeline.`);
}
if (!fs.existsSync(raw)) throw new Error('Original real UI recording is missing.');
const decoders = spawnSync(ffmpeg, ['-hide_banner', '-decoders'], {encoding: 'utf8'});
if (decoders.status !== 0 || !/\bvp8\b/.test(decoders.stdout)) throw new Error('Use full FFmpeg with a VP8 decoder; the minimal browser recorder binary cannot decode this source.');
const inputSHA256 = crypto.createHash('sha256').update(fs.readFileSync(raw)).digest('hex');
if (inputSHA256 !== expectedInputSHA256) throw new Error('This source differs from the reviewed recording. Supply its own verified --edl file; do not reuse cut times from another capture.');
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({inputSHA256, durationSeconds: elapsed, segments: segments.length, valid: true}));
  process.exit(0);
}
let expression = '0';
for (const segment of segments) {
  const [start, end] = segment.source;
  const multiplier = segment.seconds / (end - start);
  expression = `if(gte(T,${start}),${segment.output[0]}+(T-${start})*${multiplier.toFixed(14)},${expression})`;
}
const selection = segments.map(({source: [start, end]}) => `(gte(t,${start})*lt(t,${end}))`).join('+');
const filter = `select='${selection}',setpts='(${expression})/TB',fps=${fps},setpts=N/(${fps}*TB)`;
const temporary = output.replace(/\.webm$/, '.editing.webm');
const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', raw, '-vf', filter,
  '-an', '-map_metadata', '-1', '-frames:v', String(targetFrames), '-c:v', 'libvpx-vp9',
  '-b:v', '0', '-crf', '26', '-cpu-used', '6', '-row-mt', '1', '-threads', '4',
  '-pix_fmt', 'yuv420p', temporary];
const result = spawnSync(ffmpeg, args, {encoding: 'utf8', maxBuffer: 2 * 1024 * 1024});
if (result.status !== 0) {fs.rmSync(temporary, {force: true}); throw new Error(result.stderr || 'Video encoding failed.');}
fs.renameSync(temporary, output);
const chapters = [...new Set(segments.map(s => s.chapter))].map(chapter => {
  const parts = segments.filter(s => s.chapter === chapter);
  return {chapter, output: [parts[0].output[0], parts.at(-1).output[1]]};
});
const manifest = {schema: 'patchline-demo-edit-v1', input: path.relative(root, raw), inputSHA256,
  output: path.relative(root, output), outputSHA256: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),
  durationSeconds: targetFrames / fps, fps, frames: targetFrames, width: 1280, height: 720,
  audio: 'none', editing: 'Real recorded app actions. Long recorder holds removed; retained actions paced to narration chapters. Source readings and app results are unchanged.',
  chapters, segments};
fs.writeFileSync(path.join(root, 'proof/demo-edit-decision-list.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({output, durationSeconds: manifest.durationSeconds, bytes: fs.statSync(output).size, chapters}));
if (process.argv.includes('--mp4')) {
  const mp4 = output.replace(/\.webm$/, '.mp4');
  const converted = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', output,
    '-an', '-map_metadata', '-1', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], {encoding: 'utf8', maxBuffer: 2 * 1024 * 1024});
  if (converted.status !== 0) throw new Error(converted.stderr || 'MP4 conversion failed.');
  manifest.alternativeMP4 = {file: path.relative(root, mp4), bytes: fs.statSync(mp4).size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(mp4)).digest('hex'), codec: 'H.264', audio: 'none'};
  fs.writeFileSync(path.join(root, 'proof/demo-edit-decision-list.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({mp4, bytes: fs.statSync(mp4).size}));
}
