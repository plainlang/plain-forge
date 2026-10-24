import unittest
from domain import Task, TaskList

class TestDomain(unittest.TestCase):
    def test_task_creation_valid(self):
        task = Task(name="Do laundry")
        self.assertEqual(task.name, "Do laundry")
        self.assertFalse(task.completed)

    def test_task_creation_invalid_name(self):
        with self.assertRaisesRegex(ValueError, "at least 3 characters"):
            Task(name="Ab")

    def test_task_list_initial_empty(self):
        tl = TaskList()
        self.assertEqual(len(tl.get_tasks()), 0)

    def test_task_list_add_task(self):
        tl = TaskList()
        task = Task(name="Test Task")
        tl.add_task(task)
        self.assertIn(task, tl.get_tasks())

    def test_task_completion_toggle(self):
        task = Task(name="Test Completion")
        self.assertFalse(task.completed)
        task.completed = True
        self.assertTrue(task.completed)
        task.completed = False
        self.assertFalse(task.completed)

if __name__ == '__main__':
    unittest.main()