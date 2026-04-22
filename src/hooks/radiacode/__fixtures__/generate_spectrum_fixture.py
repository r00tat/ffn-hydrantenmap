#!/usr/bin/env python3
"""Generate synthetic RD_VIRT_STRING VS.SPECTRUM response body for decoder tests.

Output layout (matches what the decoder sees, already stripped of command header):
    <retcode:u32 LE=1>
    <flen:u32 LE>
    inner payload (flen bytes):
        <duration_s:u32 LE=60>
        <a0:f32 LE=0.0> <a1:f32 LE=2.5> <a2:f32 LE=0.0>
        counts[1024]: u32 LE each

Energy calibration a0 + a1 * ch + a2 * ch^2 with a1 = 2.5 keV/ch means
channel 264 corresponds to 660 keV (Cs-137 photopeak).
"""

from __future__ import annotations

import math
import struct
from pathlib import Path


NUM_CHANNELS = 1024
DURATION_S = 60
A0 = 0.0
A1 = 2.5
A2 = 0.0

PEAK_CENTER = 264
PEAK_HEIGHT = 500
PEAK_SIGMA = 8.0
BACKGROUND = 3


def build_counts() -> list[int]:
    counts = [BACKGROUND] * NUM_CHANNELS
    two_sigma_sq = 2.0 * PEAK_SIGMA * PEAK_SIGMA
    for ch in range(NUM_CHANNELS):
        delta = ch - PEAK_CENTER
        gauss = PEAK_HEIGHT * math.exp(-(delta * delta) / two_sigma_sq)
        counts[ch] += int(round(gauss))
    return counts


def build_inner_payload() -> bytes:
    header = struct.pack("<Ifff", DURATION_S, A0, A1, A2)
    counts = build_counts()
    body = struct.pack(f"<{NUM_CHANNELS}I", *counts)
    return header + body


def build_response_body() -> bytes:
    inner = build_inner_payload()
    return struct.pack("<II", 1, len(inner)) + inner


def main() -> None:
    out_dir = Path(__file__).resolve().parent
    out_path = out_dir / "spectrum_rsp.hex"
    out_dir.mkdir(parents=True, exist_ok=True)

    body = build_response_body()
    out_path.write_text(body.hex())

    counts = build_counts()
    total = sum(counts)
    print(f"wrote {out_path}")
    print(f"  decoded bytes: {len(body)} (expected 4120)")
    print(f"  hex chars:     {len(body) * 2} (expected 8240)")
    print(f"  sum(counts):   {total}")
    print(f"  peak channel:  {counts.index(max(counts))}")


if __name__ == "__main__":
    main()
