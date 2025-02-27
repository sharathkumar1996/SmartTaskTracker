#!/bin/bash
echo "Starting to populate test data..."
npx tsx server/scripts/populateTestData.ts
echo "Test data population script execution complete!"