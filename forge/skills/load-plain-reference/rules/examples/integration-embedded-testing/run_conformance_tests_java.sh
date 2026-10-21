#!/bin/bash

# Export Java 21
#export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
#export PATH="$JAVA_HOME/bin:$PATH"
echo "JAVA_HOME: $JAVA_HOME"

# Check if build folder name is provided
if [ -z "$1" ]; then
  printf "Error: No build folder name provided.\n"
  printf "Usage: $0 <build_folder_name> <conformance_tests_folder>\n"
  exit 1
fi

# Check if conformance tests folder name is provided
if [ -z "$2" ]; then
  printf "Error: No conformance tests folder name provided.\n"
  printf "Usage: $0 <build_folder_name> <conformance_tests_folder>\n"
  exit 1
fi

current_dir=$(pwd)

# Resolve the conformance tests folder to an absolute path ($2 may be relative
# on older renderers; newer renderers pass it as an absolute path).
case "$2" in
  /*) CONFORMANCE_TESTS_SOURCE="$2" ;;
  *)  CONFORMANCE_TESTS_SOURCE="$current_dir/$2" ;;
esac

# Scratch folder lives in the system temp directory so no build debris is left
# inside the project. It is removed again when the script exits.
CONFORMANCE_TESTS_FOLDER="/tmp/java_conformance"

trap 'rm -rf "$CONFORMANCE_TESTS_FOLDER"' EXIT

cd "$current_dir" 2>/dev/null

printf "Preparing Java conformance tests subfolder: $CONFORMANCE_TESTS_FOLDER\n"

# Check if the go build subfolder exists
if [ -d "$CONFORMANCE_TESTS_FOLDER" ]; then
  # Find and delete all files and folders
  find "$CONFORMANCE_TESTS_FOLDER" -mindepth 1 -exec rm -rf {} +

  if [ "${VERBOSE:-}" -eq 1 ] 2>/dev/null; then
    printf "Cleanup completed.\n"
  fi
else
  # print the current directory
  printf "Current directory: $(pwd)\n"

  printf "Subfolder does not exist. Creating it...\n"
  mkdir -p $CONFORMANCE_TESTS_FOLDER
fi

printf "Copying all files and folders from $CONFORMANCE_TESTS_SOURCE to $CONFORMANCE_TESTS_FOLDER...\n"
cp -R "$CONFORMANCE_TESTS_SOURCE"/* $CONFORMANCE_TESTS_FOLDER

# Move to the subfolder
printf "Moving to $CONFORMANCE_TESTS_FOLDER...\n"
cd "$CONFORMANCE_TESTS_FOLDER" 2>/dev/null

if [ $? -ne 0 ]; then
  printf "Error: Java conformance tests folder '$CONFORMANCE_TESTS_FOLDER' does not exist.\n"
  exit 2
fi

echo "Running maven install in the conformance tests folder..."
mvn clean install -DskipTests


if [ $? -ne 0 ]; then
  exit 2
fi

echo "Running maven test in the conformance tests folder..."

output=$(mvn test --no-transfer-progress 2>&1)
exit_code=$?

echo "Finished running maven test in the conformance tests folder..."

# Check if no tests were run
if echo "$output" | grep -q 'Tests run: [1-9][0-9]*, Failures: 0, Errors: 0, Skipped: 0'; then
    echo "All tests passed"
    echo "$output"
    exit $exit_code
else
    # Check if no tests were run
    if echo "$output" | grep -q 'Tests run: 0, Failures: 0, Errors: 0, Skipped: 0'; then
        echo "Tests run: 0"
        echo "Error: No tests were executed (Tests run: 0)"
        echo "You are seeing this cause the following appeared in the output: Tests run: 0, Failures: 0, Errors: 0, Skipped: 0"
    else
        echo "Some tests failed, had errors, or were skipped. This is not allowed. All tests must pass."
    fi
fi

# If there was an error, print the output and exit with the error code
if [ $exit_code -ne 0 ]; then
    echo "Error: Maven test failed in the conformance tests folder with exit code $exit_code..."
    echo "$output"
    exit $exit_code
fi

echo "Finished running conformance tests..."
echo "$output"
# Echo the original exit code of the unittest command
exit $exit_code
