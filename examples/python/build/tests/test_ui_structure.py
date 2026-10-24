import unittest
from domain import Task, TaskList
from datetime import date

class TestUIComponentsLogic(unittest.TestCase):
    """Tests the logic behind UI components for task listing."""

    def test_task_list_retrieval(self):
        tl = TaskList()
        t1 = Task("Task 1")
        t2 = Task("Task 2")
        tl.add_task(t1)
        tl.add_task(t2)
        
        tasks = tl.get_tasks()
        self.assertEqual(len(tasks), 2)
        self.assertEqual(tasks[0].name, "Task 1")
        self.assertEqual(tasks[1].name, "Task 2")

    def test_task_due_date_formatting_logic(self):
        # Simulation of the formatting used in TaskItem
        d = date(2026, 10, 9)
        formatted = d.strftime("%-d. %b")
        # Depending on locale, %b might vary, but logic check
        self.assertTrue("9." in formatted)
        self.assertTrue("Oct" in formatted)

    def test_adding_task_via_list_logic(self):
        tl = TaskList()
        initial_count = len(tl.get_tasks())
        new_task = Task("New UI Task", "From Modal Simulation")
        tl.add_task(new_task)
        self.assertEqual(len(tl.get_tasks()), initial_count + 1)
        self.assertEqual(tl.get_tasks()[-1].name, "New UI Task")

    def test_editing_task_logic(self):
        task = Task("Old Name", "Old Notes")
        # Simulate editing via modal logic
        task.name = "New Name"
        task.notes = "New Notes"
        task.due_date = date(2026, 12, 25)
        
        self.assertEqual(task.name, "New Name")
        self.assertEqual(task.notes, "New Notes")
        self.assertEqual(task.due_date, date(2026, 12, 25))

if __name__ == '__main__':
    unittest.main()