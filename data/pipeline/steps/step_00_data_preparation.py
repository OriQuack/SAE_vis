#!/usr/bin/env python3
"""
Step 0: Data Preparation — Automated Neuronpedia Data Download

Downloads SAE feature data from the Neuronpedia S3 bucket and converts it
into the directory structure expected by steps 01-15.

Downloads:
- Activation examples (v1 + v2 sparse format)
- Prompts (token lists)
- Feature metadata (frac_nonzero)
- Explanations (per-feature text files)
- SAE metadata (source.jsonl)

Also supports user-provided additional explainer/score directories.

Usage:
    python data/pipeline/run.py --steps step_00 --only
    python data/pipeline/steps/step_00_data_preparation.py --config data/pipeline/config.yaml
"""

import gzip
import json
import logging
import re
import shutil
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging

import yaml

logger = logging.getLogger(__name__)


class DataPreparationProcessor(BaseProcessor):
    """Download and convert Neuronpedia S3 data for the pipeline."""

    @property
    def step_name(self) -> str:
        return "Step 0: Data Preparation"

    @property
    def version(self) -> str:
        return "1.0"

    def _init_paths(self) -> None:
        """Initialize paths and parameters from config."""
        super()._init_paths()

        params = self.config.get("parameters", {})
        global_config = self.config.get("global", {})
        global_paths = global_config.get("paths", {})

        # Neuronpedia identifiers (from global config)
        self.model_id = global_config.get("neuronpedia_model_id", "gemma-2-9b")
        self.sae_id_np = global_config.get("neuronpedia_sae_id", "30-gemmascope-res-16k")

        # S3 base URL
        s3_base = "https://neuronpedia-datasets.s3.us-east-1.amazonaws.com/v1"
        self.s3_base_url = f"{s3_base}/{self.model_id}/{self.sae_id_np}"

        # Download settings
        dl = params.get("download", {})
        self.cache_dir = self._resolve_path(
            dl.get("cache_dir", "data/cache/neuronpedia")
        ) / self.model_id / self.sae_id_np
        self.max_concurrent = dl.get("max_concurrent", 4)
        self.skip_existing = dl.get("skip_existing", True)

        # Output directories
        # Activations + frac_nonzero → intermediate (auto-generated, not user input)
        # Explanations → input (user-facing data sources)
        self.intermediate_dir = self._resolve_path(
            global_paths.get("intermediate", "data/intermediate")
        )
        self.input_dir = self._resolve_path(
            global_paths.get("input", "data/input")
        )

        # Explanation sources to download
        self.explanation_sources = params.get("explanation_sources", [
            {
                "s3_dir": "explanations",
                "data_source_name": "neuronpedia_gemini_flash_lite",
                "explainer_model": "google/gemini-2.5-flash-lite",
            },
            {
                "s3_dir": "explanations-gemini-flash-2.0",
                "data_source_name": "neuronpedia_gemini_flash_2",
                "explainer_model": "google/gemini-2.0-flash",
            },
        ])

        # Additional sources derived from global.data_sources + global.llm_explainer_mapping
        # Each data_source in global config that exists in input_dir is registered
        self.additional_sources = self._build_additional_sources_from_global(global_config)

        # Scoring config (future)
        self.scoring_config = params.get("scoring", {})

        # Will be populated from source.jsonl
        self.source_metadata: Dict[str, Any] = {}
        self.layer_number: int = 0
        self.num_features: int = 16384

        # Statistics
        self.stats = {
            "files_downloaded": 0,
            "bytes_downloaded": 0,
            "activations_written": 0,
            "features_extracted": 0,
            "explanations_written": 0,
            "additional_sources_integrated": 0,
        }

    def _build_additional_sources_from_global(
        self, global_config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Build additional_sources list from global.data_sources + llm_explainer_mapping.

        Each data_source that has a directory in input_dir is registered as an
        additional source with has_scores auto-detected.
        """
        data_sources = global_config.get("data_sources", [])
        mapping = global_config.get("llm_explainer_mapping", {})
        sources = []

        for ds_name in data_sources:
            ds_path = self.input_dir / ds_name
            # Resolve explainer model from mapping (prefix before _e-)
            explainer_model = ds_name
            if "_e-" in ds_name:
                prefix = ds_name.split("_e-")[0] + "_e"
                explainer_model = mapping.get(prefix, ds_name)

            has_scores = (ds_path / "scores").exists() if ds_path.exists() else False

            sources.append({
                "path": str(ds_path),
                "data_source_name": ds_name,
                "explainer_model": explainer_model,
                "has_scores": has_scores,
            })

        return sources

    # =========================================================================
    # MAIN ENTRY POINTS
    # =========================================================================

    def run(self) -> None:
        """Override run to handle non-DataFrame output."""
        logger.info(f"Starting {self.step_name} v{self.version}")
        logger.info(f"  Model: {self.model_id}, SAE: {self.sae_id_np}")
        logger.info(f"  Cache: {self.cache_dir}")
        logger.info(f"  Intermediate: {self.intermediate_dir}")
        logger.info(f"  Input: {self.input_dir}")
        self.process()
        self._log_stats()
        logger.info(f"Completed {self.step_name}")

    def process(self) -> None:
        """Execute all data preparation phases."""
        # Phase 1: Download from S3
        self._phase_download_s3()

        # Phase 2: Parse source metadata (needed by subsequent phases)
        self._phase_parse_source_metadata()

        # Phase 3: Convert activations
        self._phase_convert_activations()

        # Phase 4: Extract feature metadata
        self._phase_extract_feature_metadata()

        # Phase 5: Convert explanations
        self._phase_convert_explanations()

        # Phase 6: Integrate additional sources
        self._phase_integrate_additional_sources()

        # Phase 7: Generate run configs
        self._phase_generate_run_configs()

        # Phase 8: Write config_sources.yaml
        self._phase_write_config_sources()

    # =========================================================================
    # PHASE 1: S3 DOWNLOAD
    # =========================================================================

    def _phase_download_s3(self) -> None:
        """Download all required data from Neuronpedia S3."""
        logger.info("Phase 1: Downloading S3 data")

        # Ensure cache directory exists
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # 1. source.jsonl (tiny, download first — needed for metadata)
        self._download_file(
            f"{self.s3_base_url}/source.jsonl",
            self.cache_dir / "source.jsonl",
        )

        # 2. Discover available batch files
        v1_tasks = self._build_download_tasks("activations", "activations")
        v2_tasks = self._build_download_tasks("activations/v2", "activations_v2")
        feature_tasks = self._build_download_tasks("features", "features")

        # prompts.json (single file)
        prompts_task = [(
            f"{self.s3_base_url}/activations/v2/prompts.json",
            self.cache_dir / "activations_v2" / "prompts.json",
        )]

        # Explanation sources
        explanation_tasks = []
        for src in self.explanation_sources:
            s3_dir = src["s3_dir"]
            local_dir = src["data_source_name"]
            tasks = self._build_download_tasks(s3_dir, f"explanations_{local_dir}")
            explanation_tasks.extend(tasks)

        # 3. Download all in parallel
        all_tasks = v1_tasks + v2_tasks + feature_tasks + prompts_task + explanation_tasks
        self._download_parallel(all_tasks)

    def _build_download_tasks(
        self, s3_prefix: str, local_subdir: str
    ) -> List[Tuple[str, Path]]:
        """Build download task list for a batch directory.

        Tries batch-0 through batch-63 (max known range). Stops when
        a batch file returns 404.
        """
        tasks = []
        local_dir = self.cache_dir / local_subdir
        local_dir.mkdir(parents=True, exist_ok=True)

        for i in range(64):
            filename = f"batch-{i}.jsonl.gz"
            url = f"{self.s3_base_url}/{s3_prefix}/{filename}"
            dest = local_dir / filename
            tasks.append((url, dest))

        return tasks

    def _download_parallel(self, tasks: List[Tuple[str, Path]]) -> None:
        """Download files in parallel with skip-existing support."""
        # Filter out existing files if skip_existing (check both .gz and decompressed)
        if self.skip_existing:
            def _needs_download(dest: Path) -> bool:
                if dest.exists():
                    return False
                if str(dest).endswith(".gz") and Path(str(dest)[:-3]).exists():
                    return False
                return True
            tasks = [(url, dest) for url, dest in tasks if _needs_download(dest)]

        if not tasks:
            logger.info("  All files already cached, skipping download")
            return

        logger.info(f"  Downloading {len(tasks)} files (max_concurrent={self.max_concurrent})")

        succeeded = 0
        skipped_404 = 0

        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = {
                executor.submit(self._download_file, url, dest): (url, dest)
                for url, dest in tasks
            }
            for future in as_completed(futures):
                result = future.result()
                if result is True:
                    succeeded += 1
                elif result is None:
                    skipped_404 += 1

        self.stats["files_downloaded"] += succeeded
        logger.info(f"  Downloaded {succeeded} files ({skipped_404} not found/skipped)")

    def _download_file(self, url: str, dest: Path) -> Optional[bool]:
        """Download a single file. Returns True on success, None on 404, raises on error."""
        # Check both .gz and decompressed paths
        if self.skip_existing:
            if dest.exists():
                return True
            if str(dest).endswith(".gz"):
                decompressed = Path(str(dest)[:-3])
                if decompressed.exists():
                    return True

        dest.parent.mkdir(parents=True, exist_ok=True)

        for attempt in range(3):
            try:
                req = Request(url, headers={"User-Agent": "SAE-Pipeline/1.0"})
                with urlopen(req, timeout=120) as response:
                    content = response.read()
                    self.stats["bytes_downloaded"] += len(content)

                    # Decompress .gz files
                    if str(dest).endswith(".gz"):
                        decompressed_path = Path(str(dest)[:-3])  # remove .gz
                        with open(decompressed_path, "wb") as f:
                            f.write(gzip.decompress(content))
                        return True
                    else:
                        with open(dest, "wb") as f:
                            f.write(content)
                        return True

            except HTTPError as e:
                if e.code == 404:
                    return None  # File doesn't exist, not an error
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise
            except (URLError, TimeoutError):
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise

        return None

    # =========================================================================
    # PHASE 2: PARSE SOURCE METADATA
    # =========================================================================

    def _phase_parse_source_metadata(self) -> None:
        """Parse source.jsonl for SAE configuration."""
        logger.info("Phase 2: Parsing source metadata")

        source_path = self.cache_dir / "source.jsonl"
        if not source_path.exists():
            raise FileNotFoundError(f"source.jsonl not found at {source_path}")

        with open(source_path) as f:
            self.source_metadata = json.loads(f.readline())

        # Extract key fields
        saelens = self.source_metadata.get("saelensConfig", {})
        self.num_features = saelens.get("d_sae", 16384)

        # Extract layer number from hook_name (e.g., "blocks.30.hook_resid_post" -> 30)
        hook_name = saelens.get("hook_name", "")
        match = re.search(r"\.(\d+)\.", hook_name)
        if match:
            self.layer_number = int(match.group(1))
        else:
            # Fallback: extract from SAE ID (e.g., "30-gemmascope-res-16k" -> 30)
            match = re.search(r"^(\d+)-", self.sae_id_np)
            if match:
                self.layer_number = int(match.group(1))
            else:
                raise ValueError(
                    f"Could not determine layer number from hook_name='{hook_name}' "
                    f"or sae_id='{self.sae_id_np}'"
                )

        logger.info(f"  Model: {self.source_metadata.get('modelId')}")
        logger.info(f"  Hook: {hook_name}")
        logger.info(f"  Layer: {self.layer_number}")
        logger.info(f"  Features: {self.num_features}")
        logger.info(f"  HF Repo: {self.source_metadata.get('hfRepoId')}")
        logger.info(f"  HF Folder: {self.source_metadata.get('hfFolderId')}")

    # =========================================================================
    # PHASE 3: CONVERT ACTIVATIONS
    # =========================================================================

    def _phase_convert_activations(self) -> None:
        """Convert v1 + v2 activation batches to pipeline activations.jsonl format."""
        logger.info("Phase 3: Converting activations")

        output_dir = self.intermediate_dir / "activation_examples"
        output_dir.mkdir(parents=True, exist_ok=True)

        activations_path = output_dir / "activations.jsonl"
        prompts_path = output_dir / "prompts.json"

        # Copy prompts.json
        src_prompts = self.cache_dir / "activations_v2" / "prompts.json"
        if src_prompts.exists():
            shutil.copy2(src_prompts, prompts_path)
            logger.info(f"  Copied prompts.json")
        else:
            logger.warning(f"  prompts.json not found at {src_prompts}")

        # Check if output already exists
        if activations_path.exists() and self.skip_existing:
            logger.info(f"  activations.jsonl already exists, skipping")
            return

        # Merge v1 (has index/feature_id) + v2 (has dataSetPromptId + sparseValues)
        # They are in 1:1 line correspondence
        v1_dir = self.cache_dir / "activations"
        v2_dir = self.cache_dir / "activations_v2"

        total_lines = 0
        with open(activations_path, "w") as out_f:
            for batch_num in range(64):
                v1_file = v1_dir / f"batch-{batch_num}.jsonl"
                v2_file = v2_dir / f"batch-{batch_num}.jsonl"

                if not v1_file.exists() or not v2_file.exists():
                    break  # No more batches

                with open(v1_file) as f1, open(v2_file) as f2:
                    for v1_line, v2_line in zip(f1, f2):
                        v1_data = json.loads(v1_line)
                        v2_data = json.loads(v2_line)

                        # Combine: index from v1, dataSetPromptId + sparseValues from v2
                        combined = {
                            "index": str(v1_data["index"]),
                            "dataSetPromptId": v2_data["dataSetPromptId"],
                            "sparseValues": v2_data["sparseValues"],
                        }
                        out_f.write(json.dumps(combined, separators=(",", ":")) + "\n")
                        total_lines += 1

                logger.info(f"  Processed activation batch {batch_num}")

        self.stats["activations_written"] = total_lines
        logger.info(f"  Wrote {total_lines:,} activation lines to activations.jsonl")

    # =========================================================================
    # PHASE 4: EXTRACT FEATURE METADATA
    # =========================================================================

    def _phase_extract_feature_metadata(self) -> None:
        """Extract frac_nonzero from feature batch files."""
        logger.info("Phase 4: Extracting feature metadata")

        output_dir = self.intermediate_dir / "neuronpedia_frac_nonzero"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "frac_nonzero.json"

        if output_path.exists() and self.skip_existing:
            logger.info(f"  frac_nonzero.json already exists, skipping")
            return

        features_dir = self.cache_dir / "features"
        frac_nonzero: Dict[str, float] = {}

        for batch_num in range(64):
            batch_file = features_dir / f"batch-{batch_num}.jsonl"
            if not batch_file.exists():
                break

            with open(batch_file) as f:
                for line in f:
                    feature = json.loads(line)
                    fid = str(feature["index"])
                    frac_nonzero[fid] = feature.get("frac_nonzero", 0.0)

        with open(output_path, "w") as f:
            json.dump(frac_nonzero, f)

        self.stats["features_extracted"] = len(frac_nonzero)
        logger.info(f"  Extracted frac_nonzero for {len(frac_nonzero):,} features")

    # =========================================================================
    # PHASE 5: CONVERT EXPLANATIONS
    # =========================================================================

    def _phase_convert_explanations(self) -> None:
        """Convert explanation batch files to per-feature text files."""
        logger.info("Phase 5: Converting explanations")

        for src_config in self.explanation_sources:
            source_name = src_config["data_source_name"]
            cache_subdir = f"explanations_{source_name}"

            explanation_cache_dir = self.cache_dir / cache_subdir
            if not explanation_cache_dir.exists():
                logger.warning(f"  Cache dir not found for {source_name}, skipping")
                continue

            output_dir = self.input_dir / source_name / "explanations"
            output_dir.mkdir(parents=True, exist_ok=True)

            count = 0
            for batch_num in range(64):
                batch_file = explanation_cache_dir / f"batch-{batch_num}.jsonl"
                if not batch_file.exists():
                    break

                with open(batch_file) as f:
                    for line in f:
                        entry = json.loads(line)
                        feature_id = entry["index"]
                        description = entry.get("description", "")

                        filename = f"layers.{self.layer_number}_latent{feature_id}.txt"
                        output_file = output_dir / filename

                        if output_file.exists() and self.skip_existing:
                            count += 1
                            continue

                        with open(output_file, "w") as ef:
                            ef.write(json.dumps(description))
                        count += 1

            self.stats["explanations_written"] += count
            logger.info(f"  {source_name}: wrote {count:,} explanation files")

    # =========================================================================
    # PHASE 6: ADDITIONAL SOURCES
    # =========================================================================

    def _phase_integrate_additional_sources(self) -> None:
        """Register or copy user-provided explanation/score directories."""
        if not self.additional_sources:
            logger.info("Phase 6: No additional sources configured, skipping")
            return

        logger.info("Phase 6: Integrating additional sources")

        for source in self.additional_sources:
            src_path = self._resolve_path(source["path"])
            dest_name = source["data_source_name"]
            dest_path = self.input_dir / dest_name

            if not src_path.exists():
                logger.warning(f"  Source path not found: {src_path}")
                continue

            # If source already lives in input_dir, just validate — no copy needed
            if src_path.resolve() == dest_path.resolve():
                logger.info(f"  {dest_name}: already in input dir, registered")
                self.stats["additional_sources_integrated"] += 1
                continue

            if dest_path.exists() and self.skip_existing:
                logger.info(f"  {dest_name}: already exists, skipping")
                self.stats["additional_sources_integrated"] += 1
                continue

            dest_path.mkdir(parents=True, exist_ok=True)

            # Copy explanations
            src_explanations = src_path / "explanations"
            if src_explanations.exists():
                dest_explanations = dest_path / "explanations"
                if not dest_explanations.exists():
                    shutil.copytree(src_explanations, dest_explanations)
                    logger.info(f"  {dest_name}: copied explanations")

            # Copy scores if available
            if source.get("has_scores", False):
                src_scores = src_path / "scores"
                if src_scores.exists():
                    dest_scores = dest_path / "scores"
                    if not dest_scores.exists():
                        shutil.copytree(src_scores, dest_scores)
                        logger.info(f"  {dest_name}: copied scores")

            # Copy run_config.json if present
            src_config = src_path / "run_config.json"
            if src_config.exists():
                shutil.copy2(src_config, dest_path / "run_config.json")

            self.stats["additional_sources_integrated"] += 1
            logger.info(f"  Integrated: {dest_name}")

    # =========================================================================
    # PHASE 7: GENERATE RUN CONFIGS
    # =========================================================================

    def _phase_generate_run_configs(self) -> None:
        """Generate run_config.json for Neuronpedia-sourced directories."""
        logger.info("Phase 7: Generating run configs")

        saelens = self.source_metadata.get("saelensConfig", {})

        for src_config in self.explanation_sources:
            source_name = src_config["data_source_name"]
            output_dir = self.input_dir / source_name
            config_path = output_dir / "run_config.json"

            if config_path.exists() and self.skip_existing:
                continue

            output_dir.mkdir(parents=True, exist_ok=True)

            run_config = {
                "model": saelens.get("model_name", self.source_metadata.get("modelId", "")),
                "sparse_model": self.source_metadata.get("hfRepoId", ""),
                "hookpoints": [self.source_metadata.get("hfFolderId", "")],
                "explainer_model": src_config["explainer_model"],
                "name": source_name,
                "neuronpedia_model_id": self.model_id,
                "neuronpedia_sae_id": self.sae_id_np,
                "saelens_config": saelens,
                "cache_cfg": {
                    "dataset_repo": self.source_metadata.get("dataset", ""),
                    "num_prompts": self.source_metadata.get("num_prompts", 0),
                    "num_tokens_in_prompt": self.source_metadata.get("num_tokens_in_prompt", 0),
                },
            }

            with open(config_path, "w") as f:
                json.dump(run_config, f, indent=2)

            logger.info(f"  Generated run_config.json for {source_name}")

    # =========================================================================
    # PHASE 8: WRITE CONFIG SOURCES
    # =========================================================================

    def _phase_write_config_sources(self) -> None:
        """Write config_sources.yaml for run.py to merge."""
        logger.info("Phase 8: Writing config_sources.yaml")

        saelens = self.source_metadata.get("saelensConfig", {})
        hf_repo = self.source_metadata.get("hfRepoId", "")
        hf_folder = self.source_metadata.get("hfFolderId", "")

        # Build sae_id from HF coordinates
        sae_id_full = f"{hf_repo}/{hf_folder}" if hf_repo and hf_folder else ""
        sae_id_sanitized = sae_id_full.replace("/", "--") if sae_id_full else ""

        # Collect all data sources (Neuronpedia + additional)
        data_sources = [src["data_source_name"] for src in self.explanation_sources]
        llm_explainer_mapping = {}
        for src in self.explanation_sources:
            # Map the prefix (before _e- or full name) to the model name
            name = src["data_source_name"]
            llm_explainer_mapping[name] = src["explainer_model"]

        for src in self.additional_sources:
            name = src["data_source_name"]
            data_sources.append(name)
            if "explainer_model" in src:
                llm_explainer_mapping[name] = src["explainer_model"]

        config_sources = {
            "sae_config": {
                "sae_id": sae_id_full,
                "sae_id_sanitized": sae_id_sanitized,
                "hf_repo_id": hf_repo,
                "hf_folder_id": hf_folder,
                "hook_name": saelens.get("hook_name", ""),
                "layer": self.layer_number,
                "d_sae": self.num_features,
                "d_in": saelens.get("d_in", 0),
                "num_features": self.num_features,
            },
            "data_sources": data_sources,
            "llm_explainer_mapping": llm_explainer_mapping,
        }

        # Write to pipeline directory (next to config.yaml)
        pipeline_dir = self._resolve_path("data/pipeline")
        output_path = pipeline_dir / "config_sources.yaml"

        with open(output_path, "w") as f:
            f.write("# Auto-generated by step_00_data_preparation — DO NOT EDIT\n")
            f.write(f"# Source: {self.model_id}/{self.sae_id_np}\n\n")
            yaml.dump(config_sources, f, default_flow_style=False, sort_keys=False)

        logger.info(f"  Wrote {output_path}")
        logger.info(f"  Data sources: {data_sources}")


# =============================================================================
# STANDALONE ENTRY POINT
# =============================================================================

def main():
    """Main entry point for standalone execution."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Step 0: Download and prepare Neuronpedia data"
    )
    parser.add_argument("--config", type=str, help="Path to pipeline config.yaml")
    parser.add_argument("--limit", type=int, help="Limit number of features (unused)")

    args = parser.parse_args()

    setup_logging()

    if args.config:
        full_config = load_yaml_config(args.config)
        config = full_config.get("steps", {}).get("step_00_data_preparation", {})
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config = {}

    processor = DataPreparationProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
