"""Reproduce the two failure-probability estimates in Qianjun Zhuo's pendulum case study.

Run with Python 3. No third-party libraries are required. The model is an upright
uniform rod with noisy observations and a torque-limited PD controller.
"""

import argparse
import json
import math
import random
import statistics

DT = 0.01
STEPS = 500
LIMIT = 0.20
TRIALS = 1000
SEED = 2026


def angles(amplitude, sensor):
    """Yield the simulated true angle at the initial state and after each step."""
    angle, velocity = 0.05, 0.0
    yield angle
    for step in range(STEPS):
        observed_angle = angle + sensor.gauss(0.0, 0.01)
        observed_velocity = velocity + sensor.gauss(0.0, 0.02)
        command = -10.0 * observed_angle - 2.0 * observed_velocity
        torque = max(-2.0, min(2.0, command))
        base_acceleration = amplitude if 1.0 <= step * DT < 1.5 else 0.0

        # The rod has unit mass and length, with its pivot at one end.
        acceleration = (
            9.81 * 0.5 * math.sin(angle)
            + 0.5 * base_acceleration * math.cos(angle)
            - 0.1 * velocity
            + torque
        ) / (1.0 / 3.0)
        angle += velocity * DT
        velocity += acceleration * DT
        yield angle


def nominal(rng):
    return rng.uniform(-4.0, 4.0), 1.0


def importance(rng):
    draw = rng.random()
    if draw < 0.4:
        return rng.uniform(-4.0, -2.0), 0.625
    if draw < 0.6:
        return rng.uniform(-2.0, 2.0), 2.5
    return rng.uniform(2.0, 4.0), 0.625


def estimate(sample):
    rng = random.Random(SEED)
    contributions = []
    for _ in range(TRIALS):
        amplitude, weight = sample(rng)
        sensor = random.Random(rng.randrange(10_000_000_000))
        peak = max(abs(angle) for angle in angles(amplitude, sensor))
        failed = peak >= LIMIT
        contributions.append(weight if failed else 0.0)
    probability = statistics.mean(contributions)
    standard_error = statistics.stdev(contributions) / math.sqrt(TRIALS)
    return probability, standard_error


def reference_trace():
    sensor = random.Random(42)
    # Match the initial sensor read and baseline rollout before the disturbed run.
    sensor.gauss(0.0, 0.01)
    sensor.gauss(0.0, 0.02)
    list(angles(0.0, sensor))
    return {"dt": DT, "angles": list(angles(3.0, sensor))}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--trace", action="store_true", help="write the interactive example as JSON")
    if parser.parse_args().trace:
        print(json.dumps(reference_trace()))
    else:
        for label, sampler in [("Monte Carlo", nominal), ("Importance sampling", importance)]:
            probability, standard_error = estimate(sampler)
            print(f"{label:<20} p = {probability:.6f}  SE = {standard_error:.6f}")
