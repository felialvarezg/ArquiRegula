#!/bin/bash
# Wrapper que mantiene el dev server de Next.js corriendo.
# Reinicia si el proceso muere.
cd /home/z/my-project
while true; do
  node /home/z/my-project/node_modules/next/dist/bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[wrapper] next dev salió con código $?. Reiniciando en 3s..." >> /home/z/my-project/dev.log
  sleep 3
done
