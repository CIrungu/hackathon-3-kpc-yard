"""
KPC Yard Traffic Simulator (Domain 1 / Problem 2)
=================================================
Generates a realistic synthetic stream of tanker arrivals and gantry cycle
times for the Autonomous Yard Control Plane.

- Truck inter-arrival times follow a Poisson process (peak/off-peak rates).
- Capacity follows a log-normal spread around product modal loads.
- Gantry cycle time = capacity / pump-rate (l/min) plus noise from pump
  degradation & pre-load jockeying.

Usage:
    python3 data_simulator.py --trucks 200 --output yard_trucks.csv
    python3 data_simulator.py --cycles 8          # 8 operating cycles of ~600 trucks
"""

from __future__ import annotations

import argparse
import csv
import random
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

PRODUCTS = {
    "DIESEL": {"modal_capacity": 45_000, "pump_rate": 1200},
    "PETROL": {"modal_capacity": 38_000, "pump_rate": 1100},
    "KEROSENE": {"modal_capacity": 30_000, "pump_rate": 950},
    "JET_A1": {"modal_capacity": 50_000, "pump_rate": 1300},
    "ADBLUE": {"modal_capacity": 20_000, "pump_rate": 600},
}

BAYS = {
    "G1": ("DIESEL", 1200),
    "G2": ("DIESEL", 1150),
    "G3": ("PETROL", 1100),
    "G4": ("PETROL", 1050),
    "G5": ("KEROSENE", 950),
    "G6": ("JET_A1", 1300),
    "G7": ("ADBLUE", 600),
    "G8": ("FLEXIBLE", 1000),
}


@dataclass
class GantryCycle:
    """One simulated loading event at a gantry bay."""

    truck_id: int
    reg_no: str
    product: str
    capacity_liters: int
    pump_rate_lpm: int
    load_minutes: float  # theoretical = capacity / rate
    actual_minutes: float  # includes degradation & turnaround noise
    queue_depth_at_start: int
    arrived_min: float  # minutes into the operating day
    bay_id: str
    anomaly: str = ""  # empty | 'pump_slow' | 'load_hang' | 'queue_overflow'


def poisson_arrivals(num_trucks: int, peak_rate: float = 2.2, offpeak_rate: float = 0.7,
                     peak_bins=((8, 12), (16, 20)), seed: int = 42) -> list[float]:
    """Return ordered arrival times (minutes into a 24h day) via time-varying Poisson."""
    rng = random.Random(seed)

    def is_peak(h: float) -> bool:
        return any(start <= h < end for start, end in peak_bins)

    arrivals: list[float] = []
    t = 0.0
    for _ in range(num_trucks):
        hour = (t % 1440) / 60.0
        rate = peak_rate if is_peak(hour) else offpeak_rate
        dt = rng.expovariate(rate)  # minutes between arrivals
        t += dt
        arrivals.append(t)
    arrivals.sort()
    return arrivals[:num_trucks]


def sample_truck(truck_id: int, rng: random.Random) -> dict:
    product = rng.choices(list(PRODUCTS.keys()), weights=[0.4, 0.3, 0.1, 0.1, 0.1])[0]
    cfg = PRODUCTS[product]
    cap = int(abs(rng.gauss(cfg["modal_capacity"], cfg["modal_capacity"] * 0.08)))
    cap = max(10_000, min(60_000, cap))
    reg_no = f"KCX {truck_id:04d}A"
    return {"truck_id": truck_id, "reg_no": reg_no, "product": product, "capacity_liters": cap}


def _beta_turnover(rng: random.Random) -> float:
    return max(6.0, rng.gauss(35.0, 6.0))


def generate_cycles(trucks: list[dict], seed: int = 7) -> list[GantryCycle]:
    rng = random.Random(seed)
    bay_queues: dict[str, list[dict]] = {b: [] for b in BAYS}
    bay_busy_until: dict[str, float] = {b: 0.0 for b in BAYS}

    cycles: list[GantryCycle] = []
    for truck in trucks:
        # Choose the "best" bay for the product (mimics the AI matcher).
        candidates = [(b, rate) for b, (p, rate) in BAYS.items() if p == truck["product"]]
        if not candidates:
            candidates = [(b, rate) for b, (p, rate) in BAYS.items() if p == "FLEXIBLE"]
        bay_id, pump_rate = min(candidates, key=lambda c: len(bay_queues[c[0]]))

        # Occasionally degrade a bay (10% of products on a slow pump).
        anomaly = ""
        if rng.random() < 0.08:
            anomaly = "pump_slow"
            pump_rate = int(pump_rate * 0.45)

        theoretical = truck["capacity_liters"] / pump_rate
        actual = theoretical + _beta_turnover(rng)

        # A truck cannot start before its bay frees up — that is the queueing
        # dynamics we want the ML model to learn.
        queue_depth = len(bay_queues[bay_id])
        start = max(rng.gauss(0, 0), bay_busy_until[bay_id] - 0)
        wait_minutes = max(0.0, bay_busy_until[bay_id])

        if queue_depth >= 6:
            anomaly = "queue_overflow"
        if actual > 120:
            anomaly = "load_hang"

        cycles.append(
            GantryCycle(
                truck_id=truck["truck_id"],
                reg_no=truck["reg_no"],
                product=truck["product"],
                capacity_liters=truck["capacity_liters"],
                pump_rate_lpm=pump_rate,
                load_minutes=round(theoretical, 1),
                actual_minutes=round(actual, 1),
                queue_depth_at_start=queue_depth,
                arrived_min=round(start, 1),
                bay_id=bay_id,
                anomaly=anomaly,
            )
        )
        bay_queues[bay_id].append(truck)
        bay_busy_until[bay_id] = start + actual
    return cycles


def to_csv(cycles: list[GantryCycle], path: str) -> None:
    with open(path, "w", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=["truck_id", "reg_no", "product", "capacity_liters", "pump_rate_lpm",
                        "load_minutes", "actual_minutes", "queue_depth_at_start",
                        "arrived_min", "bay_id", "anomaly"],
        )
        writer.writeheader()
        for c in cycles:
            writer.writerow(c.__dict__)


def to_json(cycles: list[GantryCycle], path: str) -> None:
    import json

    with open(path, "w") as fh:
        json.dump([c.__dict__ for c in cycles], fh, indent=2)


def summary(cycles: list[GantryCycle]) -> dict:
    actual = [c.actual_minutes for c in cycles]
    theoretical = [c.load_minutes for c in cycles]
    anomalies = {}
    for c in cycles:
        anomalies[c.anomaly] = anomalies.get(c.anomaly, 0) + 1
    return {
        "trucks": len(cycles),
        "avg_actual_cycle_min": round(sum(actual) / len(actual), 1),
        "avg_theoretical_min": round(sum(theoretical) / len(theoretical), 1),
        "avg_queue_depth": round(sum(c.queue_depth_at_start for c in cycles) / len(cycles), 2),
        "avg_wait_min": round(sum(c.arrived_min for c in cycles) / len(cycles), 1),
        "total_liters": sum(c.capacity_liters for c in cycles),
        "anomaly_breakdown": anomalies,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="KPC yard tanker arrival & gantry cycle simulator")
    parser.add_argument("--trucks", type=int, default=200, help="number of tanker arrivals to simulate")
    parser.add_argument("--cycles", type=int, default=0,
                        help="number of operating cycles of --trucks trucks each (supersedes --trucks)")
    parser.add_argument("--output", default="yard_simulation.csv", help="output CSV path")
    parser.add_argument("--json", action="store_true", help="also emit a JSON copy")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    total_trucks = args.trucks * args.cycles if args.cycles else args.trucks
    arrivals = poisson_arrivals(total_trucks, seed=args.seed)
    trucks = [sample_truck(i + 1, random.Random(args.seed + i)) for i in range(total_trucks)]
    # Overlay arrival-minute offsets onto trucks in order.
    for tr, minute in zip(trucks, arrivals):
        tr["_arrival"] = minute

    cycles = generate_cycles(trucks, seed=args.seed)

    # Re-anchor cycles to simulated day timeline for realism.
    day0 = datetime(2026, 9, 12, tzinfo=timezone.utc)
    for i, c in enumerate(cycles):
        c.arrived_min = round(cycles[i].arrived_min, 1)

    to_csv(cycles, args.output)
    if args.json:
        to_json(cycles, args.output.replace(".csv", ".json"))

    stats = summary(cycles)
    print(f"[simulator] wrote {args.output} with {stats['trucks']} tanker load cycles")
    print(f"[simulator] avg cycle {stats['avg_actual_cycle_min']}min (theoretical {stats['avg_theoretical_min']}min)")
    print(f"[simulator] avg wait {stats['avg_wait_min']}min · queue depth {stats['avg_queue_depth']}")
    print(f"[simulator] total volume {stats['total_liters']:,} L")
    print(f"[simulator] anomalies: {stats['anomaly_breakdown']}")

    # Also dump a bay-load manifest for the backend demo.
    if args.cycles:
        csv_path = args.output.replace(".csv", "_manifest.csv")
        with open(csv_path, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["truck_id", "reg_no", "product", "capacity_liters", "bay_id"])
            w.writeheader()
            for c in cycles:
                w.writerow({"truck_id": c.truck_id, "reg_no": c.reg_no, "product": c.product,
                            "capacity_liters": c.capacity_liters, "bay_id": c.bay_id})
        print(f"[simulator] wrote bay manifest {csv_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())