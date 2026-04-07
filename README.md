# tw-pubconnector

tw-pubconnector is a TiddlyWiki plugin for literature-centric research workflows. It connects publication metadata, article reading, citation tracking, and browser-assisted capture into one workflow that can be published as a normal TiddlyWiki site.

## What It Does

- Sync colleague publication data from ORCID, OpenAlex, Google Scholar, Web of Science, Scopus.
- Import BibTeX entries and attach author tags automatically from DOI lookups through [PubConnector](https://github.com/byzheng/PubConnector).
- Upload saved publisher HTML and open cleaned article pages inside TiddlyWiki through integration with chrome extension [SingleFile](https://chromewebstore.google.com/detail/singlefile/mpiodijhokgodhhofbcjdecpffjipkle) and [PubConnector](https://github.com/byzheng/PubConnector).
- Read article pages with highlights, notes, note review, font controls, and domain auto-linking.
- Show recent literature, references, citations, and saved highlight notes with widgets.
- Track recent citations for watched papers or colleagues with Citation Watch.
- Integrate with the Chrome extension [PubConnector](https://github.com/byzheng/PubConnector) for browser-side actions such as opening tiddlers, importing items, and handling image capture workflows.

## Main Feature Areas

### Authoring And Publication Sync

The plugin treats tiddlers tagged `Colleague` as author profiles and uses platform-specific fields such as 

* `orcid` for [ORCID](https://orcid.org/)
* `openalex` for [OpenAlex](https://openalex.org/)
* `google-scholar` for [Google Scholar](https://scholar.google.com/)
* `researcherid` for [ResearcherID](https://www.researcherid.com/)
* `scopus` for [Scopus](https://www.scopus.com/)

Cached data is reused to reduce repeated requests, and scheduled updates can be enabled from the Control Panel.

### Literature Import And Reader

BibTeX can be posted to the `/literatures` route to create `bibtex-entry` tiddlers. Saved publisher HTML can be uploaded to `/literature/upload-html`, matched back to a DOI, and reopened through `/literature/article/<title>` in a cleaner reading view. [PubConnector](https://github.com/byzheng/PubConnector) and [SingleFile](https://chromewebstore.google.com/detail/singlefile/mpiodijhokgodhhofbcjdecpffjipkle) work well together for this capture flow.

The article reader includes:

- text highlights with categories
- inline notes with rendered wikitext
- a note review widget
- auto-linking using a configurable TiddlyWiki filter
- per-paragraph first-match control, aliases, and ignore rules
- article font controls

### Widgets

The plugin ships user-facing widgets for:

- latest literature lists
- highlight note review for a saved article
- browser message and image helper workflows

### Citation Watch

Citation Watch monitors papers and colleagues tagged with a configured watch tag and retrieves recent citations, currently via OpenAlex-backed lookups in the plugin workflow.

## Documentation

- Online documentation and demo: https://tw-pubconnector.bangyou.me
- Source repository: https://github.com/byzheng/tw-pubconnector
- Plugin documentation entry point in the published wiki: `tw-pubconnector for TiddlyWiki`
- Tutorial hub in the published wiki: `tw-pubconnector Tutorial`

## Requirements

- TiddlyWiki on Node.js for the server routes
- The BibTeX plugin for BibTeX import workflows
- Optional API keys for platforms such as Web of Science and Scopus
- Chrome extension [PubConnector](https://github.com/byzheng/PubConnector) for browser-assisted workflows such as Scholar capture and image handling

## Development Tests

These tests are for local development only and are not required for plugin deployment.

- Run on Windows: `scripts\\test.bat`
