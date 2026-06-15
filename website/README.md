# Lookspan — Landing page

Sitio estático (sin build) de marketing para Lookspan. HTML + CSS + JS vanilla,
con la **identidad de marca Fervon**: fondo carbón (`#0e0b0a`), acentos de fuego
ámbar/ember (`#ffb02e` / `#ff6a00`), tipografía del sistema + JetBrains Mono para
código. Vive fuera de los workspaces npm del monorepo, así que no interfiere con
`npm run build`. Forjado al rojo vivo.

## Estructura

```
website/
├── index.html      # Landing completa (hero, características, integraciones, costes, CTA)
├── styles.css      # Estilos (tema oscuro, responsive, prefers-reduced-motion)
├── main.js         # i18n, copiar al portapapeles, tabs de código, menú móvil, reveal on scroll
├── i18n.js         # Diccionario de traducciones (es / en)
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

## Idiomas (i18n)

La landing es bilingüe **español / inglés** con **autodetección**:

- Al cargar, lee `navigator.language`: si empieza por `es` muestra español, en
  cualquier otro caso inglés. La preferencia se guarda en `localStorage`
  (`lookspan-lang`) y tiene prioridad sobre la autodetección.
- El conmutador **ES / EN** del header (y del menú móvil) permite cambiar a mano.
- El HTML se sirve en español como *fallback* (para crawlers y navegación sin JS);
  `main.js` intercambia los textos según el idioma detectado/elegido.

Para **editar o añadir traducciones**, toca `i18n.js`: cada clave tiene su versión
`es` y `en`. En el HTML, el texto traducible lleva `data-i18n="clave"` (contenido)
o `data-i18n-aria="clave"` (atributo `aria-label`). Los valores admiten HTML inline
(`<strong>`, `<code>`, `<span>`). Para añadir un **tercer idioma**, replica el bloque
de claves bajo una nueva clave de idioma y ajusta la detección en `main.js`.

## Personalizar

- **Textos y traducciones:** `i18n.js` (es / en); marca nuevos nodos con `data-i18n` en `index.html`.
- **Colores / espaciados / radios:** variables CSS en `:root` (`styles.css`).
- **URL del repo:** busca `JoniMartin27/lookspan` en `index.html`.
- **Ejemplos de código:** los `<pre class="tab-panel">` de la sección Integraciones.

## Desplegar

Es estático: sube la carpeta `website/` a GitHub Pages, Netlify, Vercel o Cloudflare
Pages. No hay paso de compilación.
