#!/usr/bin/env python3
"""Comprehensive labeling analysis report generator."""

import json
import glob
import unicodedata
from collections import defaultdict
from datetime import datetime

# ── Constants ────────────────────────────────────────────────────────────────
LOG_DIR = "/home/dohyun/interface/backend/logs/"
EXPORT_DIR = "/home/dohyun/interface/analysis/"
OUTPUT_FILE = "/home/dohyun/interface/labeling_analysis.txt"
W = 80
PARTICIPANTS = ["박성완", "이재혁"]
PHASES = ["bootstrap", "learn", "apply"]

# Known reverted apply_tags events: (participant, stage, seq) → excluded from analysis
# 이재혁 Stage 1 seq=112: first threshold applied wrongly, then reverted and re-examined
REVERTED_EVENTS = {("이재혁", "stage1", 112)}

STAGE_META = {
    "stage1": {
        "label": "Stage 1 — Structural Soundness",
        "unit": "pairs",
        "categories": ["Monosemantic", "Incoherent Splitting"],
        "select_cat": "Incoherent Splitting",
        "reject_cat": "Monosemantic",
        "click_event": "pair_click",
        "drag_event": "threshold_drag",
        "json_key": "stage1_featureSplitting",
        "json_cat_map": {"monosemantic": "Monosemantic", "incoherentSplitting": "Incoherent Splitting"},
    },
    "stage2": {
        "label": "Stage 2 — Explanation Adequacy",
        "unit": "features",
        "categories": ["Well-Explained", "Need Revision"],
        "select_cat": "Well-Explained",
        "reject_cat": "Need Revision",
        "click_event": "feature_click",
        "drag_event": "threshold_drag",
        "json_key": "stage2_quality",
        "json_cat_map": {"wellExplained": "Well-Explained", "needRevision": "Need Revision"},
    },
    "stage3": {
        "label": "Stage 3 — Failure Attribution",
        "unit": "features",
        "categories": ["Well-Explained", "Missed Syntax", "Missed Context", "Noisy Activation"],
        "select_cat": None,
        "reject_cat": None,
        "click_event": "feature_click",
        "drag_event": "margin_threshold_drag",
        "json_key": "stage3_cause",
        "json_cat_map": {
            "wellExplained": "Well-Explained",
            "missedSyntax": "Missed Syntax",
            "missedContext": "Missed Context",
            "noisyActivation": "Noisy Activation",
        },
    },
}

BULK_S3_MAP = {
    "noisy-activation": "Noisy Activation",
    "missed-N-gram": "Missed Syntax",
    "missed-context": "Missed Context",
}


# ── Data Loading ─────────────────────────────────────────────────────────────
def find_file(directory, suffix):
    nfc = unicodedata.normalize("NFC", suffix)
    for f in glob.glob(directory + "/*"):
        if unicodedata.normalize("NFC", f).endswith(nfc):
            return f
    raise FileNotFoundError(f"No file matching *{suffix} in {directory}")


def load_action_log(name):
    path = find_file(LOG_DIR, f"{name}_action.jsonl")
    events = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s:
                continue
            if s.startswith("// "):
                s = s[3:]
            try:
                events.append(json.loads(s))
            except json.JSONDecodeError:
                pass
    return events


def load_json_export(name):
    path = find_file(EXPORT_DIR, f"{name}.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def is_reverted(name, e):
    return (name, e["stage"], e["seq"]) in REVERTED_EVENTS


# ── Phase Tracking ───────────────────────────────────────────────────────────
def determine_stage_bounds(events):
    bounds = {}
    for e in events:
        stg, evt = e["stage"], e["event"]
        seq = e["seq"]
        if stg == "stage1" and evt == "move_to_next_stage" and "stage1" not in bounds:
            bounds["stage1"] = seq
        elif stg == "stage2" and evt == "move_to_next_stage" and "stage2" not in bounds:
            bounds["stage2"] = seq
        elif stg == "stage3" and evt == "tag_remaining_by_boundary" and "stage3" not in bounds:
            bounds["stage3"] = seq
    return bounds


def in_window(e, bounds):
    stg = e["stage"]
    return stg in bounds and e["seq"] <= bounds[stg]


def build_phase_map(events, bounds):
    """Returns dict mapping event index -> phase for events within bounds."""
    cur = {"stage1": "bootstrap", "stage2": "bootstrap", "stage3": "bootstrap"}
    pmap = {}
    for i, e in enumerate(events):
        stg = e["stage"]
        if not in_window(e, bounds):
            continue
        if e["event"] == "stage_change":
            cur[stg] = e["details"]["stage"]
        pmap[i] = cur[stg]
    return pmap


# ── Table 1: Tags per Stage per Mode ────────────────────────────────────────
def compute_table1(name, events, bounds, pmap):
    """
    Returns: {stage_key: {category: {phase: {"manual": N, "auto": N}}}}
    Stage 1 counts are in pairs.
    Manual counts use net unique entities (final tag per entity per phase).
    """
    result = {}
    for sk in ["stage1", "stage2", "stage3"]:
        cats = STAGE_META[sk]["categories"]
        result[sk] = {c: {p: {"manual": 0, "auto": 0} for p in PHASES} for c in cats}

    # ── Manual tags ──
    # Stage 1: track per (pairKey, phase) -> final tag
    s1_pair_phase = {}  # (pairKey, phase) -> tag
    for i, e in enumerate(events):
        if e["stage"] != "stage1" or e["event"] != "manual_tag" or i not in pmap:
            continue
        d = e["details"]
        tag, prev = d["tag"], d.get("previousTag", "Unsure")
        if tag == prev:
            continue
        phase = pmap[i]
        pk = d["pairKey"]
        # If re-tagging in same phase, update; if new phase, new entry
        s1_pair_phase[(pk, phase)] = tag

    # Aggregate Stage 1 manual: count unique pairs per (category, phase)
    for (pk, phase), tag in s1_pair_phase.items():
        if tag in result["stage1"]:
            result["stage1"][tag][phase]["manual"] += 1

    # Stage 2 & 3: track per (featureId, phase) -> final tag
    for sk in ["stage2", "stage3"]:
        feat_phase = {}
        for i, e in enumerate(events):
            if e["stage"] != sk or e["event"] != "manual_tag" or i not in pmap:
                continue
            d = e["details"]
            tag, prev = d["tag"], d.get("previousTag", "Unsure")
            if tag == prev:
                continue
            phase = pmap[i]
            feat_phase[(d["featureId"], phase)] = tag

        for (fid, phase), tag in feat_phase.items():
            if tag in result[sk]:
                result[sk][tag][phase]["manual"] += 1

    # ── Auto tags (SVM apply_tags) ──
    for i, e in enumerate(events):
        if e["event"] != "apply_tags" or i not in pmap or is_reverted(name, e):
            continue
        sk = e["stage"]
        meta = STAGE_META[sk]
        d = e["details"]
        phase = pmap[i]
        if meta["select_cat"]:
            result[sk][meta["select_cat"]][phase]["auto"] += d.get("previewSelectCount", 0)
        if meta["reject_cat"]:
            result[sk][meta["reject_cat"]][phase]["auto"] += d.get("previewRejectCount", 0)

    # ── Bulk apply events ──
    for i, e in enumerate(events):
        if i not in pmap:
            continue
        phase = pmap[i]
        evt = e["event"]
        if evt == "tag_all_monosemantic":
            result["stage1"]["Monosemantic"][phase]["auto"] += e["details"]["count"]
        elif evt == "tag_all_by_boundary":
            d = e["details"]
            result["stage2"]["Well-Explained"][phase]["auto"] += d["wellExplainedCount"]
            result["stage2"]["Need Revision"][phase]["auto"] += d["needRevisionCount"]
        elif evt == "tag_remaining_by_boundary":
            d = e["details"]
            for bulk_key, cat in BULK_S3_MAP.items():
                result["stage3"][cat][phase]["auto"] += d.get(bulk_key, 0)

    return result


def format_table1(name, data):
    lines = []

    for sk in ["stage1", "stage2", "stage3"]:
        meta = STAGE_META[sk]
        cats = meta["categories"]
        lines.append(f"  {meta['label']} (unit: {meta['unit']})")
        lines.append("")

        # Header
        hdr = f"  {'Category':<24}"
        for p in PHASES:
            hdr += f" {'Manual':>8} {'Auto':>8}"
        hdr += f" {'Manual':>8} {'Auto':>8}"
        lines.append(hdr)

        sub = f"  {'':24}"
        for p in PHASES:
            lbl = p.capitalize()
            sub += f" {lbl:>8} {'':>8}"
        sub += f" {'Total':>8} {'':>8}"
        lines.append(sub)
        lines.append("  " + "-" * (len(hdr) - 2))

        total_m = {p: 0 for p in PHASES}
        total_a = {p: 0 for p in PHASES}
        grand_m, grand_a = 0, 0

        for cat in cats:
            row = f"  {cat:<24}"
            cm, ca = 0, 0
            for p in PHASES:
                m = data[sk][cat][p]["manual"]
                a = data[sk][cat][p]["auto"]
                row += f" {m:>8,} {a:>8,}"
                total_m[p] += m
                total_a[p] += a
                cm += m
                ca += a
            row += f" {cm:>8,} {ca:>8,}"
            grand_m += cm
            grand_a += ca
            lines.append(row)

        lines.append("  " + "-" * (len(hdr) - 2))
        row = f"  {'TOTAL':<24}"
        for p in PHASES:
            row += f" {total_m[p]:>8,} {total_a[p]:>8,}"
        row += f" {grand_m:>8,} {grand_a:>8,}"
        lines.append(row)
        lines.append("")

    return "\n".join(lines)


# ── Table 2: Apply Threshold Iterations ──────────────────────────────────────
def compute_table2(name, events, bounds, pmap):
    """Returns: {stage_key: [{'iter': N, 'event': str, 'thresholds': (sel, rej),
                               'counts': {category: N}, 'is_bulk': bool}]}"""
    result = {sk: [] for sk in ["stage1", "stage2", "stage3"]}

    for i, e in enumerate(events):
        if i not in pmap:
            continue
        reverted = is_reverted(name, e)
        evt = e["event"]
        sk = e["stage"]
        meta = STAGE_META[sk]

        if evt == "apply_tags":
            d = e["details"]
            counts = {}
            if meta["select_cat"]:
                counts[meta["select_cat"]] = d.get("previewSelectCount", 0)
            if meta["reject_cat"]:
                counts[meta["reject_cat"]] = d.get("previewRejectCount", 0)
            result[sk].append({
                "event": "apply_tags",
                "thresholds": (d.get("selectThreshold"), d.get("rejectThreshold")),
                "counts": counts,
                "is_bulk": False,
                "reverted": reverted,
            })
        elif evt == "tag_all_monosemantic":
            d = e["details"]
            result[sk].append({
                "event": "tag_all_monosemantic",
                "thresholds": None,
                "counts": {"Monosemantic": d["count"]},
                "is_bulk": True,
                "reverted": False,
            })
        elif evt == "tag_all_by_boundary":
            d = e["details"]
            result[sk].append({
                "event": "tag_all_by_boundary",
                "thresholds": None,
                "counts": {
                    "Well-Explained": d["wellExplainedCount"],
                    "Need Revision": d["needRevisionCount"],
                },
                "is_bulk": True,
                "reverted": False,
            })
        elif evt == "tag_remaining_by_boundary":
            d = e["details"]
            counts = {}
            for bulk_key, cat in BULK_S3_MAP.items():
                counts[cat] = d.get(bulk_key, 0)
            result[sk].append({
                "event": "tag_remaining_by_boundary",
                "thresholds": None,
                "counts": counts,
                "is_bulk": True,
                "reverted": False,
            })

    # Add iteration numbers
    for sk in result:
        n = 0
        for entry in result[sk]:
            n += 1
            entry["iter"] = n

    return result


def format_table2(name, data):
    lines = []

    for sk in ["stage1", "stage2", "stage3"]:
        meta = STAGE_META[sk]
        cats = meta["categories"]
        iters = data[sk]
        if not iters:
            continue

        lines.append(f"  {meta['label']} (unit: {meta['unit']})")
        lines.append("")

        # Header
        cat_hdrs = "".join(f" {c[:16]:>16}" for c in cats)
        hdr = f"  {'Iter':>4}  {'Event':<28} {'Sel Thresh':>10} {'Rej Thresh':>10}{cat_hdrs}"
        lines.append(hdr)
        lines.append("  " + "-" * (len(hdr) - 2))

        totals = {c: 0 for c in cats}
        for entry in iters:
            reverted = entry.get("reverted", False)
            evt_label = entry["event"]
            if entry["is_bulk"]:
                evt_label = f"*{evt_label}"
            if reverted:
                evt_label = f"~{evt_label} (reverted)"
            t = entry["thresholds"]
            sel_s = f"{t[0]:+.4f}" if t else "—"
            rej_s = f"{t[1]:+.4f}" if t else "—"
            cat_vals = ""
            for c in cats:
                v = entry["counts"].get(c, 0)
                if not reverted:
                    totals[c] += v
                cat_vals += f" {v:>16,}"
            lines.append(f"  {entry['iter']:>4}  {evt_label:<28} {sel_s:>10} {rej_s:>10}{cat_vals}")

        lines.append("  " + "-" * (len(hdr) - 2))
        total_vals = "".join(f" {totals[c]:>16,}" for c in cats)
        lines.append(f"  {'Sum':>4}  {'(excl. reverted)':28} {'':>10} {'':>10}{total_vals}")
        lines.append("")

    return "\n".join(lines)


# ── Table 3: Threshold Drag Interactions ─────────────────────────────────────
def compute_table3(events, bounds, pmap):
    """Returns: {stage_key: {phase: {drags: N, manual_tags: N, items_observed: N}}}"""
    result = {}
    for sk in ["stage1", "stage2", "stage3"]:
        result[sk] = {p: {"drags": 0, "manual_tags": 0, "items_observed": 0} for p in PHASES}

    for i, e in enumerate(events):
        if i not in pmap:
            continue
        sk = e["stage"]
        phase = pmap[i]
        meta = STAGE_META[sk]
        evt = e["event"]

        if evt == meta["drag_event"]:
            result[sk][phase]["drags"] += 1
        elif evt == "manual_tag":
            d = e["details"]
            if d.get("tag") != d.get("previousTag", "Unsure"):
                result[sk][phase]["manual_tags"] += 1
        elif evt == meta["click_event"]:
            result[sk][phase]["items_observed"] += 1

    return result


def format_table3(name, data):
    lines = []

    for sk in ["stage1", "stage2", "stage3"]:
        meta = STAGE_META[sk]
        obs_label = "Pairs Viewed" if meta["unit"] == "pairs" else "Features Viewed"
        drag_label = meta["drag_event"]

        lines.append(f"  {meta['label']}")
        lines.append("")

        hdr = f"  {'Phase':<12} {drag_label + ' events':>22} {'Manual Tags':>14} {obs_label:>16}"
        lines.append(hdr)
        lines.append("  " + "-" * (len(hdr) - 2))

        td, tm, to = 0, 0, 0
        for p in PHASES:
            d = data[sk][p]
            lines.append(
                f"  {p.capitalize():<12} {d['drags']:>22,} {d['manual_tags']:>14,} {d['items_observed']:>16,}"
            )
            td += d["drags"]
            tm += d["manual_tags"]
            to += d["items_observed"]

        lines.append("  " + "-" * (len(hdr) - 2))
        lines.append(f"  {'Total':<12} {td:>22,} {tm:>14,} {to:>16,}")
        lines.append("")

    return "\n".join(lines)


# ── Table 4: Cross-Validation ────────────────────────────────────────────────
def cross_validate(events, jdata, bounds):
    """Compare action log counts with JSON export."""
    result = {}

    for sk in ["stage1", "stage2", "stage3"]:
        meta = STAGE_META[sk]
        jstage = jdata[meta["json_key"]]
        cv = {}

        if sk == "stage1":
            # Track final tag per pair -> extract unique feature IDs per category
            pair_tags = {}
            for e in events:
                if e["stage"] != "stage1" or e["event"] != "manual_tag":
                    continue
                if not in_window(e, bounds):
                    continue
                d = e["details"]
                tag, prev = d["tag"], d.get("previousTag", "Unsure")
                if tag == prev:
                    continue
                pair_tags[d["pairKey"]] = (tag, d["mainFeatureId"], d["similarFeatureId"])

            log_feats = defaultdict(set)
            for pk, (tag, m, s) in pair_tags.items():
                if tag != "Unsure":
                    log_feats[tag].add(m)
                    log_feats[tag].add(s)

            for jcat, display_cat in meta["json_cat_map"].items():
                jman = len(jstage[jcat].get("manual", []))
                jauto = len(jstage[jcat].get("auto", []))
                jthresh = len(jstage[jcat].get("thresholded", []))
                lman = len(log_feats.get(display_cat, set()))
                cv[display_cat] = {
                    "log_manual_feat": lman,
                    "json_manual": jman,
                    "json_auto": jauto,
                    "json_thresholded": jthresh,
                }
        else:
            feat_tags = {}
            for e in events:
                if e["stage"] != sk or e["event"] != "manual_tag":
                    continue
                if not in_window(e, bounds):
                    continue
                d = e["details"]
                tag, prev = d["tag"], d.get("previousTag", "Unsure")
                if tag == prev:
                    continue
                feat_tags[d["featureId"]] = tag

            log_feats = defaultdict(set)
            for fid, tag in feat_tags.items():
                if tag != "Unsure":
                    log_feats[tag].add(fid)

            for jcat, display_cat in meta["json_cat_map"].items():
                jman = len(jstage[jcat].get("manual", []))
                jauto = len(jstage[jcat].get("auto", []))
                jthresh = len(jstage[jcat].get("thresholded", []))
                lman = len(log_feats.get(display_cat, set()))
                cv[display_cat] = {
                    "log_manual_feat": lman,
                    "json_manual": jman,
                    "json_auto": jauto,
                    "json_thresholded": jthresh,
                }

        result[sk] = cv
    return result


def format_cross_validation(name, cv):
    lines = []

    for sk in ["stage1", "stage2", "stage3"]:
        meta = STAGE_META[sk]
        cats = meta["categories"]
        data = cv[sk]

        unit_note = " (features from pairs)" if sk == "stage1" else ""
        lines.append(f"  {meta['label']}{unit_note}")
        lines.append("")

        col_w = max(18, max(len(c) for c in cats) + 1)
        cat_hdrs = "".join(f" {c:>{col_w}}" for c in cats)
        hdr = f"  {'Source':<24}{cat_hdrs}"
        lines.append(hdr)
        lines.append("  " + "-" * (len(hdr) - 2))

        def _row(label, vals):
            r = f"  {label:<24}"
            for v in vals:
                r += f" {v:>{col_w}}"
            return r

        # Log manual
        lines.append(_row("Action Log manual", [f"{data[c]['log_manual_feat']:,}" for c in cats]))
        # JSON manual
        lines.append(_row("JSON manual", [f"{data[c]['json_manual']:,}" for c in cats]))
        # Match?
        matches = []
        for c in cats:
            lm = data[c]["log_manual_feat"]
            jm = data[c]["json_manual"]
            matches.append("OK" if lm == jm else "DIFF %+d" % (lm - jm))
        lines.append(_row("Match?", matches))

        lines.append("")

        # JSON auto + thresholded
        lines.append(_row("JSON auto", [f"{data[c]['json_auto']:,}" for c in cats]))
        lines.append(_row("JSON thresholded", [f"{data[c]['json_thresholded']:,}" for c in cats]))
        lines.append(_row("JSON auto+thresh", [f"{data[c]['json_auto'] + data[c]['json_thresholded']:,}" for c in cats]))

        lines.append("")

    return "\n".join(lines)


# ── Output Formatting ────────────────────────────────────────────────────────
def section(title):
    return f"\n{'=' * W}\n  {title}\n{'=' * W}\n"


def out(f, s=""):
    print(s)
    f.write(s + "\n")


def main():
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        out(f, "=" * W)
        out(f, "  LABELING ANALYSIS REPORT")
        out(f, f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        out(f, f"  Participants: {', '.join(PARTICIPANTS)}")
        out(f, "=" * W)

        for name in PARTICIPANTS:
            events = load_action_log(name)
            jdata = load_json_export(name)
            bounds = determine_stage_bounds(events)
            pmap = build_phase_map(events, bounds)

            # ── Table 1 ──
            t1 = compute_table1(name, events, bounds, pmap)
            out(f, section(f"{name} — TABLE 1: TAGS PER STAGE PER MODE"))
            out(f, format_table1(name, t1))

            # ── Table 2 ──
            t2 = compute_table2(name, events, bounds, pmap)
            out(f, section(f"{name} — TABLE 2: APPLY THRESHOLD ITERATIONS"))
            out(f, format_table2(name, t2))

            # ── Table 3 ──
            t3 = compute_table3(events, bounds, pmap)
            out(f, section(f"{name} — TABLE 3: THRESHOLD DRAG & OBSERVED ITEMS"))
            out(f, format_table3(name, t3))

            # ── Table 4 ──
            cv = cross_validate(events, jdata, bounds)
            out(f, section(f"{name} — TABLE 4: CROSS-VALIDATION (Action Log vs JSON Export)"))
            out(f, format_cross_validation(name, cv))

        out(f)
        out(f, "=" * W)
        out(f, f"  Results saved to: {OUTPUT_FILE}")
        out(f, "=" * W)


if __name__ == "__main__":
    main()
