#!/bin/bash

# Export Java 21
#export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
#export PATH="$JAVA_HOME/bin:$PATH"
echo "JAVA_HOME: $JAVA_HOME"

# Check if build folder name is provided
if [ -z "$1" ]; then
  printf "Error: No build folder name provided.\n"
  printf "Usage: $0 <build_folder_name>\n"
  exit 1
fi

JAVA_BUILD_SUBFOLDER=../../../

if [ "${VERBOSE:-}" -eq 1 ] 2>/dev/null; then
  printf "Copying generated code to main project folder: $JAVA_BUILD_SUBFOLDER\n"
fi

# Check if the main project folder exists
if [ ! -d "$JAVA_BUILD_SUBFOLDER" ]; then
  echo "Error: Main project folder '$JAVA_BUILD_SUBFOLDER' does not exist."
  exit 2
fi

# clean existing code from the main project folder
rm -rf $JAVA_BUILD_SUBFOLDER/<placeholder for integration code>/*
rm -rf $JAVA_BUILD_SUBFOLDER/<placeholder for integration code tests>/*

# copy generated code to the main project folder
# FIX: added the mkdir lines otherwise it complains that the cp destintation directory does not exist
mkdir -p $JAVA_BUILD_SUBFOLDER/<placeholder for integration code>
mkdir -p $JAVA_BUILD_SUBFOLDER/<placeholder for integration code tests>
cp -R $1/<placeholder for integration code>/* $JAVA_BUILD_SUBFOLDER/<<placeholder for integration code>
cp -R $1/<placeholder for integration code tests>/* $JAVA_BUILD_SUBFOLDER/<placeholder for integration code tests>

# Move to the subfolder
echo "Moving to: $JAVA_BUILD_SUBFOLDER"
cd "$JAVA_BUILD_SUBFOLDER" 2>/dev/null

if [ $? -ne 0 ]; then
  printf "Error: Java build folder '$JAVA_BUILD_SUBFOLDER' does not exist.\n"
  exit 2
fi

# Remove target directory to avoid conflicts
rm -rf ./target || echo "Warning: some files may be locked"

echo "Runinng maven install in the build folder..."
mvn clean install -Dspring-boot.repackage.skip=true -DskipTests
