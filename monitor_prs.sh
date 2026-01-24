#!/bin/bash
echo "Starting PR monitor for $(pwd)..."
while true; do
  # Capture the list of PRs (limit 1 is enough to detect existence)
  # using default format which is human readable, or json would be fine too.
  # If there are no PRs, stdout is usually empty or "no pull requests match".
  # We use --json number to be sure we get a valid JSON array or empty.
  
  # Actually, just checking if 'gh pr list' returns non-empty output is robust enough for standard text output
  # providing we capture stdout. gh usually prints 'no pull requests' to stderr? 
  # Let's use json to be safer against formatting changes.
  
  prs=$(gh pr list --limit 1 --json number)
  
  # if "[]" (empty json array) or empty string
  if [[ "$prs" != "[]" && -n "$prs" ]]; then
      echo "PR Detected!"
      echo "$prs"
      exit 0
  fi
  
  echo "$(date): No PRs found. Sleeping 180s..."
  sleep 180
done
