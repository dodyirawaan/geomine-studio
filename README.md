# GeoMine Studio

Research writing workspace for **underground mining geotechnics** — rockburst & mining-induced seismicity, ground support & tunnels, and ML/DL modelling — aimed at Q1 journals (IJRMMS, TUST, RMRE, IJMST, JRMGE).

Live: https://dodyirawaan.github.io/geomine-studio/

## Features (Phase 1)

- **Multi-provider AI chat** with streaming: Anthropic (Claude), OpenAI, Google Gemini, OpenRouter. Model lists are fetched live from each provider.
- **Mining-oriented agents**: Research Assistant, Literature Analyst, Gap & Novelty Finder, Methods Writer, Results & Discussion, ML/DL Modelling, Reviewer 2 Simulator, Language Polisher.
- **Target-journal profiles** injected into the system prompt.
- **Integrity rules** baked in: no invented data, uncertain references flagged `[VERIFY]`, missing data flagged `[DATA NEEDED: …]`.
- **Encrypted key vault**: API keys are AES-256-GCM encrypted in the browser with your passphrase and sent only to their own provider.
- Conversations stored locally in IndexedDB; Markdown, tables and LaTeX (KaTeX) rendering.

## Features (Phase 2)

- **Manuscript editor** with Q1 templates: research (IMRaD) or review article, with Highlights, Abstract, Keywords and the publisher's declarations (Elsevier CRediT/competing interest/data/AI-use, or Springer Nature statements).
- **AI co-author per section**: draft from notes, revise, polish, or get a Reviewer 2 critique. The model sees the whole manuscript and your reference keys, and marks gaps as `[DATA NEEDED: …]` / `[VERIFY: …]`. One-step undo after replacing text.
- **Citations** as `[@key]` / `[@a; @b]` from a pasted BibTeX library, with checks for missing and duplicate keys.
- **Export**: Word (.docx) with native equations, three-line tables, line numbers and an author–year reference list; LaTeX project (.zip) for `elsarticle` or Springer `sn-jnl` with `references.bib`; Markdown; BibTeX.
- Highlight length checker (≤ 85 characters), word counts per section, autosave in IndexedDB.

## Features (Phase 3)

- **Literature search** on OpenAlex (title/abstract, year range, most relevant/cited/newest). Free without a key; an optional OpenAlex API key in Settings raises the daily quota.
- **Local library**: add from search, by DOI, or by importing PDFs (the DOI printed in the PDF is used to fetch metadata). Tags, notes, citation keys, BibTeX export.
- **Reference verification** in each manuscript: every BibTeX entry is checked against Crossref (DOI resolves, title/year/first author match); missing DOIs are suggested and can be added in one click. Library papers can be added to a manuscript's references directly.
- **Literature matrix**: the AI extracts site/depth, rock properties, methods, data, findings and limitations per paper from the PDF text or abstract ("not reported" when absent), then synthesises themes and gaps. CSV and Markdown export.
- **Ask the library**: questions answered from your own PDFs and abstracts, with passages retrieved locally (BM25) and citations as `[@key, p. N]`.

Many publishers (including Elsevier) do not share abstracts with OpenAlex or Crossref, so attach the PDF to build a matrix row for those papers.

## Privacy model

This is a static site with no backend. Your keys, chats, manuscripts and PDFs never leave your browser except for the requests you make to the AI provider you chose and the metadata lookups sent to OpenAlex and Crossref (search terms, DOIs and reference titles). Use API keys with a spending limit.

## Development

```bash
npm install
npm run dev      # http://localhost:5173/geomine-studio/
npm run build
```

## Deploy

Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and publishes to GitHub Pages. In the repository settings, set **Pages → Source** to **GitHub Actions** once.

## Roadmap

1. ✅ Foundation — key vault, multi-provider chat, mining agents
2. ✅ Manuscript editor & Q1 templates — IMRaD editor, DOCX + LaTeX + BibTeX export
3. ✅ Literature — OpenAlex/Crossref search, DOI verification, literature matrix, PDF RAG
4. Methods library — RMR/Q/GSI/Hoek–Brown, rockburst criteria, support design calculators
5. Automation pipeline — idea → draft → Reviewer 2 → revision, consistency checker, Q1 checklist
6. Sync & polish — private GitHub sync, version history, cost tracking, PWA
