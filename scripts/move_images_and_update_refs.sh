#!/usr/bin/env bash
set -euo pipefail

# Script seguro para mover imágenes del root a assets/images
# USO: revisar y ejecutar desde la raíz del repo:
#   cd /ruta/a/luxto-nsp && bash scripts/move_images_and_update_refs.sh

TS=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backup_before_reorg_$TS"
mkdir -p "$BACKUP_DIR"

echo "Haciendo copia de seguridad rápida de archivos html/js/md..."
# Guardamos copias de los archivos que vamos a modificar
find . -maxdepth 1 -type f \( -iname "*.html" -o -iname "*.js" -o -iname "*.md" \) -exec cp --parents {} "$BACKUP_DIR" \;

mkdir -p assets/images

# Mover imágenes del root (no recursivo)
shopt -s nullglob
IMGS=( *.jpg *.jpeg *.png *.gif *.webp *.svg )
if [ ${#IMGS[@]} -eq 0 ]; then
  echo "No se detectaron imágenes en la raíz. Nada que mover."
  exit 0
fi

echo "Moviendo imágenes a assets/images/"
for img in "${IMGS[@]}"; do
  echo "  -> $img"
  mv -v -- "$img" assets/images/
done

# Actualizar referencias en HTML/JS/MD
echo "Actualizando referencias en .html, .js y .md"
for img in assets/images/*; do
  name=$(basename "$img")
  # Buscar en archivos relevantes y reemplazar solo coincidencias exactas del nombre de archivo
  files=$(grep -RIl --exclude-dir=.git --include="*.html" --include="*.js" --include="*.md" --exclude-dir=assets "$name" . || true)
  if [ -z "$files" ]; then
    continue
  fi
  for f in $files; do
    echo "  Actualizando $f -> $name"
    # Reemplaza src="name" o href="name" o content="name" o url(name)
    sed -i "s/\b$name\b/assets\/images\/$name/g" "$f" || true
  done
done

# Comprobación básica (más robusta)
echo "Comprobando referencias rotas (buscando referencias a assets/images/ que no existan)..."
MISSING=0
# Recolecta referencias encontradas en archivos (una por línea) de forma segura
mapfile -t REFS < <(grep -R --exclude-dir=.git -Eo "assets/images/[A-Za-z0-9._%:\-\+\,]+" . || true)
for ref in "${REFS[@]}"; do
  file="${ref#assets/images/}"
  if [ -z "$file" ]; then
    continue
  fi
  if [ ! -f "assets/images/$file" ]; then
    echo "  Referencia rota detectada: assets/images/$file"
    MISSING=$((MISSING+1))
  fi
done

if [ $MISSING -ne 0 ]; then
  echo "Se detectaron referencias faltantes: $MISSING. Revisa los archivos manualmente."
else
  echo "Migración completada. Se movieron ${#IMGS[@]} imágenes y se actualizaron referencias."
fi

echo "Backup de archivos modificados creado en: $BACKUP_DIR"

echo "Listo. Revisa localmente y ejecuta pruebas del sitio (por ejemplo abrir en navegador o desplegar)."
