import math
from statistics import mean, pstdev, median


def calculate_mean(scores):
    values = [float(score) for score in scores if score is not None]
    return mean(values) if values else None


def calculate_standard_deviation(scores):
    values = [float(score) for score in scores if score is not None]
    return pstdev(values) if len(values) > 1 else 0.0


def calculate_z_score(student_score, class_mean, standard_deviation):
    if student_score is None or class_mean is None:
        return None
    if not standard_deviation:
        return 0.0 if float(student_score) == float(class_mean) else (math.inf if student_score > class_mean else -math.inf)
    return (float(student_score) - float(class_mean)) / standard_deviation


def get_grade_trajectory(z_score):
    if z_score is None:
        return 'Insufficient Data'
    if z_score >= 1.5:
        return 'S Grade Trajectory'
    if z_score >= 1.0:
        return 'A Grade Trajectory'
    if z_score >= 0:
        return 'On Track'
    return 'Needs Focus'


def calculate_target_score(class_mean, standard_deviation, trajectory):
    thresholds = {'S': 1.5, 'A': 1.0, 'B': 0.0, 'C': -0.5}
    if trajectory not in thresholds or class_mean is None:
        return None
    return float(class_mean) + thresholds[trajectory] * float(standard_deviation or 0)


def calculate_required_fat_score(current_weighted, target_total, fat_weight=0.5, max_score=100):
    if fat_weight <= 0:
        return {'score': None, 'status': 'Insufficient Data'}
    needed = (target_total - current_weighted) / fat_weight
    if needed <= 0:
        return {'score': 0.0, 'status': 'Already above this trajectory threshold'}
    if needed > max_score:
        return {'score': max_score, 'status': 'Target currently outside attainable range'}
    return {'score': needed, 'status': 'Attainable'}


def calculate_cumulative_z_score(scores):
    values = [x for x in scores if x is not None]
    return calculate_mean(values)


def detect_outlier(score, peer_scores):
    peers = [float(x) for x in peer_scores if x is not None]
    if len(peers) < 2:
        return False
    spread = calculate_standard_deviation(peers)
    return abs(float(score) - median(peers)) > 2 * spread if spread else float(score) != median(peers)
