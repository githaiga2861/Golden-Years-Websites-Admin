#!/usr/bin/env python3
"""Corrects the fax number from (253) 229-8194 to (253) 299-8194 across
every file, catching all common formatting variations.
Run from inside any repo root."""
import glob, os

# Every plausible way the old number could be written
REPLACEMENTS = [
    ('(253) 229-8194', '(253) 299-8194'),
    ('(253)229-8194',  '(253)299-8194'),
    ('253-229-8194',   '253-299-8194'),
    ('253.229.8194',   '253.299.8194'),
    ('253 229 8194',   '253 299 8194'),
    ('+12532298194',   '+12532998194'),
    ('12532298194',    '12532998194'),
    ('2532298194',     '2532998194'),
]

EXTS = ('.html', '.js', '.css', '.json', '.md', '.txt', '.xml')
SKIP_DIRS = {'.git', 'node_modules', 'images', 'dist', 'build'}

total_files = 0
total_hits = 0

for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for fname in files:
        if not fname.endswith(EXTS):
            continue
        path = os.path.join(root, fname)
        try:
            with open(path, encoding='utf-8') as f:
                s = f.read()
        except (UnicodeDecodeError, PermissionError):
            continue

        original = s
        hits = 0
        for old, new in REPLACEMENTS:
            c = s.count(old)
            if c:
                s = s.replace(old, new)
                hits += c

        if s != original:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(s)
            print(f"  {path}: {hits} replacement(s)")
            total_files += 1
            total_hits += hits

print(f"\nTotal: {total_hits} replacement(s) across {total_files} file(s)")
if total_hits == 0:
    print("(Nothing found — either already correct, or the number isn't in this repo)")
