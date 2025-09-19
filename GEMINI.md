# Project Overview

This project is a web-based application for visualizing and analyzing the reliability of Sparse Autoencoder (SAE) feature explanations. It consists of a FastAPI backend that provides a RESTful API for querying and processing data, and a React frontend that provides an interactive user interface for data visualization.

The application is designed to help researchers and developers understand how different factors, such as the choice of language model or the method used to generate explanations, affect the reliability of SAE feature explanations.

## Backend (FastAPI)

The backend is a Python application built with the FastAPI framework. It provides a set of endpoints for querying and processing data from a Parquet file.

**Key Technologies:**

*   **FastAPI:** A modern, fast (high-performance) web framework for building APIs with Python 3.7+ based on standard Python type hints.
*   **Polars:** A blazingly fast DataFrames library implemented in Rust, used for data manipulation and analysis.
*   **Uvicorn:** A lightning-fast ASGI server, used to run the FastAPI application.

**Running the Backend:**

1.  Install dependencies:
    ```bash
    cd backend
    pip install -r requirements.txt
    ```
2.  Start the server:
    ```bash
    python start.py
    ```

**API Endpoints:**

The backend provides the following API endpoints:

*   `/api/filter-options`: Get available filter options for the UI.
*   `/api/histogram-data`: Get data for rendering histograms.
*   `/api/sankey-data`: Get data for rendering Sankey diagrams.
*   `/api/comparison-data`: Get data for comparing different configurations.
*   `/api/feature/{id}`: Get detailed information about a specific feature.

## Frontend (React)

The frontend is a single-page application built with React and TypeScript. It uses the Vite development server for a fast and efficient development experience.

**Key Technologies:**

*   **React:** A JavaScript library for building user interfaces.
*   **TypeScript:** A typed superset of JavaScript that compiles to plain JavaScript.
*   **Vite:** A build tool that aims to provide a faster and leaner development experience for modern web projects.
*   **D3.js:** A JavaScript library for manipulating documents based on data. D3 helps you bring data to life using HTML, SVG, and CSS.
*   **Zustand:** A small, fast and scalable bearbones state-management solution.

**Running the Frontend:**

1.  Install dependencies:
    ```bash
    cd frontend
    npm install
    ```
2.  Start the development server:
    ```bash
    npm run dev
    ```

## Data

The application uses a Parquet file (`data/master/feature_analysis.parquet`) as its primary data source. This file contains a summary of the feature analysis data, including the following fields:

*   `feature_id`: The ID of the feature.
*   `sae_id`: The ID of the SAE.
*   `explanation_method`: The method used to generate the explanation.
*   `llm_explainer`: The language model used to generate the explanation.
*   `llm_scorer`: The language model used to score the explanation.
*   `feature_splitting`: Whether the feature is a candidate for feature splitting.
*   `semdist_mean`: The mean semantic distance between explanations.
*   `semdist_max`: The maximum semantic distance between explanations.
*   `score_fuzz`: The fuzzing score.
*   `score_simulation`: The simulation score.
*   `score_detection`: The detection score.
*   `score_embedding`: The embedding score.
*   `details_path`: The path to the detailed JSON file for the feature.

The detailed information for each feature is stored in a separate JSON file in the `data/detailed_json` directory.

## Development Conventions

*   **Code Style:** The project follows the PEP 8 style guide for Python code and the standard TypeScript style guide for frontend code.
*   **Testing:** The backend uses `curl` and `requests` for manual testing. The frontend uses `eslint` for linting.
*   **Documentation:** The backend has a detailed `README.md` file that documents the API endpoints and provides instructions for running the application. The frontend has a `README.md` file that provides instructions for running the application.
