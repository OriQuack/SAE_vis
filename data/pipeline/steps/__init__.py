"""
Processing steps for the SAE preprocessing pipeline.

Each step is implemented as a class inheriting from BaseProcessor.
Steps are discovered and executed by the run.py master script.
"""

# Step 1: Create activation examples from raw JSONL
from .step_01_activations import ActivationExamplesProcessor

# Step 2: Compute decoder weight similarities
from .step_02_decoder_similarity import DecoderSimilarityProcessor

# Step 3: Aggregate scoring metrics
from .step_03_scores import ScoresProcessor

# Step 4: Generate explanation embeddings
from .step_04_explanation_embeddings import ExplanationEmbeddingsProcessor

# Step 5: Pre-compute activation embeddings
from .step_05_activation_embeddings import ActivationEmbeddingProcessor

# Step 6: Feature clustering (agglomerative)
from .step_06_clustering import ClusteringProcessor

# Step 7: Create main features parquet
from .step_07_features import FeaturesProcessor

# Step 8: Calculate activation similarity metrics
from .step_08_activation_similarity import ActivationSimilarityProcessor

# Step 9: Inter-feature activation similarity
from .step_09_interfeature_similarity import InterFeatureSimilarityProcessor

# Step 10: Create activation display (frontend-optimized)
from .step_10_activation_display import ActivationDisplayProcessor

# Step 11: Process interfeature display data
from .step_11_interfeature_display import InterfeatureDisplayProcessor

# Step 12: Explanation alignment (phrase matching)
from .step_12_explanation_alignment import ExplanationAlignmentProcessor

# Step 13: Explanation consensus (phrase clustering)
from .step_13_explanation_consensus import ExplanationConsensusProcessor

# Step 14: Pre-aggregated SVM metrics for feature and pair classification
from .step_14_svm_metrics import SvmMetricsProcessor

# Step 15: Shuffle verification (syntax vs context contribution)
from .step_15_shuffle_verification import ShuffleVerificationProcessor


# Step mapping for dynamic dispatch
STEP_PROCESSORS = {
    "step_01_activations": ActivationExamplesProcessor,
    "step_02_decoder_similarity": DecoderSimilarityProcessor,
    "step_03_scores": ScoresProcessor,
    "step_04_explanation_embeddings": ExplanationEmbeddingsProcessor,
    "step_05_activation_embeddings": ActivationEmbeddingProcessor,
    "step_06_clustering": ClusteringProcessor,
    "step_07_features": FeaturesProcessor,
    "step_08_activation_similarity": ActivationSimilarityProcessor,
    "step_09_interfeature_similarity": InterFeatureSimilarityProcessor,
    "step_10_activation_display": ActivationDisplayProcessor,
    "step_11_interfeature_display": InterfeatureDisplayProcessor,
    "step_12_explanation_alignment": ExplanationAlignmentProcessor,
    "step_13_explanation_consensus": ExplanationConsensusProcessor,
    "step_14_svm_metrics": SvmMetricsProcessor,
    "step_15_shuffle_verification": ShuffleVerificationProcessor,
}


__all__ = [
    'ActivationExamplesProcessor',
    'DecoderSimilarityProcessor',
    'ScoresProcessor',
    'ExplanationEmbeddingsProcessor',
    'ClusteringProcessor',
    'FeaturesProcessor',
    'ActivationEmbeddingProcessor',
    'ActivationSimilarityProcessor',
    'InterFeatureSimilarityProcessor',
    'ActivationDisplayProcessor',
    'InterfeatureDisplayProcessor',
    'ExplanationAlignmentProcessor',
    'SvmMetricsProcessor',
    'ExplanationConsensusProcessor',
    'ShuffleVerificationProcessor',
    'STEP_PROCESSORS',
]
