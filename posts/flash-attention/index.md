---
title: "Flash attention"
date: "2026-11-25"
tags: [attention, gpu, llm-inference]
---

<style>
.post-body figure svg{max-width:100%;height:auto}
.post-body figcaption{text-align:center;color:var(--muted);font-size:.9rem;margin-top:8px}
.post-body table.num td,.post-body table.num th{text-align:right;font-family:var(--mono);font-size:.82rem}
.post-body table.cores td,.post-body table.cores th{white-space:nowrap;font-size:.86rem;padding:7px 10px}
.post-body table.num td:first-child,.post-body table.num th:first-child{text-align:left}
</style>

## What is flash attention?

Flash attention is a way to calculate attention faster. In large language models, when we calculate attention for large prompts (modern LLMs support very large prompts), we can get the **same** attention output faster. It is not algorithmically faster, the number of multiplications is the same. It is faster for the practical problem where a GPU has only a small amount of fast memory (SRAM). Using some tricks, we don't have to read and write big matrices to the slow memory (HBM) again and again, and that saves time. And using another trick, we can split the work across many GPU cores and still end up with exactly the same attention output.

## Basics

The formula to calculate the output after attention is

\[
O = \text{softmax}\left(\frac{QK^\top}{\sqrt{d}}\right)V
\]

Let's say we have a prompt **"I Love Reinforcement Learning"**, and let's say the embedding dimension is 64. Then the size of our prompt matrix \(X\) is \((4, 64)\): 4 tokens, 64 numbers each.

If Q, K and V have hidden dimension 32, then we multiply the prompt by three \((64, 32)\) matrices \(W_Q\), \(W_K\), \(W_V\), and we get Q, K and V, each with size \((4, 32)\).

\[
X =
\begin{bmatrix}
x_{0,0} & x_{0,1} & \cdots & x_{0,63} \\
x_{1,0} & x_{1,1} & \cdots & x_{1,63} \\
x_{2,0} & x_{2,1} & \cdots & x_{2,63} \\
x_{3,0} & x_{3,1} & \cdots & x_{3,63}
\end{bmatrix}
\begin{array}{l}
\leftarrow \text{I} \\
\leftarrow \text{Love} \\
\leftarrow \text{Reinforcement} \\
\leftarrow \text{Learning}
\end{array}
\]

Each row of X is one token, so each row of Q is one token too. We call the rows \(q_0, q_1, q_2, q_3\):

\[
\underbrace{\begin{bmatrix} x_0 \\ x_1 \\ x_2 \\ x_3 \end{bmatrix}}_{4 \times 64}
\underbrace{\begin{bmatrix} \; W_Q \; \end{bmatrix}}_{64 \times 32}
=
\underbrace{\begin{bmatrix} q_0 \\ q_1 \\ q_2 \\ q_3 \end{bmatrix}}_{4 \times 32}
\]

Same with \(W_K\) and \(W_V\):

\[
K = XW_K = \begin{bmatrix} k_0 \\ k_1 \\ k_2 \\ k_3 \end{bmatrix},
\qquad
V = XW_V = \begin{bmatrix} v_0 \\ v_1 \\ v_2 \\ v_3 \end{bmatrix}
\]

Row i of Q, K and V all belong to token i.

Then we multiply \(Q\) and \(K^\top\) and divide by \(\sqrt{d}\) (here \(d = 32\), the hidden size of Q and K) to get an intermediate matrix, let's call it \(S\). The size of S is \((4, 4)\), i.e. (prompt length, prompt length). Every entry is one dot product:

\[
s_{ij} = \frac{q_i \cdot k_j}{\sqrt{d}}
\]

\[
\frac{1}{\sqrt{d}}
\begin{bmatrix} q_0 \\ \color{#33409E}{q_1} \\ q_2 \\ q_3 \end{bmatrix}
\begin{bmatrix} k_0^\top & k_1^\top & \color{#33409E}{k_2^\top} & k_3^\top \end{bmatrix}
=
\begin{bmatrix}
s_{00} & s_{01} & s_{02} & s_{03} \\
s_{10} & s_{11} & \color{#33409E}{s_{12}} & s_{13} \\
s_{20} & s_{21} & s_{22} & s_{23} \\
s_{30} & s_{31} & s_{32} & s_{33}
\end{bmatrix}
\]

To get \(s_{12}\) we take row 1 of Q and column 2 of \(K^\top\) (which is just row 2 of K) and take their dot product.

Then we do softmax and get another intermediate matrix \(P\). So P is just \(\text{softmax}(S)\), done on each row separately:

\[
p_{ij} = \frac{e^{s_{ij}}}{\sum_{k} e^{s_{ik}}}
\]

\[
\text{softmax}\left(
\begin{bmatrix}
\color{#33409E}{s_{00}} & \color{#33409E}{s_{01}} & \color{#33409E}{s_{02}} & \color{#33409E}{s_{03}} \\
s_{10} & s_{11} & s_{12} & s_{13} \\
s_{20} & s_{21} & s_{22} & s_{23} \\
s_{30} & s_{31} & s_{32} & s_{33}
\end{bmatrix}
\right)
=
\begin{bmatrix}
\color{#33409E}{p_{00}} & \color{#33409E}{p_{01}} & \color{#33409E}{p_{02}} & \color{#33409E}{p_{03}} \\
p_{10} & p_{11} & p_{12} & p_{13} \\
p_{20} & p_{21} & p_{22} & p_{23} \\
p_{30} & p_{31} & p_{32} & p_{33}
\end{bmatrix}
\]

Row 0 of S gives row 0 of P. Row i of P says how much token i attends to every token, and each row sums to 1.

We then use this P to calculate O, so \(O = PV\).

\[
\begin{bmatrix}
\color{#33409E}{p_{00}} & \color{#33409E}{p_{01}} & \color{#33409E}{p_{02}} & \color{#33409E}{p_{03}} \\
p_{10} & p_{11} & p_{12} & p_{13} \\
p_{20} & p_{21} & p_{22} & p_{23} \\
p_{30} & p_{31} & p_{32} & p_{33}
\end{bmatrix}
\begin{bmatrix} v_0 \\ v_1 \\ v_2 \\ v_3 \end{bmatrix}
=
\begin{bmatrix} \color{#33409E}{o_0} \\ o_1 \\ o_2 \\ o_3 \end{bmatrix}
\]

Each output row is a weighted mix of all the value rows, for example \(o_0 = p_{00}v_0 + p_{01}v_1 + p_{02}v_2 + p_{03}v_3\).

## So what is the problem here?

If a modern LLM supports a 32k prompt length, then the size of S becomes \((32\text{k}, 32\text{k})\). That is \(32768 \times 32768 \approx 1.07\) **billion** numbers. If we use fp16 values (2 bytes each), that is about **2 GB just for storing S**, for a single head, in a single layer. And P has the same size. That's huge.

A GPU has a large HBM and a small SRAM. When we say "A100 with 40 GB", that 40 GB is HBM. It is much slower than SRAM. SRAM is on the chip, right next to the cores, but it is tiny: around 192 KB per streaming multiprocessor, about 20 MB across the whole A100. HBM bandwidth is about 1.5 TB/s, SRAM is roughly 10 times faster than that.

When SRAM is not enough to hold everything, this is what the usual (standard) attention does:

1. Read Q and K
2. Calculate S
3. Save S to HBM (slow, because S is big)
4. Then read S back, calculate P
5. Save P to HBM (slow, because P is big)
6. Read P and V (slow)
7. Calculate O (much smaller than both S and P)

<figure><svg viewBox="0 0 680 408" width="680" height="408" role="img" aria-label="Standard attention: S and P, both n by n, are written to HBM and read back." style="display:block;max-width:680px;width:100%;height:auto;margin:0 auto"><rect x="70" y="40" width="150" height="330" rx="10" style="fill:var(--surface);stroke:var(--muted);stroke-width:1.2"/><text x="145" y="66" text-anchor="middle" style="fill:var(--ink);font:700 16px var(--sans)">HBM</text><text x="145" y="86" text-anchor="middle" style="fill:var(--muted);font:400 12px var(--sans)">40 GB, slower</text><rect x="470" y="40" width="150" height="330" rx="10" style="fill:var(--surface);stroke:var(--muted);stroke-width:1.2"/><text x="545" y="66" text-anchor="middle" style="fill:var(--ink);font:700 16px var(--sans)">SRAM + cores</text><text x="545" y="86" text-anchor="middle" style="fill:var(--muted);font:400 12px var(--sans)">few MB, very fast</text><line x1="225" y1="116" x2="465" y2="116" style="stroke:var(--muted);stroke-width:1.4"/><path d="M465,116 L457.8,119.5 L457.8,112.5 Z" style="fill:var(--muted)"/><text x="345" y="109" text-anchor="middle" style="fill:var(--ink);font:400 12px var(--sans)">read Q, K</text><text x="545" y="148" text-anchor="middle" style="fill:var(--muted);font:400 12px var(--sans)">compute S</text><line x1="465" y1="172" x2="225" y2="172" style="stroke:#33409E;stroke-width:3.2"/><path d="M225,172 L232.2,168.5 L232.2,175.5 Z" style="fill:#33409E"/><text x="345" y="165" text-anchor="middle" style="fill:#33409E;font:600 12px var(--sans)">write S  (n × n)</text><line x1="225" y1="200" x2="465" y2="200" style="stroke:#33409E;stroke-width:3.2"/><path d="M465,200 L457.8,203.5 L457.8,196.5 Z" style="fill:#33409E"/><text x="345" y="193" text-anchor="middle" style="fill:#33409E;font:600 12px var(--sans)">read S</text><text x="545" y="232" text-anchor="middle" style="fill:var(--muted);font:400 12px var(--sans)">compute P</text><line x1="465" y1="256" x2="225" y2="256" style="stroke:#33409E;stroke-width:3.2"/><path d="M225,256 L232.2,252.5 L232.2,259.5 Z" style="fill:#33409E"/><text x="345" y="249" text-anchor="middle" style="fill:#33409E;font:600 12px var(--sans)">write P  (n × n)</text><line x1="225" y1="284" x2="465" y2="284" style="stroke:#33409E;stroke-width:3.2"/><path d="M465,284 L457.8,287.5 L457.8,280.5 Z" style="fill:#33409E"/><text x="345" y="277" text-anchor="middle" style="fill:#33409E;font:600 12px var(--sans)">read P  (n × n), V</text><text x="545" y="316" text-anchor="middle" style="fill:var(--muted);font:400 12px var(--sans)">compute O</text><line x1="465" y1="340" x2="225" y2="340" style="stroke:var(--muted);stroke-width:1.4"/><path d="M225,340 L232.2,336.5 L232.2,343.5 Z" style="fill:var(--muted)"/><text x="345" y="333" text-anchor="middle" style="fill:var(--ink);font:400 12px var(--sans)">write O  (n × d)</text><text x="345" y="395" text-anchor="middle" style="fill:#33409E;font:400 12px var(--sans)">thick arrows: n × n matrices going back and forth</text></svg><figcaption>Most of the time goes into moving the two n × n matrices, not into the math.</figcaption></figure>

This makes attention **memory bound**: the cores are fast, but they keep waiting for data to come from HBM. What would be better?

Answer: **no big interactions with HBM.**

Maybe we can read Q and K, calculate only a few items of S, then calculate the matching items of P, then read V (small) and calculate part of O, and do this multiple times. This way we never have to build the whole S and the whole P. Even if we have to do this many times, we save the round trips to HBM, and in turn we save time.

## What do we need for one output?

Let's say we want to calculate the first output \(o_0\). What do we need?

We need to multiply the V of each token by the first row of P. The first row of P represents how much the first token attends to each token:

\[
o_0 = p_{00}\,v_0 + p_{01}\,v_1 + p_{02}\,v_2 + \dots
\]

So we need the first row of P. To calculate the first row of P we need the first row of S, because

\[
p_{0j} = \frac{e^{s_{0j}}}{\sum_k e^{s_{0k}}}
\]

So if we just calculate the first row of S, we can calculate the first row of P and then the first output \(o_0\). Then we can calculate the second output similarly. This way we don't have to calculate all of S at once.

But what if even one full row does not fit in memory? With a 1 million token prompt, one row of S is 1 million numbers. Can we do better?

I want to calculate \(s_0\), \(p_0\) and \(o_0\). The problem is that to calculate even one item of \(p_0\) we need **all** the items in \(s_0\), because softmax divides by the sum over the whole row.

But there is a better way. For that, let's write out how the output is calculated:

\[
o_0 = \sum_j p_{0j}\, v_j
= \sum_j \frac{e^{s_{0j}}}{\sum_k e^{s_{0k}}}\, v_j
\]

The denominator does not depend on \(j\), so we can take it out of the sum:

\[
o_0 = \frac{\sum_j e^{s_{0j}}\, v_j}{\sum_j e^{s_{0j}}} = \frac{N}{D}
\]

Both the top and the bottom are just **sums**. And a sum can be built one item at a time.

## Building the output one item at a time

So let's do something like this. Let's calculate only the first item of the first row of S. With it we can calculate \(e^{s_{00}} v_0\) and \(e^{s_{00}}\). We create a variable \(N\) for the numerator and \(D\) for the denominator:

\[
N = e^{s_{00}}\, v_0, \qquad D = e^{s_{00}}
\]

When we calculate the second item of the first row, we update both:

\[
N \leftarrow N + e^{s_{01}}\, v_1, \qquad D \leftarrow D + e^{s_{01}}
\]

And so on. At the end we calculate \(o_0 = N / D\).

Let's try it with numbers. Say query 0 gets the scores \(s_0 = [1, 3, 2, 0]\) against the 4 keys, and the values are small 2-dimensional vectors \(v_0 = [1, 0]\), \(v_1 = [0, 1]\), \(v_2 = [1, 1]\), \(v_3 = [2, 0]\).

<table class="num">
<tr><th>step</th><th>s₀ⱼ</th><th>e^s₀ⱼ</th><th>vⱼ</th><th>N</th><th>D</th></tr>
<tr><td>j = 0</td><td>1</td><td>2.72</td><td>[1, 0]</td><td>[2.72, 0.00]</td><td>2.72</td></tr>
<tr><td>j = 1</td><td>3</td><td>20.09</td><td>[0, 1]</td><td>[2.72, 20.09]</td><td>22.80</td></tr>
<tr><td>j = 2</td><td>2</td><td>7.39</td><td>[1, 1]</td><td>[10.11, 27.47]</td><td>30.19</td></tr>
<tr><td>j = 3</td><td>0</td><td>1.00</td><td>[2, 0]</td><td>[12.11, 27.47]</td><td>31.19</td></tr>
</table>

\[
o_0 = \frac{N}{D} = \frac{[12.11,\ 27.47]}{31.19} = [0.388,\ 0.881]
\]

If we do the normal way (full softmax of the row, then multiply by V) we get exactly the same \([0.388, 0.881]\).

What were we able to do? Instead of calculating S all at once, we calculated S **one item at a time**, and went directly to O. We never stored a row of S or P. If we do this for every row, we get O without ever building the whole S matrix. The only extra memory is N and D, which is tiny: one vector and one number per query row.

In practice we don't go one item at a time, that would be too slow. We go one **block** at a time: take a block of keys (say 64 or 128 of them), compute that block of scores in SRAM, add its contribution to N and D, throw the scores away, and move to the next block. It is the same idea, just with chunks instead of single items.

## Doing it in parallel on many cores

A GPU has many cores (an A100 has 108 streaming multiprocessors), so we want to keep all of them busy.

First, the basic block trick for matrix multiplication. If I have two \((4, 4)\) matrices A and B, and I want to multiply them to get a \((4, 4)\) output C:

- I can take the first two rows of A and the first two columns of B and multiply them on one core. This gives me 4 values of C.
- I can similarly take the first two rows of A and the last two columns of B on another core, and get 4 other values.
- If I do this two more times, I get all 16 values.

In matrix form, we cut A into a top half and a bottom half, and B into a left half and a right half:

\[
A =
\left[\begin{array}{cccc}
a_{00} & a_{01} & a_{02} & a_{03} \\
a_{10} & a_{11} & a_{12} & a_{13} \\ \hline
a_{20} & a_{21} & a_{22} & a_{23} \\
a_{30} & a_{31} & a_{32} & a_{33}
\end{array}\right]
= \begin{bmatrix} A_0 \\ A_1 \end{bmatrix},
\qquad
B =
\left[\begin{array}{cc|cc}
b_{00} & b_{01} & b_{02} & b_{03} \\
b_{10} & b_{11} & b_{12} & b_{13} \\
b_{20} & b_{21} & b_{22} & b_{23} \\
b_{30} & b_{31} & b_{32} & b_{33}
\end{array}\right]
= \begin{bmatrix} B_0 & B_1 \end{bmatrix}
\]

Then

\[
C = AB =
\begin{bmatrix}
\underbrace{A_0 B_0}_{\text{core 1}} & \underbrace{A_0 B_1}_{\text{core 2}} \\[14pt]
\underbrace{A_1 B_0}_{\text{core 3}} & \underbrace{A_1 B_1}_{\text{core 4}}
\end{bmatrix}
\]

Each \(A_i B_j\) is a \((2, 4) \times (4, 2) = (2, 2)\) piece of C. No core needs the others' results, so all four pieces are computed at the same time.

This works because each tile of C only needs its own rows of A and its own columns of B. This is how GPUs do matrix multiplication in general, and each tile is small enough to sit in SRAM.

Now, how does this help attention? Let's go back to our N and D trick and ask a simple question: **what does each output need?**

To calculate \(o_0\), we walked through the keys one by one: compute \(s_{00}\), update \(N_0, D_0\), compute \(s_{01}\), update \(N_0, D_0\), and so on. The only thing from Q we ever used was \(q_0\).

To calculate \(o_1\), we do exactly the same walk, but with \(q_1\) and its own \(N_1, D_1\). It needs all the same K and V rows, but it never looks at \(q_0\), \(N_0\) or \(D_0\).

\[
o_0 = \frac{N_0}{D_0} \;\text{ uses only } q_0, K, V
\qquad\qquad
o_1 = \frac{N_1}{D_1} \;\text{ uses only } q_1, K, V
\]

So the outputs don't depend on each other. That means we don't have to calculate them one after another. We can give each output to a different core and do them **at the same time**.

With our 4-token prompt and 4 cores, it looks like this. Each core keeps one query and its own N and D. All cores read the same key and value at each step, compute one score, and update their own N and D:

<table class="cores">
<tr><th>read</th><th>core 1 (q₀)</th><th>core 2 (q₁)</th><th>core 3 (q₂)</th><th>core 4 (q₃)</th></tr>
<tr><td>step 1: k₀, v₀</td><td>s₀₀ → N₀, D₀</td><td>s₁₀ → N₁, D₁</td><td>s₂₀ → N₂, D₂</td><td>s₃₀ → N₃, D₃</td></tr>
<tr><td>step 2: k₁, v₁</td><td>s₀₁ → N₀, D₀</td><td>s₁₁ → N₁, D₁</td><td>s₂₁ → N₂, D₂</td><td>s₃₁ → N₃, D₃</td></tr>
<tr><td>step 3: k₂, v₂</td><td>s₀₂ → N₀, D₀</td><td>s₁₂ → N₁, D₁</td><td>s₂₂ → N₂, D₂</td><td>s₃₂ → N₃, D₃</td></tr>
<tr><td>step 4: k₃, v₃</td><td>s₀₃ → N₀, D₀</td><td>s₁₃ → N₁, D₁</td><td>s₂₃ → N₂, D₂</td><td>s₃₃ → N₃, D₃</td></tr>
<tr><td>end</td><td>o₀ = N₀ / D₀</td><td>o₁ = N₁ / D₁</td><td>o₂ = N₂ / D₂</td><td>o₃ = N₃ / D₃</td></tr>
</table>

Look at one column: it is exactly the N and D table we did with numbers earlier, just for one query. Look at one row: all four cores compute one column of S together, use it to update their N and D, and then throw it away. Every number of S gets computed at some point, but only for a moment, and it is never saved to HBM.

That is really the whole idea. The rest is just making it practical.

**One core per token is too many.** A real prompt has 32k tokens, but a GPU does not have 32k cores (an A100 has 108 streaming multiprocessors). So instead of one query per core, we give each core a **block** of queries, for example 128 rows of Q.

**One key at a time is too slow.** So instead of reading one key and value per step, each core reads a **block** of them, for example 64 rows of K and V.

Now in one step a core has 128 queries and 64 keys. Their scores are a small \(128 \times 64\) piece of S. This is just a small matrix multiplication, the same block trick as above, and the piece is small enough to fit in SRAM. The core uses it to update N and D for all 128 of its queries, throws it away, and reads the next block of keys and values.

So the table looks exactly the same as before, just with blocks. Now \(Q_0\) means the first block of 128 query rows, \(K_0, V_0\) means the first block of 64 key and value rows, and each core's N and D hold the running sums for all 128 of its queries:

<table class="cores">
<tr><th>read</th><th>core 1 (Q₀)</th><th>core 2 (Q₁)</th><th>core 3 (Q₂)</th><th>…</th></tr>
<tr><td>step 1: K₀, V₀</td><td>Q₀K₀ᵀ → N, D</td><td>Q₁K₀ᵀ → N, D</td><td>Q₂K₀ᵀ → N, D</td><td>…</td></tr>
<tr><td>step 2: K₁, V₁</td><td>Q₀K₁ᵀ → N, D</td><td>Q₁K₁ᵀ → N, D</td><td>Q₂K₁ᵀ → N, D</td><td>…</td></tr>
<tr><td>step 3: K₂, V₂</td><td>Q₀K₂ᵀ → N, D</td><td>Q₁K₂ᵀ → N, D</td><td>Q₂K₂ᵀ → N, D</td><td>…</td></tr>
<tr><td>…</td><td>…</td><td>…</td><td>…</td><td>…</td></tr>
<tr><td>end</td><td>O₀ = N / D</td><td>O₁ = N / D</td><td>O₂ = N / D</td><td>…</td></tr>
</table>

Each cell like \(Q_0K_1^\top\) is one small \(128 \times 64\) piece of S. It lives in SRAM just long enough to update N and D, then it is thrown away.

So what goes to HBM now? Q, K and V are read, and O is written. That's it. The big \(n \times n\) matrices S and P never leave the chip, they only ever exist as small pieces inside SRAM.

## Extra: the max trick

When we have large values in s, calculating \(e^{s}\) becomes a problem: in fp16, \(e^{12}\) already overflows. The usual trick is to subtract the max of the row before taking \(e^{s}\), which does not change the softmax.

But the problem is, if we are doing the calculation block by block, we don't know the global max of the row. The solution is that we use the local max (the max seen so far), and when we discover a new max, we correct the existing N and D by multiplying them with one small factor. This is called **online softmax**, and the [FlashAttention paper](https://arxiv.org/abs/2205.14135) has the details.

## References

- Tri Dao, Daniel Y. Fu, Stefano Ermon, Atri Rudra, Christopher Ré. [FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness](https://arxiv.org/abs/2205.14135), 2022.
- Tri Dao. [FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning](https://arxiv.org/abs/2307.08691), 2023.
- Maxim Milakov, Natalia Gimelshein. [Online normalizer calculation for softmax](https://arxiv.org/abs/1805.02867), 2018.
