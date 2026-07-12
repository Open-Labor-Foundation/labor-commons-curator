#!/bin/bash
# Fetch schema from public authority source and generate types
SCHEMA_URL='https://raw.githubusercontent.com/JSON-Schema-Validator/JSON-Schema-Tests/master/remotes/draft-07/schema.json'
OUTPUT_DIR='./src/generated'

mkdir -p $OUTPUT_DIR
curl -s $SCHEMA_URL > $OUTPUT_DIR/schema.json
npx json2ts $OUTPUT_DIR/schema.json --output $OUTPUT_DIR/types.ts