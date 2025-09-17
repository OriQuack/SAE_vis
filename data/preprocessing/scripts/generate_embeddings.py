#!/usr/bin/env python3
"""
Generate embeddings for SAE feature explanations using configurable embedding models.
"""

import os
import json
import glob
import google.generativeai as genai
import time
import argparse
import shutil
from pathlib import Path
from typing import List, Dict, Optional
from dotenv import load_dotenv


def load_config(config_path: str) -> Dict:
    """Load configuration from JSON file."""
    with open(config_path, 'r') as f:
        return json.load(f)


def load_run_config(data_source_dir: Path) -> Dict:
    """Load run configuration to extract sae_id."""
    run_config_path = data_source_dir / "run_config.json"
    if not run_config_path.exists():
        return {}

    with open(run_config_path, 'r') as f:
        return json.load(f)


def extract_sae_id(run_config: Dict) -> str:
    """Extract SAE ID from run configuration."""
    sparse_model = run_config.get("sparse_model", "")
    hookpoints = run_config.get("hookpoints", [])

    if sparse_model and hookpoints:
        # Take the first hookpoint if multiple exist
        hookpoint = hookpoints[0] if isinstance(hookpoints, list) else hookpoints
        return f"{sparse_model}/{hookpoint}"
    return ""


def setup_gemini_api() -> None:
    """Setup Gemini API with API key from .env file."""
    # Find .env file by looking in parent directories
    current_dir = Path(__file__).parent
    while current_dir != current_dir.parent:
        env_path = current_dir / ".env"
        if env_path.exists():
            load_dotenv(env_path)
            break
        current_dir = current_dir.parent

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not found in .env file")
    genai.configure(api_key=api_key)


def get_explanation_files(explanations_dir: str, file_pattern: str) -> List[str]:
    """Get all explanation text files from the directory."""
    pattern = os.path.join(explanations_dir, file_pattern)
    files = glob.glob(pattern)
    return sorted(files)


def extract_latent_id(filename: str) -> str:
    """Extract latent ID from filename (e.g., layers.30_latent123.txt -> 123)."""
    basename = os.path.basename(filename)
    # Extract number between 'latent' and '.txt'
    start = basename.find("latent") + 6
    end = basename.find(".txt")
    return basename[start:end]


def read_explanation(filepath: str) -> str:
    """Read explanation text from file."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read().strip()
        # Remove quotes if present
        if content.startswith('"') and content.endswith('"'):
            content = content[1:-1]
        return content


def generate_embedding(
    text: str, model_name: str, task_type: str = "semantic_similarity"
) -> Optional[List[float]]:
    """Generate embedding for text using specified embedding model."""
    try:
        result = genai.embed_content(
            model=model_name, content=text, task_type=task_type
        )
        return result["embedding"]
    except Exception as e:
        print(f"Error generating embedding: {e}")
        return None


def save_embeddings(embeddings_data: Dict, output_dir: str, filename: str, config: Dict, sae_id: str) -> None:
    """Save embeddings data to JSON file and copy config."""
    os.makedirs(output_dir, exist_ok=True)

    # Save embeddings
    output_file = os.path.join(output_dir, filename)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(embeddings_data, f, indent=2, ensure_ascii=False)

    # Save config file with sae_id in the same directory
    config_with_sae_id = config.copy()
    config_with_sae_id["sae_id"] = sae_id
    config_file = os.path.join(output_dir, "config.json")
    with open(config_file, "w", encoding="utf-8") as f:
        json.dump(config_with_sae_id, f, indent=2, ensure_ascii=False)

    print(f"Embeddings saved to: {output_file}")
    print(f"Config saved to: {config_file}")


def main():
    """Main function to generate embeddings for all explanation files."""
    parser = argparse.ArgumentParser(description="Generate embeddings for SAE feature explanations")
    parser.add_argument(
        "--config",
        default="../config/embedding_config.json",
        help="Path to configuration file (default: ../config/embedding_config.json)"
    )
    args = parser.parse_args()

    # Get script directory and project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent.parent  # Go up to interface root

    # Load configuration
    config_path = script_dir / args.config
    if not config_path.exists():
        print(f"Config file not found: {config_path}")
        return

    config = load_config(config_path)
    print(f"Loaded config from: {config_path}")

    # Setup paths relative to project root
    data_source = config["data_source"]
    data_source_dir = project_root / "data" / "raw" / data_source
    explanations_dir = data_source_dir / "explanations"
    output_dir = project_root / "data" / "embeddings" / data_source

    print(f"Input directory: {explanations_dir}")
    print(f"Output directory: {output_dir}")

    # Load run config and extract sae_id
    run_config = load_run_config(data_source_dir)
    sae_id = extract_sae_id(run_config)
    print(f"Extracted SAE ID: {sae_id}")

    # Validate input directory exists
    if not explanations_dir.exists():
        print(f"Error: Explanations directory does not exist: {explanations_dir}")
        return

    # Setup Gemini API
    try:
        setup_gemini_api()
        print("Gemini API configured successfully")
    except ValueError as e:
        print(f"Error: {e}")
        print("Please set GOOGLE_API_KEY in .env file")
        return

    # Get all explanation files
    explanation_files = get_explanation_files(str(explanations_dir), config["file_pattern"])
    print(f"Found {len(explanation_files)} explanation files")

    if not explanation_files:
        print("No explanation files found!")
        return

    # Process each file
    embeddings_data = {
        "metadata": {
            "model": config["embedding_model"],
            "task_type": config["task_type"],
            "total_latents": len(explanation_files),
            "dataset": data_source,
            "sae_id": sae_id,
            "config_used": config,
        },
        "embeddings": {},
    }

    for i, filepath in enumerate(explanation_files):
        latent_id = extract_latent_id(filepath)
        explanation = read_explanation(filepath)

        print(f"Processing latent {latent_id} ({i+1}/{len(explanation_files)})")

        # Generate embedding
        embedding = generate_embedding(
            explanation,
            config["embedding_model"],
            config["task_type"]
        )

        if embedding is not None:
            embeddings_data["embeddings"][latent_id] = {
                "explanation": explanation,
                "embedding": embedding,
                "embedding_dim": len(embedding),
            }
            print(f"  Generated embedding with dimension: {len(embedding)}")
        else:
            print(f"  Failed to generate embedding for latent {latent_id}")

        # Add delay to avoid rate limiting
        time.sleep(config["delay_between_requests"])

    # Save results
    save_embeddings(embeddings_data, str(output_dir), config["output_filename"], config, sae_id)

    successful_embeddings = len(embeddings_data["embeddings"])
    print(
        f"\nCompleted: {successful_embeddings}/{len(explanation_files)} embeddings generated successfully"
    )


if __name__ == "__main__":
    main()
