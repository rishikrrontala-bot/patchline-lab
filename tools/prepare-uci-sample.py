"""Reproduce the credited external interoperability sample; never invent readings."""
import argparse
import csv
from datetime import datetime
import hashlib
import io
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('archive', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
with zipfile.ZipFile(args.archive) as archive:
    raw = archive.read('Occupancy_Estimation.csv')
rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))[:5000]
times = [datetime.strptime(row['Date']+' '+row['Time'], '%Y/%m/%d %H:%M:%S') for row in rows]
seconds = [(stamp-times[0]).total_seconds() for stamp in times]
assert all(b > a for a,b in zip(seconds, seconds[1:])), 'Source order must remain intact'
out = io.StringIO(newline='')
writer = csv.writer(out, lineterminator='\n')
writer.writerow(['timestamp_s','temperature_c','original_date','original_time'])
for row,t in zip(rows,seconds):
    writer.writerow([int(t),row['S1_Temp'],row['Date'],row['Time']])
text = out.getvalue()
directory = root/'samples'
directory.mkdir(exist_ok=True)
(directory/'uci-temperature-5000.csv').write_text(text)
(directory/'uci-temperature.js').write_text('export const UCI_TEMPERATURE_CSV = '+json.dumps(text)+';\n')
manifest = {
    'title':'Room Occupancy Estimation — S1_Temp first 5,000 records',
    'creators':'Adarsh Pal Singh and Sachin Chaudhari',
    'datasetDOI':'https://doi.org/10.24432/C5P605',
    'source':'https://archive.ics.uci.edu/dataset/864/room+occupancy+estimation',
    'download':'https://archive.ics.uci.edu/static/public/864/room%2Boccupancy%2Bestimation.zip',
    'license':'CC BY 4.0',
    'licenseURL':'https://creativecommons.org/licenses/by/4.0/',
    'rawCSV_SHA256':hashlib.sha256(raw).hexdigest(),
    'sampleCSV_SHA256':hashlib.sha256(text.encode()).hexdigest(),
    'transformation':'First 5,000 source rows in original order. Date + Time converted to elapsed seconds relative to first row without assuming a timezone. S1_Temp strings preserved verbatim; source Date and Time retained. All other sensor/occupancy fields omitted.',
    'rows':len(rows), 'durationSeconds':seconds[-1],
    'maximumGapSeconds':max(b-a for a,b in zip(seconds,seconds[1:])),
    'scope':'Recorded environmental temperature. Import interoperability evidence only; no smart-bandage, patient, calibration or fault ground truth. No source affiliation or endorsement.'
}
(directory/'uci-manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({key:manifest[key] for key in ['rows','durationSeconds','maximumGapSeconds','sampleCSV_SHA256']}))
