# Outfit Lab

Outfit drafts driven by weather and trip context—static HTML, CSS, and ES modules.

## GitHub Pages

1. Push this repo to GitHub (or upload the files).
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set Source to **Deploy from a branch**, branch **main** (or your default), folder **/ (root)**.
4. After a minute or two, the site is usually at `https://<username>.github.io/<repo>/`

The **`.nojekyll`** file at the repo root disables Jekyll so paths with leading underscores are not dropped later.

## Local preview

```bash
python3 -m http.server 8080
```

Open `http://127.0.0.1:8080` in a browser. Do not open `index.html` via `file://` or ES modules will be blocked.
