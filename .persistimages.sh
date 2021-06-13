#!/bin/sh

cp _site/img/remote/* src/img/remote/
cp _site/img/* src/img/
git status
git add src/img/
git commit -m "Persist images"
