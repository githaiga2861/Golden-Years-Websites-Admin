#!/usr/bin/env python3
"""Forces every date/time shown in the admin app to Washington State time
(America/Los_Angeles), regardless of the browser viewing it or where the
record was actually created. Run from inside ~/Golden-Years-Websites-Admin."""
f = 'index.html'
s = open(f, encoding='utf-8').read()

old = "function fmtDate(d){try{return new Date(d).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})+' · '+new Date(d).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});}catch(e){return '';}}"

new = "function fmtDate(d){try{var WA={timeZone:'America/Los_Angeles'};return new Date(d).toLocaleDateString('en-US',Object.assign({year:'numeric',month:'short',day:'numeric'},WA))+' · '+new Date(d).toLocaleTimeString('en-US',Object.assign({hour:'numeric',minute:'2-digit'},WA))+' PT';}catch(e){return '';}}"

if old not in s:
    print("Exact pattern not found — may already be fixed."); raise SystemExit(1)

s = s.replace(old, new, 1)
open(f, 'w', encoding='utf-8').write(s)
print("fmtDate now always renders in Washington State time (America/Los_Angeles), labeled 'PT'")
