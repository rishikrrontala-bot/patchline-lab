from pathlib import Path
import shutil
import zipfile
root=Path(__file__).resolve().parent.parent
files=['research-engine.js','economics-engine.js','workbench.js','samples/uci-temperature.js','samples/uci-temperature-5000.csv','samples/uci-manifest.json','submission/PILOT-OFFER.md','submission/CUSTOMER-VALIDATION-KIT.md','tools/prepare-uci-sample.py','tests/research-engine.test.mjs','tests/economics-engine.test.mjs','index.html','favicon.svg','submission/technical-walkthrough.html','engine.js','lab-engine.js','lab-app.js','lab.css','styles.css','README.md','LIMITATIONS.md','MODEL_CARD.md','DESIGN.md','submission/next-founders-pitch.md','submission/business-validation.md','submission/market-evidence.md','tools/serve.mjs','package.json','tests/engine.test.mjs','tests/lab-engine.test.mjs']
files.extend(p.name for p in root.glob('LICENSE*') if p.is_file())
files.extend(['tools/finalize-demo.cjs','proof/demo-edit-decision-list.json','proof/video-verification.json','submission/RELEASE-NOTES.md','proof/deployment-verification.json','tools/buyer-browser-qa.cjs','proof/buyer-browser-qa.json','proof/research-status-qa.json','proof/max-length-fixture.csv','proof/malformed.csv','proof/release-verification.json','.github/workflows/verify.yml','proof/benchtop-fixture.csv','buyer-value-engine.js','buyer-value-ui.js','tests/buyer-value-engine.test.mjs','vercel.json','submission/VERIFICATION.md','submission/DEVPOST-DRAFT.md','submission/BUILD-CHECKLIST.md','tools/package-public.py','tools/build-walkthrough.py','tools/verify-research.mjs','tools/browser-runtime.cjs','tools/browser-qa.cjs','tools/research-browser-qa.cjs','tools/research-status-qa.cjs','tools/record-demo.cjs','tools/video-qa.cjs','proof/research-verification.json','proof/browser-qa.json','proof/research-browser-qa.json','proof/research-browser-performance.json'])
missing=[name for name in files if not (root/name).is_file()]
if missing: raise SystemExit('Cannot package incomplete edition: '+', '.join(missing))
out=root/'dist'
out.mkdir(exist_ok=True)
for old in out.iterdir():
 if old.is_file(): old.unlink()
 elif old.is_dir(): shutil.rmtree(old)
for name in files:
 target=out/name
 target.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(root/name,target)
archive=root/'submission'/'Patchline-Lab-Next-Founders.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for name in files: z.write(root/name,name)
print('Public files packaged: '+str(len(files)))
print('Archive: '+str(archive))
