#!/usr/bin/env python3
"""
Re-derive the reference tool's colour-legend values from the PDFs in docs/assets.

Every hex and bin boundary quoted in docs/keysight-vdt-research.md section 11.3.3
comes out of this script, so the claim is reproducible rather than remembered.

  python3 tools/legend-extract/measure-legends.py           # measure known panels
  python3 tools/legend-extract/measure-legends.py --scan    # re-scan every figure

Needs: pymupdf, pillow, numpy, scipy.
"""
import argparse
import glob
import os
import sys
from collections import Counter

PDF_DIR = 'docs/assets/reference-pdfs'

# Panels located by --scan, then read by eye at 5-7x magnification. Coordinates are
# in the embedded image's own pixel space, not the PDF page's.
PANELS = [
    {
        'name': 'RSCP colour legend (docked "Color Legends" panel)',
        'pdf': '5992-2005EN_Nemo-Analyze-Technical-Overview.pdf',
        'page': 15, 'xref': 47, 'lossless': True,
        'title': 'RSCP (dBm) [Time]',
        'swatch_x': (1105, 1117),
        'rows': [((312, 322), '>= -80', '6749', '63.66%'),
                 ((326, 336), '< -80 and >= -90', '2796', '26.37%'),
                 ((340, 350), '< -90 and >= -100', '871', '8.22%'),
                 ((355, 366), '< -100', '186', '1.75%')],
    },
    {
        'name': 'EcNo colour legend (floating map legend, older UI)',
        'pdf': '5992-2005EN_Nemo-Analyze-Technical-Overview.pdf',
        'page': 14, 'xref': 44, 'lossless': False,
        'title': 'EcNo',
        'swatch_x': (359, 373),
        'rows': [((63, 75), '>= -5', None, None),
                 ((78, 90), '>= -8 and < -5', None, None),
                 ((93, 105), '>= -10 and < -8', None, None),
                 ((108, 120), '< -10', None, None)],
    },
]


def load(pdf, xref):
    import pymupdf
    from PIL import Image
    import io
    d = pymupdf.open(os.path.join(PDF_DIR, pdf))
    info = d.extract_image(xref)
    return Image.open(io.BytesIO(info['image'])).convert('RGB')


def measure():
    for p in PANELS:
        im = load(p['pdf'], p['xref'])
        print(f"\n{p['name']}")
        print(f"  {p['pdf']} page {p['page']} xref {p['xref']} "
              f"({im.width}x{im.height}, {'lossless PNG' if p['lossless'] else 'lossy source'})")
        print(f"  legend title: {p['title']}")
        x0, x1 = p['swatch_x']
        for (y0, y1), label, count, pct in p['rows']:
            c = Counter(im.getpixel((x, y)) for x in range(x0, x1) for y in range(y0, y1))
            (r, g, b), n = c.most_common(1)[0]
            total = sum(c.values())
            stats = f"  n={count} {pct}" if count else ""
            print(f"    #{r:02X}{g:02X}{b:02X}  purity {100 * n / total:5.1f}%  {label}{stats}")


def scan():
    """Find candidate legends anywhere: vertical stacks of small uniform saturated blocks."""
    import numpy as np
    import pymupdf
    from PIL import Image
    from scipy import ndimage
    import io

    for path in sorted(glob.glob(f'{PDF_DIR}/*.pdf')):
        d = pymupdf.open(path)
        seen = set()
        for pno in range(d.page_count):
            for (xref, *_r) in d[pno].get_images(full=True):
                if xref in seen:
                    continue
                seen.add(xref)
                try:
                    info = d.extract_image(xref)
                except Exception:
                    continue
                if info['width'] * info['height'] < 200_000:
                    continue
                im = Image.open(io.BytesIO(info['image'])).convert('RGB')
                a = np.asarray(im).astype(np.int16)
                sat = a.max(axis=2) - a.min(axis=2)
                lab, n = ndimage.label((sat > 60) & (a.max(axis=2) > 90))
                if not n:
                    continue
                boxes = []
                for i, sl in enumerate(ndimage.find_objects(lab), start=1):
                    bh = sl[0].stop - sl[0].start
                    bw = sl[1].stop - sl[1].start
                    if not (25 <= bh * bw <= 6000) or bw < 4 or bh < 4:
                        continue
                    if not (0.3 <= bw / bh <= 6):
                        continue
                    if (lab[sl] == i).sum() / (bh * bw) < 0.75:
                        continue
                    px = a[sl][lab[sl] == i]
                    if px.std(axis=0).mean() > 22:
                        continue
                    boxes.append((sl[1].start, sl[0].start, bw, bh,
                                  tuple(int(v) for v in px.mean(axis=0).round())))
                used = set()
                for i, b in enumerate(boxes):
                    if i in used:
                        continue
                    grp = [(j, c) for j, c in enumerate(boxes)
                           if abs(c[0] - b[0]) <= max(6, b[2] * .5)
                           and abs(c[2] - b[2]) <= max(4, b[2] * .4)
                           and abs(c[3] - b[3]) <= max(4, b[3] * .5)]
                    if len(grp) < 3:
                        continue
                    used.update(j for j, _ in grp)
                    cols = ' '.join('#%02X%02X%02X' % c[4] for _, c in sorted(grp, key=lambda g: g[1][1]))
                    print(f"{os.path.basename(path)} p{pno + 1} xref{xref} "
                          f"({b[0]},{b[1]}) n={len(grp)} {cols}")


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--scan', action='store_true', help='re-scan all figures for legend panels')
    args = ap.parse_args()
    if not os.path.isdir(PDF_DIR):
        sys.exit(f'run from the repository root; {PDF_DIR} not found')
    scan() if args.scan else measure()
