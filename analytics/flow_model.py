"""
Gantry Queue-Delay Prediction Model for the KPC Yard Control Plane
==================================================================
Trains a gradient-boosted regressor on simulated / historical gantry cycle
records to predict *current bay queue wait time* (minutes) — the signal the
auto-reroute engine uses to pre-empt bottlenecks.

Features derived per bay at time-of-query:
    queue_depth, arriving_vehicles_per_hr, avg_capacity_liters,
    pump_rate_lpm, theoretical_remaining_min, is_peak_hour, bay_product_index

Target: wait_minutes (minutes a tanker sits in queue before gantry hook-up).

Usage:
    python3 data_simulator.py --trucks 1200 --output yard_simulation.csv
    python3 flow_model.py --data yard_simulation.csv --predict
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys

try:
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import mean_absolute_error, r2_score

    SKLEARN_OK = True
except ImportError:  # pragma: no cover
    SKLEARN_OK = False


PRODUCTS = {"DIESEL": 0, "PETROL": 1, "KEROSENE": 2, "JET_A1": 3, "ADBLUE": 4, "FLEXIBLE": 5, "UNKNOWN": 6}


def load_data(path: str) -> list[dict]:
    rows = []
    with open(path, newline="") as fh:
        for row in csv.DictReader(fh):
            rows.append(row)
    return rows


def featurize(rows: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """Build the feature matrix + wait-time target from bay snapshots."""
    features, targets = [], []
    # Per-bay rolling aggregates computed over the day.
    bay_seq: dict[str, int] = {}
    for r in rows:
        bay = r["bay_id"]
        seq = bay_seq.get(bay, 0)
        pump_rate = max(1, float(r["pump_rate_lpm"]))
        capacity = float(r["capacity_liters"])
        product_idx = PRODUCTS.get(r["product"], PRODUCTS["UNKNOWN"])

        # rolling arrival pressure at this bay over the trailing window
        arrivals_per_hr = seq / max(0.1, (float(r["arrived_min"]) / 60.0))

        remaining = max(0.0, (float(r["arrived_min"]) * 0) + float(r["load_minutes"]))  # teoretical load
        hour_of_day = (float(r["arrived_min"]) % 1440) / 60.0
        is_peak = 1.0 if (8 <= hour_of_day < 12 or 16 <= hour_of_day < 20) else 0.0
        queue_depth = float(r["queue_depth_at_start"])
        anomaly = 1.0 if r.get("anomaly") else 0.0

        features.append([
            queue_depth,
            arrivals_per_hr,
            capacity,
            pump_rate,
            remaining,
            is_peak,
            product_idx,
            anomaly,
        ])
        # wait time = arrived_min (queue start) since bay free time:
        targets.append(float(r["arrived_min"]))
        bay_seq[bay] = seq + 1
    return np.asarray(features, dtype=float), np.asarray(targets, dtype=float)


FEATURE_NAMES = [
    "queue_depth",
    "arrivals_per_hr",
    "capacity_liters",
    "pump_rate_lpm",
    "theoretical_load_min",
    "is_peak_hour",
    "product_idx",
    "anomaly_flag",
]


class QueueDelayModel:
    def __init__(self) -> None:
        self.model = None

    def train(self, X: np.ndarray, y: np.ndarray) -> dict:
        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=7)
        self.model = GradientBoostingRegressor(
            n_estimators=180,
            max_depth=3,
            learning_rate=0.08,
            subsample=0.9,
            random_state=7,
        )
        self.model.fit(X_tr, y_tr)
        preds = self.model.predict(X_te)
        return {
            "mae_minutes": round(mean_absolute_error(y_te, preds), 2),
            "r2": round(float(r2_score(y_te, preds)), 3),
            "samples": int(len(y)),
        }

    def predict(self, features: list[float] | np.ndarray) -> float:
        if self.model is None:
            raise RuntimeError("model not trained")
        return float(self.model.predict(np.asarray([features], dtype=float))[0])

    def predict_bay(self, *, queue_depth, arrivals_per_hr, capacity_liters, pump_rate_lpm,
                    theoretical_load_min, hour_of_day, product, anomaly=False) -> float:
        is_peak = 1.0 if (8 <= hour_of_day < 12 or 16 <= hour_of_day < 20) else 0.0
        features = [
            queue_depth,
            arrivals_per_hr,
            capacity_liters,
            pump_rate_lpm,
            theoretical_load_min,
            is_peak,
            PRODUCTS.get(product, PRODUCTS["UNKNOWN"]),
            1.0 if anomaly else 0.0,
        ]
        return self.predict(features)


def heuristic_bay_wait(queue_depth: int, pump_rate: int, avg_capacity: int = 40_000,
                       arrivals_per_hr: float = 1.5) -> float:
    """Lightweight fallback used when sklearn is unavailable."""
    per_vehicle = avg_capacity / max(1, pump_rate) * 60  # seconds→min ≈ capacity/rate
    return queue_depth * per_vehicle + arrivals_per_hr * 4.2


def main() -> int:
    parser = argparse.ArgumentParser(description="KPC gantry queue-delay forecast model")
    parser.add_argument("--data", default="yard_simulation.csv")
    parser.add_argument("--predict", action="store_true", help="show sample live predictions")
    parser.add_argument("--json", action="store_true", help="emit metrics as JSON")
    args = parser.parse_args()

    rows = load_data(args.data)
    if not rows:
        print(f"no data in {args.data} — run data_simulator.py first")
        return 1

    print(f"[flow_model] loaded {len(rows)} gantry cycles from {args.data}")

    if not SKLEARN_OK:
        print("[flow_model] scikit-learn unavailable — using heuristic forecaster")
        print(f"[flow_model] bay G1 wait estimate: {heuristic_bay_wait(4, 1200):.1f} min")
        print("[flow_model] install: pip install -r requirements.txt")
        return 0

    X, y = featurize(rows)
    model = QueueDelayModel()
    metrics = model.train(X, y)
    metrics["model"] = "gradient-boosted-regressor"
    metrics["features"] = FEATURE_NAMES

    print(f"[flow_model] MAE {metrics['mae_minutes']} min · R² {metrics['r2']} on {metrics['samples']} bay snapshots")

    if args.predict:
        probes = [
            dict(queue_depth=2, arrivals_per_hr=1.2, capacity_liters=45_000, pump_rate_lpm=1200,
                 theoretical_load_min=37.5, hour_of_day=10, product="DIESEL"),
            dict(queue_depth=6, arrivals_per_hr=2.0, capacity_liters=38_000, pump_rate_lpm=1100,
                 theoretical_load_min=34.5, hour_of_day=9, product="PETROL"),
            dict(queue_depth=4, arrivals_per_hr=1.0, capacity_liters=50_000, pump_rate_lpm=1300,
                 theoretical_load_min=38.5, hour_of_day=22, product="JET_A1"),
        ]
        for p in probes:
            wait = model.predict_bay(**p)
            print(f"[flow_model] G{probes.index(p) + 1} forecast wait ≈ {wait:.1f} min "
                  f"(queue={p['queue_depth']}, product={p['product']})")

    if args.json:
        print(json.dumps(metrics))
    return 0


if __name__ == "__main__":
    sys.exit(main())