from dataclasses import dataclass


@dataclass
class Horse:
    ketto_num: str
    name: str
    birth_year: int
    prize: float
