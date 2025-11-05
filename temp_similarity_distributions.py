#!/usr/bin/env python3
"""
Temporary script to visualize semantic similarity and Jaccard similarity distributions
from activation_example_similarity.parquet

Updated for dual n-gram architecture:
- Legacy ngram_jaccard_similarity: 4 char n-gram sizes (2-5)
- New top_char_ngram_jaccard: Single value for most frequent char n-gram
- New top_word_ngram_jaccard: Single value for most frequent word n-gram
"""

import polars as pl
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path

# Load the parquet file
parquet_path = Path("/home/dohyun/interface/data/master/activation_example_similarity.parquet")
print(f"Loading data from {parquet_path}...")
df = pl.read_parquet(parquet_path)

print(f"Total rows: {len(df)}")
print(f"\nSchema:")
print(df.schema)
print(f"\nFirst few rows:")
print(df.head())

# Extract both columns and filter together to ensure consistency
# Create a mask for rows with valid data
valid_semantic = df["avg_pairwise_semantic_similarity"].is_not_null()
valid_jaccard = df["ngram_jaccard_similarity"].is_not_null()
valid_mask = valid_semantic & valid_jaccard

# Filter the dataframe
df_valid = df.filter(valid_mask)

# Extract semantic similarity
semantic_sim = df_valid["avg_pairwise_semantic_similarity"].to_numpy()

# Extract legacy Jaccard similarities (list column with 4 values: 2-5 char n-grams)
jaccard_lists = df_valid["ngram_jaccard_similarity"].to_list()

# Extract new dual Jaccard values
top_char_jaccard = df_valid["top_char_ngram_jaccard"].to_numpy()
top_word_jaccard = df_valid["top_word_ngram_jaccard"].to_numpy()

# Unpack the lists into separate arrays, filtering out any NaN values
jaccard_data = []
semantic_filtered = []
char_jaccard_filtered = []
word_jaccard_filtered = []
for i, row in enumerate(jaccard_lists):
    if row is not None and len(row) == 4:  # Updated to 4 values (2-5 char n-grams)
        # Check if any value in the list is NaN
        if not any(val is None or np.isnan(val) for val in row):
            jaccard_data.append(row)
            semantic_filtered.append(semantic_sim[i])
            char_jaccard_filtered.append(top_char_jaccard[i] if top_char_jaccard[i] is not None else np.nan)
            word_jaccard_filtered.append(top_word_jaccard[i] if top_word_jaccard[i] is not None else np.nan)

# Convert to numpy arrays for easier manipulation
jaccard_array = np.array(jaccard_data)  # Shape: (n_features, 4)
semantic_sim = np.array(semantic_filtered)
top_char_jaccard_arr = np.array(char_jaccard_filtered)
top_word_jaccard_arr = np.array(word_jaccard_filtered)

print(f"\nSemantic similarity stats:")
print(f"  Count: {len(semantic_sim)}")
print(f"  Mean: {np.mean(semantic_sim):.4f}")
print(f"  Std: {np.std(semantic_sim):.4f}")
print(f"  Min: {np.min(semantic_sim):.4f}")
print(f"  Max: {np.max(semantic_sim):.4f}")

print(f"\nLegacy Jaccard similarity shape: {jaccard_array.shape}")
print(f"Legacy Jaccard similarity stats (by char n-gram size):")
for i, ngram_type in enumerate(["2-gram", "3-gram", "4-gram", "5-gram"]):
    values = jaccard_array[:, i]
    print(f"  {ngram_type}:")
    print(f"    Mean: {np.mean(values):.4f}")
    print(f"    Std: {np.std(values):.4f}")
    print(f"    Min: {np.min(values):.4f}")
    print(f"    Max: {np.max(values):.4f}")

# Filter out NaN values for dual Jaccard stats
top_char_valid = top_char_jaccard_arr[~np.isnan(top_char_jaccard_arr)]
top_word_valid = top_word_jaccard_arr[~np.isnan(top_word_jaccard_arr)]

print(f"\nNew Dual Jaccard similarity stats:")
print(f"  Top Char N-gram Jaccard:")
print(f"    Count: {len(top_char_valid)}")
print(f"    Mean: {np.mean(top_char_valid):.4f}" if len(top_char_valid) > 0 else "    Mean: N/A")
print(f"    Std: {np.std(top_char_valid):.4f}" if len(top_char_valid) > 0 else "    Std: N/A")
print(f"    Min: {np.min(top_char_valid):.4f}" if len(top_char_valid) > 0 else "    Min: N/A")
print(f"    Max: {np.max(top_char_valid):.4f}" if len(top_char_valid) > 0 else "    Max: N/A")

print(f"  Top Word N-gram Jaccard:")
print(f"    Count: {len(top_word_valid)}")
print(f"    Mean: {np.mean(top_word_valid):.4f}" if len(top_word_valid) > 0 else "    Mean: N/A")
print(f"    Std: {np.std(top_word_valid):.4f}" if len(top_word_valid) > 0 else "    Std: N/A")
print(f"    Min: {np.min(top_word_valid):.4f}" if len(top_word_valid) > 0 else "    Min: N/A")
print(f"    Max: {np.max(top_word_valid):.4f}" if len(top_word_valid) > 0 else "    Max: N/A")

# Create visualizations - Updated for dual n-gram architecture
fig, axes = plt.subplots(3, 2, figsize=(14, 16))
fig.suptitle('Similarity Distributions for Activation Examples (Dual N-gram Architecture)', fontsize=16, fontweight='bold')

# 1. Semantic Similarity Distribution
ax1 = axes[0, 0]
ax1.hist(semantic_sim, bins=50, color='steelblue', alpha=0.7, edgecolor='black')
ax1.axvline(np.mean(semantic_sim), color='red', linestyle='--', linewidth=2, label=f'Mean: {np.mean(semantic_sim):.3f}')
ax1.axvline(np.median(semantic_sim), color='orange', linestyle='--', linewidth=2, label=f'Median: {np.median(semantic_sim):.3f}')
ax1.set_xlabel('Semantic Similarity (Cosine)', fontsize=11)
ax1.set_ylabel('Frequency', fontsize=11)
ax1.set_title('Avg Pairwise Semantic Similarity', fontsize=12, fontweight='bold')
ax1.legend()
ax1.grid(axis='y', alpha=0.3)

# 2. Legacy Jaccard Similarities by N-gram Size (updated to 4 sizes)
ax2 = axes[0, 1]
positions = [1, 2, 3, 4]
ngram_labels = ['2-gram', '3-gram', '4-gram', '5-gram']
box_data = [jaccard_array[:, i] for i in range(4)]
bp = ax2.boxplot(box_data, positions=positions, widths=0.6, patch_artist=True,
                 tick_labels=ngram_labels, showmeans=True)
for patch, color in zip(bp['boxes'], ['lightcoral', 'lightgreen', 'lightblue', 'lightyellow']):
    patch.set_facecolor(color)
ax2.set_ylabel('Jaccard Similarity', fontsize=11)
ax2.set_title('Legacy Char N-gram Jaccard by Size', fontsize=12, fontweight='bold')
ax2.grid(axis='y', alpha=0.3)

# 3. Combined Legacy Jaccard Distribution
ax3 = axes[1, 0]
for i, (ngram_type, color) in enumerate(zip(ngram_labels, ['red', 'green', 'blue', 'purple'])):
    ax3.hist(jaccard_array[:, i], bins=40, alpha=0.5, label=ngram_type,
             color=color, edgecolor='black', linewidth=0.5)
ax3.set_xlabel('Jaccard Similarity', fontsize=11)
ax3.set_ylabel('Frequency', fontsize=11)
ax3.set_title('Legacy Char N-gram Jaccard Distributions (Overlaid)', fontsize=12, fontweight='bold')
ax3.legend()
ax3.grid(axis='y', alpha=0.3)

# 4. Dual Jaccard: Top Char vs Top Word
ax4 = axes[1, 1]
if len(top_char_valid) > 0 and len(top_word_valid) > 0:
    ax4.hist(top_char_valid, bins=40, alpha=0.6, label='Top Char N-gram',
             color='coral', edgecolor='black', linewidth=0.5)
    ax4.hist(top_word_valid, bins=40, alpha=0.6, label='Top Word N-gram',
             color='skyblue', edgecolor='black', linewidth=0.5)
    ax4.axvline(np.mean(top_char_valid), color='red', linestyle='--', linewidth=2)
    ax4.axvline(np.mean(top_word_valid), color='blue', linestyle='--', linewidth=2)
ax4.set_xlabel('Jaccard Similarity', fontsize=11)
ax4.set_ylabel('Frequency', fontsize=11)
ax4.set_title('Dual Jaccard: Char vs Word N-grams', fontsize=12, fontweight='bold')
ax4.legend()
ax4.grid(axis='y', alpha=0.3)

# 5. Scatter: Semantic vs Average Legacy Jaccard
ax5 = axes[2, 0]
avg_jaccard = np.mean(jaccard_array, axis=1)
scatter = ax5.scatter(semantic_sim, avg_jaccard, alpha=0.4, s=20, c=avg_jaccard,
                      cmap='viridis', edgecolors='black', linewidths=0.5)
ax5.set_xlabel('Semantic Similarity (Cosine)', fontsize=11)
ax5.set_ylabel('Average Char N-gram Jaccard', fontsize=11)
ax5.set_title('Semantic vs Average Char N-gram Jaccard', fontsize=12, fontweight='bold')
ax5.grid(alpha=0.3)
cbar = plt.colorbar(scatter, ax=ax5)
cbar.set_label('Avg Jaccard', fontsize=10)

# Add correlation coefficient
correlation = np.corrcoef(semantic_sim, avg_jaccard)[0, 1]
ax5.text(0.05, 0.95, f'Correlation: {correlation:.3f}',
         transform=ax5.transAxes, fontsize=11, verticalalignment='top',
         bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

# 6. Scatter: Top Char Jaccard vs Top Word Jaccard
ax6 = axes[2, 1]
if len(top_char_valid) > 0 and len(top_word_valid) > 0:
    # Create arrays of same length for comparison
    char_word_valid_mask = ~(np.isnan(top_char_jaccard_arr) | np.isnan(top_word_jaccard_arr))
    char_valid_both = top_char_jaccard_arr[char_word_valid_mask]
    word_valid_both = top_word_jaccard_arr[char_word_valid_mask]

    scatter2 = ax6.scatter(char_valid_both, word_valid_both, alpha=0.4, s=20,
                          c=semantic_sim[char_word_valid_mask],
                          cmap='plasma', edgecolors='black', linewidths=0.5)
    ax6.plot([0, 1], [0, 1], 'r--', linewidth=2, alpha=0.5, label='y=x')
    ax6.set_xlabel('Top Char N-gram Jaccard', fontsize=11)
    ax6.set_ylabel('Top Word N-gram Jaccard', fontsize=11)
    ax6.set_title('Char vs Word N-gram Jaccard', fontsize=12, fontweight='bold')
    ax6.grid(alpha=0.3)
    ax6.legend()
    cbar2 = plt.colorbar(scatter2, ax=ax6)
    cbar2.set_label('Semantic Sim', fontsize=10)

    # Add correlation
    if len(char_valid_both) > 1:
        correlation2 = np.corrcoef(char_valid_both, word_valid_both)[0, 1]
        ax6.text(0.05, 0.95, f'Correlation: {correlation2:.3f}',
                transform=ax6.transAxes, fontsize=11, verticalalignment='top',
                bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))
else:
    ax6.text(0.5, 0.5, 'Insufficient data for dual Jaccard comparison',
             ha='center', va='center', transform=ax6.transAxes)

plt.tight_layout()
plt.savefig('/home/dohyun/interface/temp_similarity_distributions.png', dpi=150, bbox_inches='tight')
print(f"\n✅ Plot saved to: /home/dohyun/interface/temp_similarity_distributions.png")
plt.show()

print("\n🎉 Done!")
