"""
Show raw (pre-normalization) distributions for each highlight score component
and annotate the elbow/knee point on each.
"""

import numpy as np
import polars as pl
import matplotlib.pyplot as plt
from kneed import KneeLocator

PARQUET = "data/output/activation_highlights.parquet"

SYNTAX = ["s_word_ngram", "s_char_ngram", "s_dep_parse", "s_ast_parse"]
CONTEXT = ["c_span_1", "c_span_8", "c_span_16", "c_span_32", "c_discriminative", "c_token_idf"]
COMPONENTS = SYNTAX + CONTEXT

SYNTAX_THRESHOLD = 0.1       # Fixed threshold for syntax components
CONTEXT_PERCENTILE = 75      # Top 25% for context components

def flatten_column(df: pl.DataFrame, col: str) -> np.ndarray:
    """Explode a list column and return flat numpy array, dropping nulls."""
    return df.select(pl.col(col).explode()).drop_nulls().to_numpy().ravel()


def find_elbow(values: np.ndarray) -> float:
    """Find elbow on the sorted descending curve of values."""
    sorted_vals = np.sort(values)[::-1]
    # Subsample to 10k points for speed
    n = len(sorted_vals)
    if n > 10_000:
        idx = np.linspace(0, n - 1, 10_000, dtype=int)
        sorted_vals = sorted_vals[idx]
    x = np.arange(len(sorted_vals))
    kl = KneeLocator(x, sorted_vals, curve="convex", direction="decreasing")
    if kl.knee is not None:
        return sorted_vals[kl.knee]
    return float("nan")


def main():
    print("Loading parquet...")
    df = pl.read_parquet(PARQUET)
    print(f"  {df.shape[0]:,} rows, {df.shape[1]} columns\n")

    # Build disc*idf product column
    disc = flatten_column(df, "c_discriminative")
    idf = flatten_column(df, "c_token_idf")
    min_len = min(len(disc), len(idf))
    disc_idf = disc[:min_len] * idf[:min_len]

    all_names = COMPONENTS + ["disc × idf"]
    all_arrays = [flatten_column(df, c) for c in COMPONENTS] + [disc_idf]

    # Compute elbows and thresholds
    elbows = {}
    thresholds = {}
    for name, arr in zip(all_names, all_arrays):
        elbow = find_elbow(arr)
        elbows[name] = elbow
        # Proposed threshold
        if name in SYNTAX:
            thr = SYNTAX_THRESHOLD
        else:
            thr = float(np.percentile(arr, CONTEXT_PERCENTILE))
        thresholds[name] = thr
        pct_above = (arr > thr).sum() / len(arr) * 100
        print(f"{name:20s}  elbow={elbow:.4f}  threshold={thr:.4f}  ({pct_above:.1f}% above)")

    # Plot
    fig, axes = plt.subplots(3, 4, figsize=(18, 11))
    axes = axes.ravel()

    for i, (name, arr) in enumerate(zip(all_names, all_arrays)):
        ax = axes[i]
        # Clip extreme outliers for visibility (0.5th–99.5th percentile)
        lo, hi = np.percentile(arr, [0.5, 99.5])
        clipped = arr[(arr >= lo) & (arr <= hi)]
        counts, _, _ = ax.hist(clipped, bins=100, color="#4e79a7", edgecolor="none", alpha=0.8)
        # Elbow line (red dashed)
        elbow = elbows[name]
        if not np.isnan(elbow) and lo <= elbow <= hi:
            ax.axvline(elbow, color="#e15759", lw=1.5, ls="--", label=f"elbow={elbow:.4f}")
        # Threshold line (green solid)
        thr = thresholds[name]
        if lo <= thr <= hi:
            pct = (arr > thr).sum() / len(arr) * 100
            ax.axvline(thr, color="#2ca02c", lw=2, ls="-", label=f"thr={thr:.4f} ({pct:.0f}%↑)")
        ax.legend(fontsize=7, loc="upper right")
        # Cap y-axis at 2nd-tallest bin so the dominant zero-spike doesn't crush the rest
        sorted_counts = np.sort(counts)[::-1]
        if len(sorted_counts) > 1 and sorted_counts[0] > 5 * sorted_counts[1]:
            ax.set_ylim(0, sorted_counts[1] * 1.3)
        ax.set_title(name, fontsize=10, fontweight="bold")
        ax.set_ylabel("count")
        ax.tick_params(labelsize=8)

    # Hide unused subplot
    for j in range(len(all_names), len(axes)):
        axes[j].set_visible(False)

    fig.suptitle("Raw Score Distributions — Elbow (red) vs Proposed Threshold (green)", fontsize=13, fontweight="bold")
    fig.tight_layout(rect=[0, 0, 1, 0.96])

    out = "highlight_distributions.png"
    fig.savefig(out, dpi=150)
    print(f"\nSaved → {out}")
    plt.show()


if __name__ == "__main__":
    main()
