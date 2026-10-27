#!/usr/bin/env python3
"""Record a language model sitting, for JUST SITTING.

The model writes freely from an empty start, with nothing to complete. For each
token only its surprise is kept, -log2 p(token), in bits. The words are never
stored or printed. When the model ends a text by itself, it starts again from
nothing.

    pip install torch transformers
    python record_sitting.py                         # 33 minutes, Qwen/Qwen2.5-0.5B
    python record_sitting.py --minutes 11
    python record_sitting.py --model Qwen/Qwen3-0.6B-Base

The first run downloads the model from Hugging Face. On a Mac with Apple
silicon it runs on the GPU (MPS). The result is a .json file: drop it onto the
plate in JUST SITTING, or use Settings > Load recording. To give homepage
visitors this recording, upload it next to just-sitting.html as sitting.json.
"""
import argparse
import datetime
import json
import math
import re
import time

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

RATE = 12    # tokens per second of sitting
BREATH = 10  # seconds; one breath is spoken before the sitting begins


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="Qwen/Qwen2.5-0.5B", help="a base model, not a chat model")
    ap.add_argument("--minutes", type=float, default=33)
    ap.add_argument("--temperature", type=float, default=1.0)
    ap.add_argument("--segment", type=int, default=2048, help="longest text before returning to an empty start")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    torch.manual_seed(a.seed)
    if torch.backends.mps.is_available():
        device, dtype = "mps", torch.float16
    elif torch.cuda.is_available():
        device, dtype = "cuda", torch.float16
    else:
        device, dtype = "cpu", torch.float32

    tok = AutoTokenizer.from_pretrained(a.model)
    model = AutoModelForCausalLM.from_pretrained(a.model, torch_dtype=dtype).to(device).eval()
    start = tok.bos_token_id if tok.bos_token_id is not None else tok.eos_token_id
    end = tok.eos_token_id

    n = int(round(a.minutes * 60 * RATE)) + BREATH * RATE
    bits, texts, t0 = [], 0, time.time()
    with torch.inference_mode():
        while len(bits) < n:
            texts += 1
            ids, past = torch.tensor([[start]], device=device), None
            for _ in range(min(a.segment, n - len(bits))):
                out = model(input_ids=ids, past_key_values=past, use_cache=True)
                past = out.past_key_values
                logp = torch.log_softmax(out.logits[0, -1].float() / a.temperature, dim=-1)
                nxt = torch.multinomial(logp.exp(), 1)
                bits.append(round(-logp[nxt].item() / math.log(2), 2))
                if nxt.item() == end:
                    break
                ids = nxt.view(1, 1)
            done = len(bits) / n
            print(f"\r{len(bits)}/{n} tokens · {texts} texts · {time.time() - t0:.0f} s · {done:.0%}", end="", flush=True)
    print()

    stamp = datetime.date.today().isoformat()
    name = re.sub(r"[^A-Za-z0-9.-]+", "-", a.model.split("/")[-1])
    path = a.out or f"sitting-{name}-{stamp}.json"
    with open(path, "w") as f:
        json.dump({
            "format": "just-sitting/1",
            "model": a.model,
            "recorded": stamp,
            "rate": RATE,
            "temperature": a.temperature,
            "seed": a.seed,
            "texts": texts,
            "bits": bits,
        }, f, separators=(",", ":"))
    mean = sum(bits) / len(bits)
    print(f"Saved {path}: {a.minutes:g} minutes, mean surprise {mean:.2f} bits. No words were kept.")


if __name__ == "__main__":
    main()
