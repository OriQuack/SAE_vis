"""
Explanation Alignment Preprocessing Script

이 스크립트는 여러 LLM explanation 간의 공통 구문을 찾아 전처리합니다.
- Exact Matching: N-gram 기반 정확한 매칭
- Semantic Similarity: 임베딩 기반 의미적 유사 구문 매칭

사용법:
    python preprocess_explanation_alignment.py --mode exact --output-dir ../data/explanation_alignment
    python preprocess_explanation_alignment.py --mode semantic --threshold 0.7
"""

import json
import re
from pathlib import Path
from typing import List, Dict, Set, Tuple
from collections import defaultdict
import argparse
from tqdm import tqdm
import numpy as np

# Semantic similarity용 (optional - pip install sentence-transformers 필요)
try:
    from sentence_transformers import SentenceTransformer
    SEMANTIC_AVAILABLE = True
except ImportError:
    SEMANTIC_AVAILABLE = False
    print("Warning: sentence-transformers not installed. Semantic mode will not work.")


class ExplanationAlignmentPreprocessor:
    """LLM explanation 간 공통 구문 찾기"""

    def __init__(self):
        self.embedding_model = None

    # ========== Exact Matching Methods ==========

    @staticmethod
    def extract_ngrams(text: str, n: int = 3) -> Set[str]:
        """
        텍스트에서 n-gram 추출

        Args:
            text: 입력 텍스트
            n: n-gram 크기 (기본값: 3단어)

        Returns:
            n-gram 집합
        """
        # 전처리: 구두점 제거, 소문자 변환
        words = re.findall(r'\b\w+\b', text.lower())

        # n-gram 생성
        ngrams = set()
        for i in range(len(words) - n + 1):
            ngram = ' '.join(words[i:i+n])
            ngrams.add(ngram)

        return ngrams

    @staticmethod
    def find_common_ngrams(
        explanations: List[str],
        min_n: int = 3,
        max_n: int = 5,
        min_occurrences: int = 2
    ) -> Dict[str, List[int]]:
        """
        여러 explanation에서 공통 n-gram 찾기

        Args:
            explanations: explanation 텍스트 리스트 (3개: Llama, Qwen, OpenAI)
            min_n: 최소 n-gram 크기
            max_n: 최대 n-gram 크기
            min_occurrences: 최소 출현 횟수 (2 = 2개 이상 LLM에서 공통)

        Returns:
            {ngram: [explanation_indices]} 딕셔너리
        """
        ngram_to_explanations = defaultdict(set)

        # 각 explanation에서 다양한 크기의 n-gram 추출
        for exp_idx, text in enumerate(explanations):
            for n in range(min_n, max_n + 1):
                ngrams = ExplanationAlignmentPreprocessor.extract_ngrams(text, n)
                for ngram in ngrams:
                    ngram_to_explanations[ngram].add(exp_idx)

        # min_occurrences 이상 출현한 n-gram만 필터링
        common_ngrams = {
            ngram: sorted(list(exp_indices))
            for ngram, exp_indices in ngram_to_explanations.items()
            if len(exp_indices) >= min_occurrences
        }

        # 긴 n-gram 우선 (더 구체적인 매칭)
        common_ngrams = dict(
            sorted(common_ngrams.items(), key=lambda x: len(x[0].split()), reverse=True)
        )

        return common_ngrams

    @staticmethod
    def highlight_exact_matches(
        explanations: List[str],
        common_ngrams: Dict[str, List[int]]
    ) -> List[List[Dict]]:
        """
        Exact match를 위한 하이라이팅 정보 생성

        Returns:
            [
              [ # Explanation 0
                {"text": "word", "highlight": False},
                {"text": "common phrase", "highlight": True, "color": "#4CAF50", "shared_with": [0,1,2]},
                ...
              ],
              ...
            ]
        """
        result = []

        for exp_idx, text in enumerate(explanations):
            words = text.split()
            highlighted = []
            i = 0

            while i < len(words):
                matched = False

                # 긴 n-gram부터 매칭 시도 (greedy longest match)
                for ngram, exp_indices in common_ngrams.items():
                    if exp_idx not in exp_indices:
                        continue

                    ngram_words = ngram.split()
                    # 현재 위치에서 ngram 길이만큼의 단어를 추출하여 비교
                    if i + len(ngram_words) <= len(words):
                        window_words = words[i:i+len(ngram_words)]
                        window = ' '.join(window_words).lower()
                        # 구두점 제거한 버전으로 비교
                        window_clean = ' '.join(re.findall(r'\b\w+\b', window))

                        if window_clean == ngram:
                            # 매칭된 경우
                            highlighted.append({
                                "text": ' '.join(window_words),
                                "highlight": True,
                                "color": ExplanationAlignmentPreprocessor._get_color_for_match(exp_indices),
                                "shared_with": exp_indices,
                                "match_type": "exact",
                                "ngram_length": len(ngram_words)
                            })
                            i += len(ngram_words)
                            matched = True
                            break

                if not matched:
                    # 매칭 안 된 단어
                    highlighted.append({
                        "text": words[i],
                        "highlight": False
                    })
                    i += 1

            result.append(highlighted)

        return result

    @staticmethod
    def _get_color_for_match(shared_with: List[int]) -> str:
        """
        공유되는 explanation 개수에 따라 색상 반환

        - 3개 모두 공유: 진한 녹색 (#2E7D32)
        - 2개 공유: 중간 녹색 (#66BB6A)
        """
        if len(shared_with) == 3:
            return "#2E7D32"  # Dark green
        elif len(shared_with) == 2:
            return "#66BB6A"  # Medium green
        else:
            return "#E0E0E0"  # Gray (shouldn't be highlighted)

    # ========== Semantic Similarity Methods ==========

    def _get_embedding_model(self):
        """임베딩 모델 lazy loading"""
        if self.embedding_model is None:
            if not SEMANTIC_AVAILABLE:
                raise ImportError("sentence-transformers not installed. Run: pip install sentence-transformers")
            print("Loading sentence embedding model (all-MiniLM-L6-v2)...")
            self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        return self.embedding_model

    @staticmethod
    def chunk_text(text: str, method: str = "phrase") -> List[str]:
        """
        텍스트를 청크로 분할

        Args:
            text: 입력 텍스트
            method: "sentence" (문장 단위) 또는 "phrase" (구 단위)
        """
        if method == "sentence":
            # 간단한 문장 분할
            chunks = [s.strip() for s in re.split(r'[.!?;]', text) if s.strip()]
        else:  # phrase
            # 쉼표, 접속사 기준으로 분할
            chunks = [c.strip() for c in re.split(r',|\band\b|\bor\b|\bbut\b', text) if c.strip()]

        return chunks

    def compute_semantic_alignment(
        self,
        explanations: List[str],
        threshold: float = 0.7,
        chunk_method: str = "phrase"
    ) -> List[List[Dict]]:
        """
        의미적으로 유사한 chunk를 찾아 정렬

        Args:
            explanations: 3개의 explanation 텍스트
            threshold: 유사도 임계값 (0.7 = 70% 유사)
            chunk_method: "sentence" 또는 "phrase"

        Returns:
            하이라이팅 정보 (exact_matches와 동일한 형식)
        """
        model = self._get_embedding_model()

        # 1. 각 explanation을 chunk로 분할
        all_chunks = []
        chunk_to_exp = []  # (exp_idx, chunk_idx_in_exp)
        exp_chunks = []  # 각 explanation의 chunk 리스트 저장

        for exp_idx, text in enumerate(explanations):
            chunks = self.chunk_text(text, chunk_method)
            exp_chunks.append(chunks)
            all_chunks.extend(chunks)
            chunk_to_exp.extend([(exp_idx, i) for i in range(len(chunks))])

        if len(all_chunks) == 0:
            return [[] for _ in range(len(explanations))]

        # 2. 모든 chunk 임베딩 계산
        embeddings = model.encode(all_chunks, show_progress_bar=False)

        # 3. Cross-explanation 유사도 계산 (cosine similarity)
        # Normalize embeddings for cosine similarity
        embeddings_normalized = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
        similarity_matrix = np.dot(embeddings_normalized, embeddings_normalized.T)

        # 4. Threshold 이상인 chunk 쌍 찾기
        aligned_groups = []
        used_chunks = set()

        for i in range(len(all_chunks)):
            if i in used_chunks:
                continue

            exp_i, _ = chunk_to_exp[i]
            # 시작 chunk의 유사도는 나중에 계산 (일단 임시로 1.0)
            group = {exp_i: [(i, all_chunks[i], 1.0)]}  # (chunk_idx, text, similarity)

            for j in range(i + 1, len(all_chunks)):
                if j in used_chunks:
                    continue

                exp_j, _ = chunk_to_exp[j]

                # 다른 explanation에서만 매칭
                if exp_i != exp_j and similarity_matrix[i][j] >= threshold:
                    if exp_j not in group:
                        group[exp_j] = []
                    group[exp_j].append((j, all_chunks[j], float(similarity_matrix[i][j])))
                    used_chunks.add(j)

            # 2개 이상 explanation에서 매칭된 경우만
            if len(group) >= 2:
                # 시작 chunk(exp_i)의 유사도를 다른 매칭된 chunk들과의 평균으로 계산
                if len(group) > 1:
                    # 다른 explanation들과의 유사도 평균 계산
                    other_sims = []
                    for other_exp_idx in group:
                        if other_exp_idx != exp_i:
                            for other_chunks in group[other_exp_idx]:
                                other_j = other_chunks[0]
                                other_sims.append(similarity_matrix[i][other_j])

                    if other_sims:
                        avg_sim = sum(other_sims) / len(other_sims)
                        # 시작 chunk의 유사도 업데이트
                        group[exp_i] = [(i, all_chunks[i], float(avg_sim))]

                aligned_groups.append(group)
                used_chunks.add(i)

        # 5. 하이라이팅 정보 생성
        result = []

        for exp_idx in range(len(explanations)):
            chunks = exp_chunks[exp_idx]
            exp_result = []

            for chunk_idx, chunk in enumerate(chunks):
                # 이 chunk가 aligned group에 속하는지 확인
                matched_group = None
                similarity_score = 0.0

                for group in aligned_groups:
                    if exp_idx in group:
                        for c_idx, c_text, sim in group[exp_idx]:
                            if chunk == c_text:
                                matched_group = group
                                similarity_score = sim
                                break

                if matched_group:
                    shared_exps = sorted(list(matched_group.keys()))
                    exp_result.append({
                        "text": chunk,
                        "highlight": True,
                        "color": self._get_semantic_color(similarity_score),
                        "shared_with": shared_exps,
                        "match_type": "semantic",
                        "similarity": round(similarity_score, 3)
                    })
                else:
                    exp_result.append({
                        "text": chunk,
                        "highlight": False
                    })

            result.append(exp_result)

        return result

    @staticmethod
    def _get_semantic_color(similarity: float) -> str:
        """
        유사도에 따라 그라디언트 색상 반환

        0.7-0.8 → 연한 녹색 (#AED581)
        0.8-0.9 → 중간 녹색 (#66BB6A)
        0.9-1.0 → 진한 녹색 (#2E7D32)
        """
        if similarity >= 0.9:
            return "#2E7D32"
        elif similarity >= 0.8:
            return "#66BB6A"
        else:
            return "#AED581"


def process_all_features(
    input_dir: Path,
    output_dir: Path,
    mode: str = "exact",
    min_ngram: int = 3,
    max_ngram: int = 5,
    min_occurrences: int = 2,
    similarity_threshold: float = 0.7,
    chunk_method: str = "phrase",
    sample_size: int = None
):
    """
    모든 feature에 대해 explanation alignment 전처리

    Args:
        input_dir: detailed_json 폴더 경로
        output_dir: 출력 폴더 경로
        mode: "exact" 또는 "semantic"
        sample_size: None이면 전체, 숫자면 샘플링
    """

    preprocessor = ExplanationAlignmentPreprocessor()

    # Feature JSON 파일 찾기
    feature_files = sorted(input_dir.glob("feature_*.json"))

    if sample_size:
        feature_files = feature_files[:sample_size]

    print(f"Processing {len(feature_files)} features in {mode} mode...")

    results = []
    stats = {
        "total_features": len(feature_files),
        "mode": mode,
        "features_with_matches": 0,
        "total_matches": 0
    }

    for feature_path in tqdm(feature_files, desc="Processing features"):
        # Feature JSON 로드
        with open(feature_path, 'r') as f:
            feature_data = json.load(f)

        feature_id = feature_data['feature_id']

        # Explanation 텍스트 추출
        explanations_data = feature_data.get('explanations', [])
        if len(explanations_data) != 3:
            print(f"Warning: Feature {feature_id} has {len(explanations_data)} explanations (expected 3)")
            continue

        explanations = [exp['text'] for exp in explanations_data]
        llm_explainers = [exp['llm_explainer'] for exp in explanations_data]

        # Alignment 계산
        if mode == "exact":
            common_ngrams = preprocessor.find_common_ngrams(
                explanations,
                min_n=min_ngram,
                max_n=max_ngram,
                min_occurrences=min_occurrences
            )
            highlighted = preprocessor.highlight_exact_matches(explanations, common_ngrams)

            metadata = {
                "total_common_ngrams": len(common_ngrams),
                "longest_match": max([len(ng.split()) for ng in common_ngrams.keys()]) if common_ngrams else 0,
                "common_ngrams_list": list(common_ngrams.keys())[:10]  # 상위 10개만
            }

        else:  # semantic
            highlighted = preprocessor.compute_semantic_alignment(
                explanations,
                threshold=similarity_threshold,
                chunk_method=chunk_method
            )

            # 통계 계산
            total_matches = sum(
                1 for exp in highlighted
                for seg in exp
                if seg.get('highlight', False)
            )

            metadata = {
                "total_semantic_matches": total_matches,
                "similarity_threshold": similarity_threshold,
                "chunk_method": chunk_method
            }

        # 매칭이 있는 feature만 카운트
        has_matches = any(
            seg.get('highlight', False)
            for exp in highlighted
            for seg in exp
        )

        if has_matches:
            stats["features_with_matches"] += 1
            stats["total_matches"] += metadata.get("total_common_ngrams", 0) or metadata.get("total_semantic_matches", 0)

        # 결과 저장
        result = {
            "feature_id": feature_id,
            "alignment_mode": mode,
            "llm_explainers": llm_explainers,
            "highlighted_explanations": highlighted,
            "metadata": metadata
        }

        results.append(result)

    # 출력 폴더 생성
    output_dir.mkdir(parents=True, exist_ok=True)

    # 결과 저장
    output_file = output_dir / f"alignment_{mode}.json"
    with open(output_file, 'w') as f:
        json.dump({
            "statistics": stats,
            "results": results
        }, f, indent=2)

    print(f"\n✅ Processing complete!")
    print(f"   Output: {output_file}")
    print(f"   Features with matches: {stats['features_with_matches']} / {stats['total_features']}")
    print(f"   Total matches: {stats['total_matches']}")

    return output_file


def main():
    parser = argparse.ArgumentParser(description="Preprocess LLM explanation alignments")

    parser.add_argument(
        "--mode",
        choices=["exact", "semantic"],
        default="exact",
        help="Alignment mode: exact (n-gram) or semantic (embedding)"
    )

    parser.add_argument(
        "--input-dir",
        type=Path,
        default=Path("/home/jaeung/SAE_vis/data/detailed_json/google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120"),
        help="Input directory with feature JSON files"
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("/home/jaeung/SAE_vis/data/explanation_alignment"),
        help="Output directory for processed data"
    )

    parser.add_argument(
        "--min-ngram",
        type=int,
        default=3,
        help="Minimum n-gram size (exact mode only)"
    )

    parser.add_argument(
        "--max-ngram",
        type=int,
        default=5,
        help="Maximum n-gram size (exact mode only)"
    )

    parser.add_argument(
        "--min-occurrences",
        type=int,
        default=2,
        help="Minimum occurrences across explanations (exact mode only)"
    )

    parser.add_argument(
        "--threshold",
        type=float,
        default=0.7,
        help="Similarity threshold (semantic mode only)"
    )

    parser.add_argument(
        "--chunk-method",
        choices=["sentence", "phrase"],
        default="phrase",
        help="Text chunking method (semantic mode only)"
    )

    parser.add_argument(
        "--sample",
        type=int,
        default=None,
        help="Process only N features (for testing)"
    )

    args = parser.parse_args()

    # 입력 폴더 확인
    if not args.input_dir.exists():
        print(f"❌ Error: Input directory not found: {args.input_dir}")
        return

    # 처리 실행
    process_all_features(
        input_dir=args.input_dir,
        output_dir=args.output_dir,
        mode=args.mode,
        min_ngram=args.min_ngram,
        max_ngram=args.max_ngram,
        min_occurrences=args.min_occurrences,
        similarity_threshold=args.threshold,
        chunk_method=args.chunk_method,
        sample_size=args.sample
    )


if __name__ == "__main__":
    main()
