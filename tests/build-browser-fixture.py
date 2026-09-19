from pathlib import Path
import json,re
root=Path(__file__).resolve().parent.parent
html=(root/'index.html').read_text()
html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
html=html.replace('<head>','<head><base href="https://jordanlupo-png.github.io/Road-to-42/">')
css=(root/'theme.css').read_text()
scripts='\n'.join((root/p).read_text() for p in ['tests/mock-client.js','core.js','game.js','features.js'])
html=html.replace('</head>','<style>'+css+'</style></head>')
html=html.replace('<body>','<body><div id="qaErrors" role="status"></div><script>window.addEventListener("error",e=>{document.getElementById("qaErrors").textContent+=e.message+"; "});window.addEventListener("unhandledrejection",e=>{document.getElementById("qaErrors").textContent+=String(e.reason)+"; "});</script>')
html=html.replace('</body>','<script>'+scripts+'</script></body>')
harness='''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Road to 42 mobile QA</title></head><body style="margin:0;background:#ddd">
<label>Phone width<select id="width"><option>320</option><option>360</option><option selected>390</option><option>430</option><option>768</option></select></label>
<label>Scenario<select id="scenario"><option value="returning">Returning runner</option><option value="new">New runner</option><option value="level">Level up</option><option value="error">Save error</option><option value="duplicate">Duplicate review</option></select></label>
<button id="load">Load scenario</button><iframe title="Game preview" style="display:block;border:0;width:390px;height:844px"></iframe>
<script>const markup=MARKUP;function load(){document.querySelector('iframe').srcdoc=markup.replace('<head>','<head><script>window.QA_SCENARIO='+JSON.stringify(document.getElementById('scenario').value)+';<\\/script>')}
document.getElementById('load').onclick=load;document.getElementById('width').onchange=e=>document.querySelector('iframe').style.width=e.target.value+'px';load();</script></body></html>'''
harness=harness.replace('MARKUP',json.dumps(html).replace('</script','<\\/script'))
(root/'tests/browser-fixture.html').write_text(harness)
