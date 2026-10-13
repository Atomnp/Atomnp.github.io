---
title: "About floating point numbers"
date: "2026-10-13"
tags: [floating-point, python, quantization]
---

# About floating point numbers

## Fixed-point representation

Suppose we have 8 bits and use 4 bits for the integer part and 4 bits for the fractional part, without a sign bit.

```text
1010.1100₂ = 8 + 2 + 1/2 + 1/4 = 10.75
```

- **Range:** 0 to 15.9375
- **Smallest step:** \(2^{-4} = 0.0625\)
- **Number of values:** \(2^8 = 256\)

| First values | Last values |
|---|---|
| `0000.0000` = 0 | `1111.1011` = 15.6875 |
| `0000.0001` = 0.0625 | `1111.1100` = 15.75 |
| `0000.0010` = 0.125 | `1111.1101` = 15.8125 |
| `0000.0011` = 0.1875 | `1111.1110` = 15.875 |
| `0000.0100` = 0.25 | `1111.1111` = 15.9375 |

If we instead use 64 bits split equally (32 integer + 32 fractional):

\[
\text{Maximum} = 2^{32}-2^{-32} \approx 4.29\times 10^9
\]

\[
\text{Step} = 2^{-32} \approx 2.33\times10^{-10}
\]

This is **fixed-point**: the binary point stays in one position and the spacing stays constant.

## Floating-point representation

Floating-point uses a significand and an exponent, like scientific notation:

\[
100.101_2 = 1.00101_2\times2^2
\]

An ordinary *normal* IEEE 754 binary floating-point number is represented as:

\[
x=(-1)^s\times (1.f)_2\times 2^{E-\mathrm{bias}}
\]

- \(s\): sign bit
- \(E\): stored exponent
- \(f\): stored fractional bits
- `1.f`: binary significand with an **implicit leading 1**

The leading 1 is not stored because every nonzero normal binary number can be written in this form. It gives one extra bit of effective precision.

| Format | Total bits | Sign | Exponent | Fraction | Effective significand bits |
|---|---:|---:|---:|---:|---:|
| FP16 | 16 | 1 | 5 | 10 | 11 |
| BF16 | 16 | 1 | 8 | 7 | 8 |
| FP32 | 32 | 1 | 8 | 23 | 24 |
| FP64 | 64 | 1 | 11 | 52 | 53 |

**More exponent bits** provide a wider range. **More fraction bits** provide finer precision.

## Exponent bias

An 11-bit exponent field has \(2^{11}=2048\) bit patterns. This does **not** mean that the largest actual exponent is 2048.

FP64 uses a bias of 1023:

\[
\text{Actual exponent} = E - 1023
\]

| Stored exponent | Meaning |
|---|---|
| `00000000000` | Zero or subnormal |
| `00000000001` | Normal exponent \(-1022\) |
| `01111111111` | Normal exponent 0 |
| `11111111110` | Normal exponent \(+1023\) |
| `11111111111` | Infinity or NaN |

Thus, normal FP64 numbers have exponents from \(-1022\) to \(+1023\).

## Why Python prints `4.52`

A decimal number such as `4.52` usually has no exact finite binary floating-point representation. Python's usual `float` is FP64, so the value is rounded to the nearest representable binary number.

```python
from decimal import Decimal

x = 4.52
print(x)                      # 4.52
print(format(x, ".20f"))      # 4.51999999999999957367
print(Decimal.from_float(x))  # Exact decimal value of stored float
```

The exact stored value is:

```text
4.519999999999999573674358543939888477325439453125
```

Why does `print(x)` show `4.52`? Python chooses a **short decimal representation that converts back to the same binary float**. `4.5` would convert to a different float; `4.52` converts to the same one.

Python does not remember the original literal:

```python
a = 4.52
b = 4.51999999999999957367
print(a == b)  # True: both round to the same FP64 value
print(b)       # 4.52
```

To preserve exact decimal input, use `Decimal` **with a string**:

```python
from decimal import Decimal

x = Decimal("4.51999999999999957367")
y = Decimal("4.52")
print(x == y)  # False
```

## Spacing and precision

Unlike fixed-point, floating-point spacing depends on the exponent. For a positive **normal** FP64 number within \([2^e,2^{e+1})\):

\[
\boxed{\text{Spacing}=2^{e-52},\qquad e=\lfloor\log_2 x\rfloor}
\]

For \(x=4.52\), we have \(2^2 \le 4.52 < 2^3\), so \(e=2\):

\[
\text{Spacing}=2^{2-52}=2^{-50}\approx 8.88\times10^{-16}
\]

| Around this value | FP64 spacing |
|---|---:|
| 1 | \(2^{-52}\) |
| 4.52 | \(2^{-50}\) |
| 100 | \(2^{-46}\) |
| 1,000,000 | \(2^{-33}\) |

At the largest finite FP64 numbers, \(e=1023\), so the gap between the last two finite values is:

\[
2^{1023-52}=2^{971}\approx1.996\times10^{292}
\]

```python
import math
import sys

print(math.ulp(4.52))       # Spacing to the next larger float
print(math.ulp(sys.float_info.max))
```

The absolute spacing grows for larger numbers, while relative precision stays roughly similar for normal numbers. At exact powers of two, the spacing just below the number is half the spacing just above it.

<figure><svg viewBox="0 0 680 180" width="100%" role="img" aria-label="About the same number of values. Fixed point spaces them evenly; floating point packs them near zero and the gap doubles at each power of two." style="display:block;max-width:680px;margin:0 auto"><text x="22" y="30" style="fill:var(--ink);font:600 15px var(--sans)">Fixed point</text><line x1="28" y1="56" x2="652" y2="56" style="stroke:var(--muted);stroke-width:1.5;opacity:.5"/><text x="28.0" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">0</text><text x="106.0" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">1</text><text x="184.0" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">2</text><text x="262.0" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">3</text><text x="340.0" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">4</text><text x="418.0" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">5</text><text x="496.0" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">6</text><text x="574.0" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">7</text><text x="652.0" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">8</text><circle cx="28.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="67.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="106.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="145.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="184.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="223.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="262.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="301.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="340.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="379.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="418.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="457.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="496.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="535.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="574.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="613.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="652.0" cy="56" r="4.5" style="fill:var(--accent)"/><text x="22" y="120" style="fill:var(--ink);font:600 15px var(--sans)">Floating point</text><line x1="28" y1="146" x2="652" y2="146" style="stroke:var(--muted);stroke-width:1.5;opacity:.5"/><text x="28.0" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">0</text><text x="106.0" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">1</text><text x="184.0" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">2</text><text x="262.0" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">3</text><text x="340.0" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">4</text><text x="418.0" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">5</text><text x="496.0" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">6</text><text x="574.0" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">7</text><text x="652.0" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">8</text><circle cx="28.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="67.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="76.8" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="86.5" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="96.2" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="106.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="125.5" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="145.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="164.5" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="184.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="223.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="262.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="301.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="340.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="418.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="496.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="574.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="652.0" cy="146" r="4.5" style="fill:#D08A2E"/><text x="145.0" y="134" text-anchor="middle" style="fill:var(--muted);font:italic 12px var(--sans)">gap 0.25</text><text x="262.0" y="134" text-anchor="middle" style="fill:var(--muted);font:italic 12px var(--sans)">gap 0.5</text><text x="496.0" y="134" text-anchor="middle" style="fill:var(--muted);font:italic 12px var(--sans)">gap 1</text></svg><figcaption style="text-align:center;color:var(--muted);font-size:.9rem">About the same number of values. Fixed point spaces them evenly; floating point packs them near zero and the gap doubles at each power of two.</figcaption></figure>

## Zero, subnormals, infinity, NaN

These are special IEEE 754 encodings. Using FP16 (5 exponent bits, 10 fraction bits):

| Exponent | Fraction | Represents |
|---|---|---|
| All zeros | All zeros | \(+0\) or \(-0\) |
| All zeros | Nonzero | Subnormal |
| Neither all zeros nor all ones | Anything | Normal |
| All ones | All zeros | \(+\infty\) or \(-\infty\) |
| All ones | Nonzero | NaN |

**Subnormals:** Normal FP16 numbers have an implicit `1.f`. Subnormals instead use `0.f` so that tiny nonzero values can be represented closer to zero.

- Smallest positive normal FP16: \(2^{-14}\)
- Smallest positive subnormal FP16: \(2^{-24}\)

For example, \(2^{-15}\) is smaller than the minimum normal value but is exactly representable as a subnormal. This is called **gradual underflow**. It prevents some small nonzero results from becoming zero prematurely, although some hardware modes flush subnormals to zero.

**Infinity:** Can represent overflow and certain infinite arithmetic results. In ordinary Python, `1.0 / 0.0` raises `ZeroDivisionError` rather than returning infinity.

**NaN (Not a Number):** Represents an invalid numerical result, such as `inf - inf`. NaN also has an unusual comparison rule:

```python
x = float("nan")
print(x == x)  # False
```

IEEE 754 reserves many bit patterns for NaNs so they can carry payloads and distinguish signaling from quiet NaNs; there isn't just one NaN bit pattern.

## BF16 and other low-precision formats

BF16 and FP16 are both 16-bit formats, but make different tradeoffs:

- **FP16:** 5 exponent bits, 10 fraction bits: more precision, smaller range.
- **BF16:** 8 exponent bits, 7 fraction bits: less precision, a normal range similar to FP32.

For the number `4.52`:

| Format | Stored value |
|---|---:|
| FP64 | 4.51999999999999957367… |
| FP32 | 4.519999980926514 |
| FP16 | 4.51953125 |
| BF16 | 4.53125 |

Other formats used in machine learning include **FP8 E4M3**, **FP8 E5M2**, and **FP4 E2M1**. `E` indicates exponent bits; `M` indicates stored fraction bits. The exact rules for special values can vary by format.

## Quantization

Quantization maps values to a smaller set of representable values, often to reduce model memory and memory bandwidth. Lower-precision arithmetic can also be faster when supported by hardware.

For example, a model with 7 billion weights needs approximately:

| Weight format | Ideal weight memory |
|---|---:|
| FP32 | 28 GB |
| FP16 / BF16 | 14 GB |
| INT8 / FP8 | 7 GB |
| INT4 / FP4 | 3.5 GB |

These numbers exclude scale factors, other metadata, activations, and KV cache.

**INT4 vs FP4:** Both use 4 bits per value. INT4 has uniformly spaced integer codes; FP4 E2M1 has unevenly spaced floating-point values. They have the same raw weight size, but may differ in accuracy, scale overhead, and hardware performance.

<figure><svg viewBox="0 0 680 180" width="100%" role="img" aria-label="Non-negative values of INT4 and FP4 E2M1. Same 4 bits, different spacing." style="display:block;max-width:680px;margin:0 auto"><text x="22" y="30" style="fill:var(--ink);font:600 15px var(--sans)">INT4</text><line x1="28" y1="56" x2="652" y2="56" style="stroke:var(--muted);stroke-width:1.5;opacity:.5"/><text x="28.0" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">0</text><text x="117.1" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">1</text><text x="206.3" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">2</text><text x="295.4" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">3</text><text x="384.6" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">4</text><text x="473.7" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">5</text><text x="562.9" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">6</text><text x="652.0" y="80" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">7</text><circle cx="28.0" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="117.1" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="206.3" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="295.4" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="384.6" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="473.7" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="562.9" cy="56" r="4.5" style="fill:var(--accent)"/><circle cx="652.0" cy="56" r="4.5" style="fill:var(--accent)"/><text x="22" y="120" style="fill:var(--ink);font:600 15px var(--sans)">FP4 (E2M1)</text><line x1="28" y1="146" x2="652" y2="146" style="stroke:var(--muted);stroke-width:1.5;opacity:.5"/><text x="28.0" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">0</text><text x="117.1" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">1</text><text x="206.3" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">2</text><text x="295.4" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">3</text><text x="384.6" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">4</text><text x="473.7" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">5</text><text x="562.9" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">6</text><text x="652.0" y="170" text-anchor="middle" style="fill:var(--muted);font:13px var(--sans)">7</text><circle cx="28.0" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="72.6" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="117.1" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="161.7" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="206.3" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="295.4" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="384.6" cy="146" r="4.5" style="fill:#D08A2E"/><circle cx="562.9" cy="146" r="4.5" style="fill:#D08A2E"/></svg><figcaption style="text-align:center;color:var(--muted);font-size:.9rem">Non-negative values of INT4 and FP4 E2M1. Same 4 bits, different spacing.</figcaption></figure>

### Scaling

Signed INT4 codes range from \(-8\) to \(7\). To represent weights that are fractional, choose a **scale** \(s\):

\[
q=\operatorname{clip}\left(\operatorname{round}(x/s),-8,7\right)
\]

\[
\hat{x}=q\times s
\]

Suppose the weights are \([-0.4,0.2,0.5,0.7]\). A simple symmetric choice is:

\[
s=\frac{\max |W|}{7}=0.1
\]

| Original | Stored INT4 | Reconstructed |
|---:|---:|---:|
| −0.4 | −4 | −0.4 |
| 0.2 | 2 | 0.2 |
| 0.5 | 5 | 0.5 |
| 0.7 | 7 | 0.7 |

In general, reconstructed values differ from originals: this is **quantization error**. A maximum-based scale is simple, but outliers can make it a poor choice. Other methods optimize the scales or tolerate clipping.

### Per-group scaling

Different layers and different parts of a layer may have different weight ranges. So modern LLM quantizers generally **do not use a single scale for the whole model**.

A common approach divides a matrix into groups of consecutive weights, e.g. **128 weights per group**, and assigns one scale to each group:

```text
Weight matrix: 2 rows × 256 columns

Row 1: [128 weights, scale A] [128 weights, scale B]
Row 2: [128 weights, scale C] [128 weights, scale D]

512 weights → 4 groups → 4 scales
```

If *all* 7 billion parameters were quantized with groups of 128, the approximate number of scales would be:

\[
7{,}000{,}000{,}000/128\approx54.7\text{ million scales}
\]

If each scale takes 2 bytes, those scales use about **109 MB** of additional storage.

Examples of approaches:

| Method | Typical grouping or idea |
|---|---|
| GPTQ / AWQ INT4 | Often groups of 128 weights; methods differ in how they reduce accuracy loss |
| NF4 (used in QLoRA) | 4-bit codebook designed for approximately normally distributed weights |
| MXFP4 | FP4 values with a shared scale per 32 values |
| NVFP4 | FP4 values with a shared fine-grained scale per 16 values, plus tensor-level scaling |

**Storage precision is not always compute precision.** Some implementations store weights in 4 bits and dequantize them to FP16/BF16 for calculations; other hardware supports native lower-precision operations.

## LoRA (a separate idea)

**LoRA** is not quantization. It is a way to fine-tune a model without updating all its original weights. Instead, a weight matrix \(W\) is frozen and a low-rank update is trained:

\[
W_{\text{new}}=W+BA
\]

**QLoRA** combines low-bit quantization of the frozen model with training LoRA adapters.
