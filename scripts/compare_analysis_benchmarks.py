"""Compare isolated end-to-end samples without mixing AI and simulated results.

Usage: python scripts/compare_analysis_benchmarks.py baseline.json optimized.json output.json
Only reads supplied evidence files; never connects to a database or model.
"""
import json
import math
from pathlib import Path
import statistics
import sys
from datetime import datetime


def stats(samples):
    values = sorted(row["elapsedMs"] for row in samples)
    if not values:
        return {"count": 0, "meanMs": None, "medianMs": None, "p95Ms": None}
    return {"count": len(values), "meanMs": statistics.mean(values),
            "medianMs": statistics.median(values),
            "p95Ms": values[math.ceil(len(values) * .95) - 1]}


def stages(samples):
    """Wall-time event pairs use the same observable boundary on the uninstrumented baseline."""
    values = {}
    for sample in samples:
        starts = {}
        registered = None
        queue_recorded = False
        for event in sample["events"]:
            stage, state = event["stage"], event["state"]
            instant = datetime.fromisoformat(event["created_at"])
            if stage == "INCIDENT" and state == "COMPLETED":
                registered = instant
            if stage == "JEV" and state == "RUNNING" and registered and not queue_recorded:
                values.setdefault("QUEUE", []).append((instant - registered).total_seconds() * 1000)
                queue_recorded = True
            if state == "RUNNING":
                starts[stage] = instant
            elif state == "COMPLETED" and stage in starts:
                values.setdefault(stage, []).append((instant - starts.pop(stage)).total_seconds() * 1000)
    return {stage: statistics.mean(elapsed) for stage, elapsed in sorted(values.items())}


def compare(before, after):
    assert before["observations"] == after["observations"], "Scenario mismatch"
    assert before["measurement"] == after["measurement"], "Measurement boundary mismatch"
    assert before["environment"] == after["environment"] == "ISOLATED_H2_LOOPBACK_ONLY"
    rows = []
    for category in ("DEMO_MOCK", "MOCK_FALLBACK", "REAL_AI"):
        old = [r for r in before["samples"] if r["category"] == category]
        new = [r for r in after["samples"] if r["category"] == category]
        if old or new:
            assert len(old) >= 10 and len(new) >= 10, "At least 10 samples per variant required"
        # These loopback-only runs must never be advertised as real model benchmarks.
        assert category != "REAL_AI" or not (old or new)
        b, a = stats(old), stats(new)
        rows.append({"category": category, "before": b, "after": a,
                     "meanReductionPercent": None if not old else 100 * (1 - a["meanMs"] / b["meanMs"]),
                     "stageMeanMsBefore": stages(old), "stageMeanMsAfter": stages(new),
                     "accuracyMeasured": False})
    return {"fictional": True, "environment": before["environment"],
            "measurement": before["measurement"], "p95Method": "nearest-rank (12 samples: maximum)",
            "realAiMeasured": False, "rows": rows,
            "limitations": ["SQL ontology fallback, not Neo4j", "H2, not PostgreSQL",
                            "Loopback connection refusal does not represent remote timeout latency",
                            "No actual AI accuracy or inference speed claim", "Nested stage times overlap"]}


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    before, after = [json.loads(Path(p).read_text(encoding="utf-8-sig")) for p in sys.argv[1:3]]
    result = compare(before, after)
    Path(sys.argv[3]).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["rows"], ensure_ascii=False, indent=2))
