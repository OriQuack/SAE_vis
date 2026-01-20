"""
PyTorch-based MLP with proper sample weight support.

Implements the cVIL paper approach: sample weights are applied directly to the
loss function during training, rather than using bootstrap sampling approximation.

Reference:
    "Batch labels are given a lower sample weight during training, which is
    realized by assigning them lower costs in the loss function before
    back-propagation."
"""

import numpy as np
import logging
from typing import Optional, Tuple

import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

logger = logging.getLogger(__name__)


class _MLPNetwork(nn.Module):
    """Simple feedforward network for classification."""

    def __init__(self, input_dim: int, hidden_layer_sizes: Tuple[int, ...], n_classes: int):
        super().__init__()

        layers = []
        prev_dim = input_dim

        for hidden_dim in hidden_layer_sizes:
            layers.append(nn.Linear(prev_dim, hidden_dim))
            layers.append(nn.ReLU())
            prev_dim = hidden_dim

        layers.append(nn.Linear(prev_dim, n_classes))
        self.network = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)


class WeightedMLPClassifier:
    """
    sklearn-compatible MLP classifier with proper sample weight support.

    Unlike sklearn's MLPClassifier which doesn't support sample_weight,
    this implementation applies weights directly to CrossEntropyLoss
    as described in the cVIL paper.

    Parameters
    ----------
    hidden_layer_sizes : tuple of int, default=(32, 16)
        The number of neurons in each hidden layer.
    alpha : float, default=0.01
        L2 regularization strength (weight_decay in Adam optimizer).
    max_iter : int, default=500
        Maximum number of training epochs.
    early_stopping : bool, default=True
        Whether to use early stopping based on validation loss.
    validation_fraction : float, default=0.2
        Fraction of training data for validation (when early_stopping=True).
    n_iter_no_change : int, default=20
        Number of epochs with no improvement before stopping.
    learning_rate_init : float, default=0.001
        Initial learning rate for Adam optimizer.
    batch_size : int, default=32
        Mini-batch size for training.
    random_state : int, optional
        Random seed for reproducibility.
    """

    def __init__(
        self,
        hidden_layer_sizes: Tuple[int, ...] = (32, 16),
        alpha: float = 0.01,
        max_iter: int = 500,
        early_stopping: bool = True,
        validation_fraction: float = 0.2,
        n_iter_no_change: int = 20,
        learning_rate_init: float = 0.001,
        batch_size: int = 32,
        random_state: Optional[int] = None
    ):
        self.hidden_layer_sizes = hidden_layer_sizes
        self.alpha = alpha
        self.max_iter = max_iter
        self.early_stopping = early_stopping
        self.validation_fraction = validation_fraction
        self.n_iter_no_change = n_iter_no_change
        self.learning_rate_init = learning_rate_init
        self.batch_size = batch_size
        self.random_state = random_state

        self._model: Optional[_MLPNetwork] = None
        self._classes: Optional[np.ndarray] = None
        self.n_iter_: int = 0

    def fit(
        self,
        X: np.ndarray,
        y: np.ndarray,
        sample_weight: Optional[np.ndarray] = None
    ) -> "WeightedMLPClassifier":
        """
        Fit the MLP classifier with optional sample weights.

        Parameters
        ----------
        X : array-like of shape (n_samples, n_features)
            Training feature matrix.
        y : array-like of shape (n_samples,)
            Target labels.
        sample_weight : array-like of shape (n_samples,), optional
            Sample weights. If None, all samples are weighted equally.

        Returns
        -------
        self : WeightedMLPClassifier
            Fitted estimator.
        """
        if self.random_state is not None:
            torch.manual_seed(self.random_state)
            np.random.seed(self.random_state)

        # Convert to numpy arrays
        X = np.asarray(X, dtype=np.float32)
        y = np.asarray(y)

        # Store unique classes for prediction
        self._classes = np.unique(y)
        n_classes = len(self._classes)

        # Map labels to 0, 1, ..., n_classes-1
        label_map = {label: idx for idx, label in enumerate(self._classes)}
        y_mapped = np.array([label_map[label] for label in y])

        # Default sample weights
        if sample_weight is None:
            sample_weight = np.ones(len(y), dtype=np.float32)
        else:
            sample_weight = np.asarray(sample_weight, dtype=np.float32)

        # Train/validation split for early stopping
        if self.early_stopping:
            X_train, X_val, y_train, y_val, w_train, w_val = self._train_val_split(
                X, y_mapped, sample_weight
            )
        else:
            X_train, y_train, w_train = X, y_mapped, sample_weight
            X_val, y_val, w_val = None, None, None

        # Convert to tensors
        X_train_t = torch.from_numpy(X_train)
        y_train_t = torch.from_numpy(y_train).long()
        w_train_t = torch.from_numpy(w_train)

        if X_val is not None:
            X_val_t = torch.from_numpy(X_val)
            y_val_t = torch.from_numpy(y_val).long()
            w_val_t = torch.from_numpy(w_val)
        else:
            X_val_t, y_val_t, w_val_t = None, None, None

        # Initialize model
        input_dim = X_train.shape[1]
        self._model = _MLPNetwork(input_dim, self.hidden_layer_sizes, n_classes)

        # Optimizer with weight_decay for L2 regularization (matches sklearn's alpha)
        optimizer = torch.optim.Adam(
            self._model.parameters(),
            lr=self.learning_rate_init,
            weight_decay=self.alpha
        )

        # Learning rate scheduler (matches sklearn's learning_rate='adaptive')
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            optimizer, mode='min', factor=0.5, patience=10, min_lr=1e-6
        )

        # Loss function with per-sample losses
        criterion = nn.CrossEntropyLoss(reduction='none')

        # Create data loader
        train_dataset = TensorDataset(X_train_t, y_train_t, w_train_t)
        train_loader = DataLoader(
            train_dataset,
            batch_size=min(self.batch_size, len(X_train)),
            shuffle=True
        )

        # Training loop
        best_val_loss = float('inf')
        epochs_no_improve = 0
        epoch = 0

        for epoch in range(self.max_iter):
            self._model.train()
            epoch_loss = 0.0

            for batch_X, batch_y, batch_w in train_loader:
                optimizer.zero_grad()

                outputs = self._model(batch_X)
                loss_per_sample = criterion(outputs, batch_y)

                # Apply sample weights to loss (cVIL approach)
                weighted_loss = (loss_per_sample * batch_w).mean()

                weighted_loss.backward()
                optimizer.step()

                epoch_loss += weighted_loss.item()

            # Early stopping check
            if self.early_stopping and X_val_t is not None and y_val_t is not None and w_val_t is not None:
                val_loss = self._compute_weighted_loss(
                    X_val_t, y_val_t, w_val_t, criterion
                )
                scheduler.step(val_loss)

                if val_loss < best_val_loss:
                    best_val_loss = val_loss
                    epochs_no_improve = 0
                else:
                    epochs_no_improve += 1
                    if epochs_no_improve >= self.n_iter_no_change:
                        self.n_iter_ = epoch + 1
                        break

        self.n_iter_ = epoch + 1
        return self

    def _train_val_split(
        self,
        X: np.ndarray,
        y: np.ndarray,
        sample_weight: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Split data into training and validation sets."""
        n_samples = len(y)
        n_val = max(1, int(n_samples * self.validation_fraction))

        # Ensure at least one sample in training
        if n_samples - n_val < 1:
            n_val = n_samples - 1

        indices = np.arange(n_samples)
        if self.random_state is not None:
            np.random.seed(self.random_state)
        np.random.shuffle(indices)

        val_idx = indices[:n_val]
        train_idx = indices[n_val:]

        return (
            X[train_idx], X[val_idx],
            y[train_idx], y[val_idx],
            sample_weight[train_idx], sample_weight[val_idx]
        )

    def _compute_weighted_loss(
        self,
        X: torch.Tensor,
        y: torch.Tensor,
        w: torch.Tensor,
        criterion: nn.CrossEntropyLoss
    ) -> float:
        """Compute weighted loss on a dataset."""
        model = self._model
        assert model is not None
        model.eval()
        with torch.no_grad():
            outputs = model(X)
            loss_per_sample = criterion(outputs, y)
            weighted_loss = (loss_per_sample * w).mean()
        return weighted_loss.item()

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predict class labels for samples in X.

        Parameters
        ----------
        X : array-like of shape (n_samples, n_features)
            Input samples.

        Returns
        -------
        y_pred : array of shape (n_samples,)
            Predicted class labels.
        """
        if self._model is None or self._classes is None:
            raise RuntimeError("Model not fitted. Call fit() first.")

        X = np.asarray(X, dtype=np.float32)
        X_t = torch.from_numpy(X)

        model = self._model
        classes = self._classes

        model.eval()
        with torch.no_grad():
            outputs = model(X_t)
            _, predicted = torch.max(outputs, 1)

        # Map back to original labels
        return classes[predicted.numpy()]

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Predict class probabilities for samples in X.

        Parameters
        ----------
        X : array-like of shape (n_samples, n_features)
            Input samples.

        Returns
        -------
        proba : array of shape (n_samples, n_classes)
            Class probabilities.
        """
        if self._model is None:
            raise RuntimeError("Model not fitted. Call fit() first.")

        X = np.asarray(X, dtype=np.float32)
        X_t = torch.from_numpy(X)

        model = self._model
        model.eval()
        with torch.no_grad():
            outputs = model(X_t)
            proba = torch.softmax(outputs, dim=1)

        return proba.numpy()
