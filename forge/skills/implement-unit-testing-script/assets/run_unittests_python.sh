#!/bin/bash

UNRECOVERABLE_ERROR_EXIT_CODE=69

# Check if subfolder name is provided
if [ -z "$1" ]; then
  echo "Error: No subfolder name provided."
  echo "Usage: $0 <subfolder_name>"
  exit $UNRECOVERABLE_ERROR_EXIT_CODE
fi

current_dir=$(pwd)
echo "Current directory: $current_dir"
echo "Build folder name: $1"
echo "--------------------------------"

# Try to find Python interpreter (python3 first, then python)
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    printf "Error: Python interpreter not found. Please install Python.\n"
    exit $UNRECOVERABLE_ERROR_EXIT_CODE
fi

# Working folder lives in the system temp directory. $1 may be an absolute
# path, so only its basename is used to build the working folder name.
PYTHON_BUILD_SUBFOLDER="/tmp/python_$(basename "$1")"

trap 'rm -rf "$PYTHON_BUILD_SUBFOLDER"' EXIT

if [ "${VERBOSE:-}" -eq 1 ] 2>/dev/null; then
  printf "Preparing Python build subfolder: $PYTHON_BUILD_SUBFOLDER\n"
fi

rm -rf "$PYTHON_BUILD_SUBFOLDER"
mkdir -p "$PYTHON_BUILD_SUBFOLDER"

cp -R "$1"/* "$PYTHON_BUILD_SUBFOLDER"

# Move to the subfolder
cd "$PYTHON_BUILD_SUBFOLDER" 2>/dev/null

if [ $? -ne 0 ]; then
  printf "Error: Python build folder '$PYTHON_BUILD_SUBFOLDER' does not exist.\n"
  exit $UNRECOVERABLE_ERROR_EXIT_CODE
fi

printf "Creating and activating virtual environment...\n"

# Time the virtual environment creation and activation
start_time=$(date +%s.%N)

VENV_DIR=".venv"

if ! $PYTHON_CMD -m venv "$VENV_DIR"; then
    printf "Error: Failed to create virtual environment in '$VENV_DIR'.\n"
    exit $UNRECOVERABLE_ERROR_EXIT_CODE
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

if [ $? -ne 0 ]; then
    printf "Error: Failed to activate virtual environment at '$VENV_DIR/bin/activate'.\n"
    exit $UNRECOVERABLE_ERROR_EXIT_CODE
fi

# Install requirements if requirements.txt exists
if [ -f "requirements.txt" ]; then
    pip install --upgrade pip
    pip install -r requirements.txt
else
    echo "Error: requirements.txt not found. Cannot proceed with setting up requirements."
fi

end_time=$(date +%s.%N)

# Calculate and display the time taken
duration=$(echo "$end_time - $start_time" | bc)
printf "Requirements setup completed in %.2f seconds\n\n" "$duration"


# Execute all Python unittests in the subfolder
echo "Running Python unittests in $PYTHON_BUILD_SUBFOLDER..."

output=$(python -m unittest discover -b -v 2>&1)
exit_code=$?

# Echo the original output
echo "$output"

# Return the exit code of the unittest command
exit $exit_code

# Note: The 'discover' option automatically identifies and runs all unittests in the current directory and subdirectories
# Ensure that your Python files are named according to the unittest discovery pattern (test*.py by default)