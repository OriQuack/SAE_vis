"""
Query by Committee (QBC) Service for Active Learning.

Trains Random Forest and MLP models alongside SVM to detect disagreement cases
where SVM is confident but other models disagree. Uses vote entropy to measure
agreement across the committee.
"""

import numpy as np
import logging
from typing import Tuple, List, Dict, Optional
from dataclasses import dataclass
from sklearn.ensemble import RandomForestClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)


@dataclass
class CommitteePrediction:
    """Prediction result from the committee of models."""
    svm_prediction: int      # 0 or 1
    rf_prediction: int       # 0 or 1
    mlp_prediction: int      # 0 or 1
    vote_entropy: float      # 0 to ~1.58 (log2(3) for 3 models)


class CommitteeService:
    """
    Service for training and predicting with a committee of models (RF + MLP).

    Used alongside SVM for Query by Committee approach where disagreement
    between models indicates potential outliers or uncertain regions.
    """

    # Minimum training samples required for committee training
    MIN_SAMPLES_PER_CLASS = 3

    def __init__(self):
        """Initialize CommitteeService."""
        self._rf_model: Optional[RandomForestClassifier] = None
        self._mlp_model: Optional[MLPClassifier] = None
        self._scaler: Optional[StandardScaler] = None

    def train_committee(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        sample_weights: Optional[np.ndarray] = None
    ) -> Tuple[Optional[RandomForestClassifier], Optional[MLPClassifier], Optional[StandardScaler]]:
        """
        Train Random Forest and MLP models for committee.

        Args:
            X_train: Training feature matrix (N_samples, N_features)
            y_train: Training labels (N_samples,) with values 0 or 1
            sample_weights: Optional sample weights (N_samples,)

        Returns:
            Tuple of (RF model, MLP model, Scaler) - any may be None if training fails
        """
        n_samples = len(y_train)
        n_positive = np.sum(y_train == 1)
        n_negative = np.sum(y_train == 0)

        # Check minimum samples
        if n_positive < self.MIN_SAMPLES_PER_CLASS or n_negative < self.MIN_SAMPLES_PER_CLASS:
            logger.warning(
                f"[CommitteeService] Insufficient samples for training: "
                f"{n_positive} positive, {n_negative} negative. "
                f"Need at least {self.MIN_SAMPLES_PER_CLASS} per class."
            )
            return None, None, None

        logger.info(
            f"[CommitteeService] Training committee with {n_samples} samples "
            f"({n_positive} positive, {n_negative} negative)"
        )

        # Scale features (important for MLP)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_train)

        # Train Random Forest
        rf_model = self._train_random_forest(X_scaled, y_train, sample_weights, n_samples)

        # Train MLP
        mlp_model = self._train_mlp(X_scaled, y_train, sample_weights, n_samples)

        self._rf_model = rf_model
        self._mlp_model = mlp_model
        self._scaler = scaler

        return rf_model, mlp_model, scaler

    def _train_random_forest(
        self,
        X_scaled: np.ndarray,
        y_train: np.ndarray,
        sample_weights: Optional[np.ndarray],
        n_samples: int
    ) -> Optional[RandomForestClassifier]:
        """
        Train Random Forest with Active Learning optimized configuration.

        Uses shallow trees and limited estimators to avoid overfitting on small datasets.
        """
        try:
            # Scale n_estimators with data size (min 10, max 100)
            n_estimators = max(10, min(100, n_samples // 2))

            # Shallow trees to avoid overfitting
            max_depth = min(5, max(2, int(np.log2(n_samples + 1))))

            rf = RandomForestClassifier(
                n_estimators=n_estimators,
                max_depth=max_depth,
                class_weight='balanced',
                random_state=42,
                n_jobs=-1
            )

            rf.fit(X_scaled, y_train, sample_weight=sample_weights)

            logger.info(
                f"[CommitteeService] RF trained: n_estimators={n_estimators}, "
                f"max_depth={max_depth}"
            )

            return rf

        except Exception as e:
            logger.error(f"[CommitteeService] RF training failed: {e}")
            return None

    def _train_mlp(
        self,
        X_scaled: np.ndarray,
        y_train: np.ndarray,
        sample_weights: Optional[np.ndarray],
        n_samples: int
    ) -> Optional[MLPClassifier]:
        """
        Train MLP with Active Learning optimized configuration.

        Uses early stopping, L2 regularization, and architecture scaled to data size.
        """
        try:
            # Architecture based on sample size
            if n_samples < 20:
                hidden_layer_sizes = (16,)  # Single small layer
            elif n_samples < 50:
                hidden_layer_sizes = (32, 16)
            else:
                hidden_layer_sizes = (32, 16)

            mlp = MLPClassifier(
                hidden_layer_sizes=hidden_layer_sizes,
                alpha=0.01,  # L2 regularization
                solver='adam',
                learning_rate='adaptive',
                max_iter=500,
                early_stopping=True,
                validation_fraction=0.2,
                n_iter_no_change=20,  # Patience
                random_state=42
            )

            # Note: MLPClassifier doesn't support sample_weight in fit()
            # We work around this by using class_weight-like behavior through regularization
            mlp.fit(X_scaled, y_train)

            logger.info(
                f"[CommitteeService] MLP trained: hidden_layers={hidden_layer_sizes}, "
                f"iterations={mlp.n_iter_}"
            )

            return mlp

        except Exception as e:
            logger.error(f"[CommitteeService] MLP training failed: {e}")
            return None

    def predict_with_committee(
        self,
        X: np.ndarray,
        svm_scores: np.ndarray,
        rf_model: Optional[RandomForestClassifier],
        mlp_model: Optional[MLPClassifier],
        scaler: Optional[StandardScaler]
    ) -> Dict[int, CommitteePrediction]:
        """
        Get predictions from committee and compute vote entropy.

        Args:
            X: Feature matrix (N_samples, N_features)
            svm_scores: SVM decision function scores (N_samples,)
            rf_model: Trained Random Forest model
            mlp_model: Trained MLP model
            scaler: Fitted StandardScaler

        Returns:
            Dict mapping sample index to CommitteePrediction
        """
        n_samples = len(svm_scores)
        results: Dict[int, CommitteePrediction] = {}

        # Convert SVM scores to predictions (1 if score > 0, else 0)
        svm_preds = (svm_scores > 0).astype(int)

        # If no committee models, return SVM-only predictions
        if rf_model is None and mlp_model is None:
            for i in range(n_samples):
                results[i] = CommitteePrediction(
                    svm_prediction=int(svm_preds[i]),
                    rf_prediction=int(svm_preds[i]),  # Fallback to SVM
                    mlp_prediction=int(svm_preds[i]),  # Fallback to SVM
                    vote_entropy=0.0
                )
            return results

        # Scale features for RF/MLP
        X_scaled = scaler.transform(X) if scaler is not None else X

        # Get RF predictions
        if rf_model is not None:
            rf_preds = rf_model.predict(X_scaled).astype(int)
        else:
            rf_preds = svm_preds  # Fallback to SVM

        # Get MLP predictions
        if mlp_model is not None:
            mlp_preds = mlp_model.predict(X_scaled).astype(int)
        else:
            mlp_preds = svm_preds  # Fallback to SVM

        # Compute vote entropy for each sample
        for i in range(n_samples):
            svm_pred = int(svm_preds[i])
            rf_pred = int(rf_preds[i])
            mlp_pred = int(mlp_preds[i])

            # Count votes
            votes = [svm_pred, rf_pred, mlp_pred]
            vote_counts = [votes.count(0), votes.count(1)]

            # Compute vote entropy: H = -sum(p * log2(p))
            vote_entropy = 0.0
            for count in vote_counts:
                if count > 0:
                    p = count / 3
                    vote_entropy -= p * np.log2(p)

            results[i] = CommitteePrediction(
                svm_prediction=svm_pred,
                rf_prediction=rf_pred,
                mlp_prediction=mlp_pred,
                vote_entropy=float(vote_entropy)
            )

        # Log summary
        avg_entropy = np.mean([r.vote_entropy for r in results.values()])
        logger.info(
            f"[CommitteeService] Committee predictions: "
            f"{n_samples} samples, avg entropy={avg_entropy:.3f}"
        )

        return results

    def get_vote_info_dict(
        self,
        item_ids: List[str],
        committee_predictions: Dict[int, CommitteePrediction]
    ) -> Dict[str, Dict]:
        """
        Convert committee predictions to API response format.

        Args:
            item_ids: List of item identifiers (feature_id or pair_key as strings)
            committee_predictions: Dict mapping indices to CommitteePrediction

        Returns:
            Dict mapping item_id to vote info dict for API response
        """
        result = {}
        for idx, item_id in enumerate(item_ids):
            if idx in committee_predictions:
                pred = committee_predictions[idx]
                result[item_id] = {
                    "svm_prediction": pred.svm_prediction,
                    "rf_prediction": pred.rf_prediction,
                    "mlp_prediction": pred.mlp_prediction,
                    "vote_entropy": pred.vote_entropy
                }
        return result
