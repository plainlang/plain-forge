from dataclasses import dataclass, field
from datetime import date
from typing import Optional, List

@dataclass
class Task:
    name: str
    notes: str = ""
    due_date: Optional[date] = None
    completed: bool = False

    def __post_init__(self):
        if len(self.name) < 3:
            raise ValueError("Task name must be at least 3 characters long.")

class TaskList:
    def __init__(self):
        self._tasks: List[Task] = []

    def add_task(self, task: Task):
        self._tasks.append(task)

    def get_tasks(self) -> List[Task]:
        return list(self._tasks)

    def remove_task(self, task: Task):
        self._tasks.remove(task)
