#!/usr/bin/env bash
#
# Sets up this repository folder with every tool and setting it needs to build, run, and test
# locally. Run it from any directory after cloning, and again whenever it changes:
#
#   ./setup.sh
#
# Idempotent: each step converges to the same state however many times it runs.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# Git: merges always make a merge commit, and pulls never rebase. A pull that is only behind
# fast-forwards; a pull that has diverged makes a merge commit.
git config merge.ff false
git config pull.ff true
git config pull.rebase false

echo "Repository set up in $(pwd)."
