from typing import Optional
from textual import events
from textual.app import ComposeResult
from textual.widgets import Static, Input, Button, Label
from textual.containers import Vertical, Horizontal
from textual.screen import ModalScreen
from domain import Task
from datetime import date, datetime
from rich.text import Text

class TaskCheckbox(Button):
    """Simple focusable checkbox button rendering [ ] or [x]."""
    def __init__(self, value: bool, **kwargs):
        self.value = value
        label = f"[{'x' if value else ' '}]"
        super().__init__(Text(label), **kwargs)

class TaskItem(Vertical):
    """Widget representing a single task item in the list."""

    class DeleteRequested(events.Event):
        """Event fired when the delete icon is clicked."""
        def __init__(self, task: Task):
            self.task = task
            super().__init__()

    class EditRequested(events.Event):
        """Event fired when the edit icon is clicked."""
        def __init__(self, task: Task):
            self.task = task
            super().__init__()

    def __init__(self, task_data: Task, **kwargs):
        self.task_data = task_data
        super().__init__(**kwargs)
        if self.task_data.completed:
            self.add_class("completed")

    def compose(self) -> ComposeResult:
        with Horizontal(classes="task-item-header"):
            yield TaskCheckbox(self.task_data.completed, classes="task-checkbox")
            yield Button(Text(self.task_data.name), classes="task-title")
            yield Button("✎", classes="edit-icon")
            yield Button("🗑", classes="delete-icon", id=f"delete-{id(self.task_data)}")
        
        if self.task_data.notes:
            yield Static(self.task_data.notes, classes="task-description", markup=False)
        
        if self.task_data.due_date:
            day = self.task_data.due_date.day
            month = self.task_data.due_date.strftime("%b")
            formatted_date = f"{day}. {month}"
            yield Static(formatted_date, classes="task-date")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.has_class("edit-icon"):
            self.post_message(self.EditRequested(self.task_data))
        elif event.button.has_class("delete-icon"):
            self.post_message(self.DeleteRequested(self.task_data))
        elif event.button.has_class("task-checkbox"):
            self.task_data.completed = not self.task_data.completed
            event.button.label = Text(f"[{'x' if self.task_data.completed else ' '}]")
            if self.task_data.completed:
                self.add_class("completed")
            else:
                self.remove_class("completed")

class ConfirmationModal(ModalScreen):
    """Modal for confirming an action."""

    def __init__(self, message: str, **kwargs):
        self.message = message
        super().__init__(**kwargs)

    def compose(self) -> ComposeResult:
        with Vertical(id="confirm-modal-container"):
            yield Label(self.message, id="confirm-message")
            with Horizontal(id="modal-actions"):
                yield Button(Text("[ Cancel ]"), variant="default", id="confirm-cancel-btn")
                yield Button(Text("[ Delete ]"), variant="error", id="confirm-ok-btn")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "confirm-cancel-btn":
            self.dismiss(False)
        elif event.button.id == "confirm-ok-btn":
            self.dismiss(True)

class NewTaskModal(ModalScreen):
    """Modal for adding a new task."""

    def __init__(self, task: Optional[Task] = None, **kwargs):
        self.task_data = task
        super().__init__(**kwargs)

    def compose(self) -> ComposeResult:
        title = "Edit Task" if self.task_data else "Add New Task"
        with Vertical(id="modal-container"):
            yield Label(title, id="modal-title")
            
            yield Label("Task name", classes="field-label")
            yield Input(value=self.task_data.name if self.task_data else "", placeholder="Name", id="task-name-input")
            
            yield Label("Description", classes="field-label")
            yield Input(value=self.task_data.notes if self.task_data else "", placeholder="This is...", id="task-desc-input")
            
            yield Label("Due Date", classes="field-label")
            default_date = self.task_data.due_date.isoformat() if self.task_data and self.task_data.due_date else date.today().isoformat()
            yield Input(value=default_date, placeholder="YYYY-MM-DD", id="task-date-input")
            
            yield Label("", id="modal-error", markup=False)
            
            with Horizontal(id="modal-actions"):
                yield Button(Text("[ Cancel ]"), variant="default", id="cancel-btn")
                yield Button(Text("[ Save ]"), variant="primary", id="save-btn")

    def on_mount(self) -> None:
        self.query_one("#task-name-input").focus()

    def on_focus(self, event: events.Focus) -> None:
        if isinstance(event.control, Input):
            self.call_after_refresh(event.control.select_all)

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.control.id == "task-name-input":
            self.query_one("#task-desc-input").focus()
        elif event.control.id == "task-desc-input":
            self.query_one("#task-date-input").focus()
        elif event.control.id == "task-date-input":
            self.query_one("#save-btn", Button).press()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "cancel-btn":
            self.dismiss(None)
        elif event.button.id == "save-btn":
            name = self.query_one("#task-name-input", Input).value.strip()
            notes = self.query_one("#task-desc-input", Input).value.strip()
            date_str = self.query_one("#task-date-input", Input).value.strip()
            
            try:
                if len(name) < 3:
                    raise ValueError("Task name must be at least 3 characters long.")
                
                due_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else None
                
                if self.task_data:
                    self.task_data.name = name
                    self.task_data.notes = notes
                    self.task_data.due_date = due_date
                    self.dismiss(self.task_data)
                else:
                    new_task = Task(name=name, notes=notes, due_date=due_date)
                    self.dismiss(new_task)
            except ValueError as e:
                error_label = self.query_one("#modal-error", Label)
                error_label.update(str(e))
                self.app.notify(str(e), severity="error")

class TaskListHeader(Static):
    """Custom widget for the header section based on specification."""
    def __init__(self, **kwargs):
        super().__init__("Task List App", **kwargs)