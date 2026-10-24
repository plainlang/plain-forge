from typing import Optional
from textual.app import App, ComposeResult
from textual.widgets import Footer, Static, Button
from textual.containers import Vertical
from domain import Task, TaskList
from rich.text import Text
from widgets import TaskItem, ConfirmationModal, NewTaskModal, TaskListHeader

class TaskListApp(App):
    TITLE = "Task List App"
    CSS = """
    /* Modal Styles */
    NewTaskModal {
        align: center middle;
    }

    #modal-container {
        width: 60;
        height: auto;
        border: solid $primary;
        background: $surface;
        padding: 1 2;
    }

    #modal-title {
        text-style: bold;
        text-align: center;
        width: 100%;
        margin-bottom: 1;
    }

    .field-label {
        text-style: bold;
        margin-top: 1;
    }

    #modal-error {
        color: $error;
        text-style: bold;
        margin-top: 1;
        text-align: center;
        height: auto;
    }

    #modal-actions {
        margin-top: 1;
        height: 3;
        content-align: right middle;
    }

    #modal-actions Button {
        margin-left: 1;
    }

    #confirm-modal-container {
        width: 40;
        height: auto;
        border: solid $error;
        background: $surface;
        padding: 1 2;
        align: center middle;
    }

    #confirm-message {
        margin-bottom: 1;
        text-align: center;
        width: 100%;
    }

    #app-header-title {
        text-style: bold;
        background: $primary;
        color: $text;
        width: 100%;
        padding: 0 1;
        text-align: left;
        height: 1;
    }

    #main-content {
        padding: 0 1;
        height: auto;
    }

    #main-header {
        height: auto;
        width: 100%;
        margin-bottom: 1;
        align: right top;
    }

    .main-title {
        text-style: bold;
        margin: 0;
        width: 100%;
    }

    .subtitle {
        color: $text-muted;
        margin: 0;
        width: 100%;
    }

    #add-task-button {
        width: auto;
        text-style: reverse bold;
        height: 1;
        border: none;
        content-align: center middle;
    }

    TaskItem {
        border: solid $primary-lighten-2;
        margin-bottom: 1;
        padding: 1;
        height: auto;
    }

    .task-item-header {
        height: 1;
    }

    .task-checkbox {
        width: auto;
    }

    .task-title {
        text-style: bold;
        width: 1fr;
        margin-left: 1;
        text-align: left;
    }

    TaskItem.completed .task-title {
        color: $text-muted;
        text-style: dim;
    }

    TaskItem.completed .task-description {
        color: $text-muted;
    }

    .task-description {
        color: $text;
        margin-left: 5;
    }

    .task-date {
        color: $text-muted;
        text-align: right;
        width: 100%;
    }

    .edit-icon, .delete-icon {
        width: auto;
        color: $accent;
        margin-left: 1;
    }

    TaskItem Button {
        min-width: 0;
        width: auto;
        height: 1;
        border: none;
        background: transparent;
        padding: 0;
        margin: 0;
    }

    TaskItem Button:focus {
        background: $accent;
        color: $text;
    }
    """

    def __init__(self):
        super().__init__()
        self.task_list = TaskList()

    def compose(self) -> ComposeResult:
        yield TaskListHeader(id="app-header-title")
        with Vertical(id="main-content"):
            with Vertical(id="main-header"):
                yield Button(Text("[ Add New Task ]"), id="add-task-button")
                yield Static("Task List", classes="main-title")
                yield Static("All of your tasks in one place.", classes="subtitle")
            
            yield Vertical(id="task-list-container")
        yield Footer()

    def on_mount(self) -> None:
        self._refresh_list()

    def _refresh_list(self) -> None:
        container = self.query_one("#task-list-container")
        container.remove_children()
        for task in self.task_list.get_tasks():
            container.mount(TaskItem(task_data=task))

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "add-task-button":
            self.push_screen(NewTaskModal(), self._handle_add_task)

    def _handle_add_task(self, task: Optional[Task]) -> None:
        if task:
            self.task_list.add_task(task)
            self._refresh_list()

    def on_task_item_edit_requested(self, event: TaskItem.EditRequested) -> None:
        def handle_edit(task: Optional[Task]) -> None:
            if task:
                self._refresh_list()
        
        self.push_screen(NewTaskModal(task=event.task), handle_edit)

    def on_task_item_delete_requested(self, event: TaskItem.DeleteRequested) -> None:
        def check_confirmation(confirmed: bool) -> None:
            if confirmed:
                self.task_list.remove_task(event.task)
                self._refresh_list()
        
        self.push_screen(ConfirmationModal(f"Delete task '{event.task.name}'?"), check_confirmation)

if __name__ == "__main__":
    app = TaskListApp()
    app.run()