# neupaneaayush.com.np

Personal website of Aayush Neupane — a hand-built static site (plain HTML, CSS, and
vanilla JS, no framework or build step). Deployed to GitHub Pages.

## Structure

```
index.html          Home (profile, about, news, publications, experience, projects, writing)
blog.html           All posts, with category filters
post.html           Renders a single post: post.html?p=<slug>
css/styles.css      All styles (light + dark themes via CSS variables)
js/
  site.js           Theme toggle, nav shadow, scroll reveals (shared)
  home.js           Builds the homepage "Writing" list from posts.json
  blog.js           Builds the blog index + filters from posts.json
  post.js           Loads a post's Markdown and renders it (marked + highlight.js + KaTeX)
posts/
  posts.json        Post manifest (title, date, category, summary, slug)
  <slug>/index.md   One folder per post, images alongside
assets/             Avatar, favicons
files/              Resume.pdf, CV.pdf
vendor/             Local copies of marked, highlight.js, KaTeX (no CDN dependency)
```

## Add a blog post

1. Create `posts/<slug>/index.md` (Markdown; drop any images in the same folder).
2. Add an entry to the top of `posts/posts.json`:

   ```json
   { "slug": "<slug>", "title": "…", "date": "YYYY-MM-DD",
     "category": "…", "summary": "…", "math": false }
   ```

   Set `"math": true` if the post uses `$…$` / `$$…$$` LaTeX.

That's it — the homepage list, the blog index, and the post page all pick it up. No rebuild.

## Run locally

Any static file server works (the pages `fetch()` local files, so `file://` won't work):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which publishes the repo to
GitHub Pages. The custom domain is set in `CNAME`.
