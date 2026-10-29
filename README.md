# Masaliya

The masaliya.com website, published with GitHub Pages from the `main` branch.

## Adding or changing a product

1. Edit the `PRODUCTS` list (and prices in `PRICES`) in `site.js`.
2. Run `node tools/build-pages.js`. It writes one page per product (for example `dua.html`, served as masaliya.com/dua) with its own title, description and link preview, and refreshes `sitemap.xml`.
3. Commit and push; the site updates within a minute or two.
