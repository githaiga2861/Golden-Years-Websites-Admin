#!/usr/bin/env python3
"""Restores the signed-URL resume download in the admin app.
The Applications tab reverted to a raw <a href> pointing at a bare storage
path, which the browser resolved against the Vercel domain -> 404.
Run from inside ~/Golden-Years-Websites-Admin."""

f = 'index.html'
s = open(f, encoding='utf-8').read()

if 'openSignedResume' in s:
    print("Already fixed — nothing to do."); raise SystemExit(0)

OLD = """        (a.resume_url?'<a class="abtn abtn--go" href="'+esc(a.resume_url)+'" target="_blank" rel="noopener">Download Resume</a>':'')+"""
NEW = """        (a.resume_url?'<button class="abtn abtn--go" onclick=\\'openSignedResume('+JSON.stringify(a.resume_url)+',this)\\'>Download Resume</button>':'')+"""
assert OLD in s, "resume link pattern not found"
s = s.replace(OLD, NEW, 1)

# Completed-form link too, if present in the same shape
OLD2 = """        (a.filled_form_url?'<a class="abtn" href="'+esc(a.filled_form_url)+'" target="_blank" rel="noopener">Completed Form</a>':'')+"""
NEW2 = """        (a.filled_form_url?'<button class="abtn" onclick=\\'openSignedResume('+JSON.stringify(a.filled_form_url)+',this)\\'>Completed Form</button>':'')+"""
if OLD2 in s:
    s = s.replace(OLD2, NEW2, 1)
    print("Also restored: Completed Form link")

HELPERS = """function extractStoragePath(value){
  if(!value) return null;
  var pub = '/public/resumes/';
  var i = value.indexOf(pub);
  if(i !== -1) return decodeURIComponent(value.slice(i + pub.length));
  var sig = '/sign/resumes/';
  var j = value.indexOf(sig);
  if(j !== -1) return decodeURIComponent(value.slice(j + sig.length).split('?')[0]);
  if(value.indexOf('http') === 0) return null;
  return value;
}
async function openSignedResume(rawValue, btnEl){
  var path = extractStoragePath(rawValue);
  if(!path){ toast('Could not resolve that file.'); return; }
  var original = btnEl.textContent;
  btnEl.textContent = 'Preparing…';
  try{
    var r = await sb.storage.from('resumes').createSignedUrl(path, 3600);
    if(r.error || !r.data) throw r.error || new Error('no data');
    window.open(r.data.signedUrl, '_blank', 'noopener');
  }catch(e){
    toast('Could not open the file — it may have been removed.');
  }
  btnEl.textContent = original;
}
async function loadApplications("""
assert "async function loadApplications(" in s
s = s.replace("async function loadApplications(", HELPERS, 1)

open(f, 'w', encoding='utf-8').write(s)
print("FIXED: resume downloads now use signed URLs")
