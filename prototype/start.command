#!/bin/zsh
cd "$(dirname "$0")"
open "http://localhost:5180"
python3 -m http.server 5180
