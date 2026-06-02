# Lookspan — Landing page

Sitio estático (sin build) de marketing para Lookspan. HTML + CSS + JS vanilla,
tema oscuro con el acento púrpura de la marca (`#8b5cf6`) y tipografías Inter +
JetBrains Mono. Vive fuera de los workspaces npm del monorepo, así que no
interfiere con `npm run build`.

## Estructura

```
website/
├── index.html      # Landing completa (hero, características, integraciones, costes, CTA)
├── styles.css      # Estilos (tema oscuro, responsive, prefers-reduced-motion)
├── main.js         # Copiar al portapapeles, tabs de código, menú móvil, reveal on scroll
├── favicon.svg     # Marca (waterfall de spans)
└── og-cover.svg    # Imagen Open Graph / Twitter (1200×630)
```

## Ver en local

No requiere instalación. Sírvelo con cualquier servidor estático (no lo abras con
`file://`, el menú móvil y las fuentes funcionan mejor por HTTP):

```bash
npx serve website
# o
python -m http.server 8000 --directory website
```

## Personalizar

- **Textos y secciones:** `index.html`.
- **Colores / espaciados / radios:** variables CSS en `:root` (`styles.css`).
- **URL del repo:** busca `JoniMartin27/lookspan` en `index.html`.
- **Ejemplos de código:** los `<pre class="tab-panel">` de la sección Integraciones.

## Desplegar

Es estático: sube la carpeta `website/` a GitHub Pages, Netlify, Vercel o Cloudflare
Pages. No hay paso de compilación.
