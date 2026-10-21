#!/bin/bash

# Export Java 21
#export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
#export PATH="$JAVA_HOME/bin:$PATH"
echo "JAVA_HOME: $JAVA_HOME"

# Check if subfolder name is provided
if [ -z "$1" ]; then
  echo "Error: No subfolder name provided."
  echo "Usage: $0 <subfolder_name>"
  exit 1
fi
# FIX: Changed this line from "../../" to "../../.." to go up three levels to the main project folder
MAIN_PROJECT_FOLDER="$(cd "$(dirname "$0")/../../.." && pwd)"

if [ "${VERBOSE:-}" -eq 1 ] 2>/dev/null; then
  printf "Copying generated code to main project folder: $MAIN_PROJECT_FOLDER\n"
fi

# Check if the main project folder exists
if [ ! -d "$MAIN_PROJECT_FOLDER" ]; then
  echo "Error: Main project folder '$MAIN_PROJECT_FOLDER' does not exist."
  exit 2
fi

# clean existing code from the main project folder
rm -rf $MAIN_PROJECT_FOLDER/<placeholder for integration code>/*
rm -rf $MAIN_PROJECT_FOLDER/<placeholder for integration code tests>/*

# copy generated code to the main project folder
# FIX: added the mkdir lines otherwise it complains that the cp destintation directory does not exist
mkdir -p $MAIN_PROJECT_FOLDER/<placeholder for integration code>
mkdir -p $MAIN_PROJECT_FOLDER/<placeholder for integration code tests>
cp -R $1/<placeholder for integration code>/* $MAIN_PROJECT_FOLDER/<placeholder for integration code>
cp -R $1/<placeholder for integration code tests>/* $MAIN_PROJECT_FOLDER/<placeholder for integration code tests>

# Move to the subfolder
# FIX: added this line to print the current directory to help the LLM
echo "Moving to: $MAIN_PROJECT_FOLDER"
cd "$MAIN_PROJECT_FOLDER" 2>/dev/null

if [ $? -ne 0 ]; then
  printf "Error: Java build folder '$MAIN_PROJECT_FOLDER' does not exist.\n"
  exit 2
fi


# Execute all Java unittests in the subfolder
echo "Running Java unittests in $1..."
mvn test -Dtest='<placeholder for integration code tests package>.**.*Test' checkstyle:check
