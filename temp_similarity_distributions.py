#!/usr/bin/env python3
"""
Temporary script to visualize semantic similarity and Jaccard similarity distributions
from activation_example_similarity.parquet
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

# Extract Jaccard similarities (list column)
jaccard_lists = df_valid["ngram_jaccard_similarity"].to_list()

# Unpack the lists into separate arrays, filtering out any NaN values
jaccard_data = []
semantic_filtered = []
for i, row in enumerate(jaccard_lists):
    if row is not None and len(row) == 3:
        # Check if any value in the list is NaN
        if not any(np.isnan(val) for val in row):
            jaccard_data.append(row)
            semantic_filtered.append(semantic_sim[i])

# Convert to numpy arrays for easier manipulation
jaccard_array = np.array(jaccard_data)  # Shape: (n_features, 3)
semantic_sim = np.array(semantic_filtered)

print(f"\nSemantic similarity stats:")
print(f"  Count: {len(semantic_sim)}")
print(f"  Mean: {np.mean(semantic_sim):.4f}")
print(f"  Std: {np.std(semantic_sim):.4f}")
print(f"  Min: {np.min(semantic_sim):.4f}")
print(f"  Max: {np.max(semantic_sim):.4f}")

print(f"\nJaccard similarity shape: {jaccard_array.shape}")
print(f"Jaccard similarity stats (by n-gram type):")
for i, ngram_type in enumerate(["Bigram", "Trigram", "4-gram"]):
    values = jaccard_array[:, i]
    print(f"  {ngram_type}:")
    print(f"    Mean: {np.mean(values):.4f}")
    print(f"    Std: {np.std(values):.4f}")
    print(f"    Min: {np.min(values):.4f}")
    print(f"    Max: {np.max(values):.4f}")

# Create visualizations
fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.suptitle('Similarity Distributions for Activation Examples', fontsize=16, fontweight='bold')

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

# 2. Jaccard Similarities by N-gram Type
ax2 = axes[0, 1]
positions = [1, 2, 3]
ngram_labels = ['Bigram', 'Trigram', '4-gram']
box_data = [jaccard_array[:, i] for i in range(3)]
bp = ax2.boxplot(box_data, positions=positions, widths=0.6, patch_artist=True,
                 tick_labels=ngram_labels, showmeans=True)
for patch, color in zip(bp['boxes'], ['lightcoral', 'lightgreen', 'lightblue']):
    patch.set_facecolor(color)
ax2.set_ylabel('Jaccard Similarity', fontsize=11)
ax2.set_title('Jaccard Similarity by N-gram Type', fontsize=12, fontweight='bold')
ax2.grid(axis='y', alpha=0.3)

# 3. Combined Jaccard Distribution
ax3 = axes[1, 0]
for i, (ngram_type, color) in enumerate(zip(ngram_labels, ['red', 'green', 'blue'])):
    ax3.hist(jaccard_array[:, i], bins=40, alpha=0.5, label=ngram_type,
             color=color, edgecolor='black', linewidth=0.5)
ax3.set_xlabel('Jaccard Similarity', fontsize=11)
ax3.set_ylabel('Frequency', fontsize=11)
ax3.set_title('Jaccard Similarity Distributions (Overlaid)', fontsize=12, fontweight='bold')
ax3.legend()
ax3.grid(axis='y', alpha=0.3)

# 4. Scatter: Semantic vs Average Jaccard
ax4 = axes[1, 1]
avg_jaccard = np.mean(jaccard_array, axis=1)
scatter = ax4.scatter(semantic_sim, avg_jaccard, alpha=0.4, s=20, c=avg_jaccard,
                      cmap='viridis', edgecolors='black', linewidths=0.5)
ax4.set_xlabel('Semantic Similarity (Cosine)', fontsize=11)
ax4.set_ylabel('Average Jaccard Similarity', fontsize=11)
ax4.set_title('Semantic vs Average Jaccard Similarity', fontsize=12, fontweight='bold')
ax4.grid(alpha=0.3)
cbar = plt.colorbar(scatter, ax=ax4)
cbar.set_label('Avg Jaccard', fontsize=10)

# Add correlation coefficient
correlation = np.corrcoef(semantic_sim, avg_jaccard)[0, 1]
ax4.text(0.05, 0.95, f'Correlation: {correlation:.3f}',
         transform=ax4.transAxes, fontsize=11, verticalalignment='top',
         bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

plt.tight_layout()
plt.savefig('/home/dohyun/interface/temp_similarity_distributions.png', dpi=150, bbox_inches='tight')
print(f"\n✅ Plot saved to: /home/dohyun/interface/temp_similarity_distributions.png")
plt.show()

print("\n🎉 Done!")
